// Copyright Sapling.ai 2022--present
// All Rights Reserved

var SUGGEST_COLLECT_ONLY = false;
if (typeof window.SAPLING_SUGGEST_PLUGIN === 'undefined') {
  window.SAPLING_SUGGEST_PLUGIN = 'loaded';
}

const CHAT_CONTAINER_SELECTOR = '[class^=TranscriptWrapper]:visible';
const CHAT_RESPONSE_CONTAINER_SELECTOR = '[class^=ContactActionBarWrapper]';
const CHAT_INPUT_SELECTOR = '[class^=ChatComposerWrapper] textarea:visible,[class^=ChatComposerWrapper] [class~="public-DraftEditor-content"][contenteditable="true"]:visible';

var agentLastReplied = (typeof agentLastReplied === 'undefined') ? {} : agentLastReplied;
var customerLastReplied = (typeof customerLastReplied === 'undefined') ? {} : customerLastReplied;
var chatEntryCount = (typeof chatEntryCount === 'undefined') ? {} : chatEntryCount; // Track number of messages in a session
var SUGGEST_HELPERS = (typeof SUGGEST_HELPERS === 'undefined') ? {} : SUGGEST_HELPERS;

function secondsSinceEpoch() {
  const now = new Date();
  const utcMillisecondsSinceEpoch = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  const utcSecondsSinceEpoch = Math.round(utcMillisecondsSinceEpoch / 1000);
  return utcSecondsSinceEpoch;
}

function _getSessionId() {
  let sessionId = $('[class*=ActiveContactLink]:visible');
  if (sessionId) sessionId = sessionId.attr('id');
  if (typeof sessionId !== 'undefined') sessionId = sessionId.replace('chat-', '');
  if (!sessionId) sessionId = $('[data-testid="ccp-end-contact-button"]:visible').attr('data-node-id');
  if (typeof sessionId !== 'undefined') sessionId = sessionId.replace('ccp-end-contact-button-', '');
  if (!sessionId) sessionId = '';

  if (!sessionId) {
    sessionId = '';
    console.warn('Couldn\'t get session ID');
  }
  return sessionId;
}

function _getVisitorName() {
  return $('button[aria-selected="true"] [id^="chat-participant"]:visible').first().text().trim();
}

function _getAgentName() {
  // Just use {{first_name}} in template

  let agentName = $(CHAT_CONTAINER_SELECTOR).find('[class^=MessageBox] div[direction=Outgoing][class^=Sender]').first().text().trim();
  if (!agentName) agentName = '{{first_name}}';
  return agentName;
}

function getContextOverride() {
  // TODO Update this with more relevant info
  let ret = {};
  ret.session_id = _getSessionId();
  ret.visitor = _getVisitorName();
  let clientFirstName = null;
  if (ret.visitor) clientFirstName = ret.visitor.split(' ')[0];
  ret.templates = { client_first_name: clientFirstName };
  ret.agent_name = _getAgentName();
  return ret;
}

function observeChatEventsOverride(
    chatObserver,
    contentMutationCfg,
    updateSuggestCallback,
    processSuggestSendEventCallback) {
  let chat_log = $(CHAT_CONTAINER_SELECTOR)[0];
  // Sometimes messages loaded after log
  let chat_message = $(CHAT_CONTAINER_SELECTOR).find('[class^=MessageBox]')[0];
  if (!chat_log || !chat_message) {
    console.log("Didn't find chat log or chat log not yet loaded");
    setTimeout(function() {
      observeChatEventsOverride(
        chatObserver,
        contentMutationCfg,
        updateSuggestCallback,
        processSuggestSendEventCallback,
      );
    }, 1000);
    return;
  }

  chatObserver.disconnect();
  chatObserver.observe(chat_log, contentMutationCfg);

  //setupChatPosition();
  //setupConfirmEndChat();
  // No longer works, no variable containing time since chat start
  //setupAgentIdle();

  if (updateSuggestCallback) {
    updateSuggestCallback();
  }

  chrome.runtime.sendMessage({
    action: 'background/get_suggest_helpers',
    hostname: window.location.hostname,
  }, (response) => {
    if (!response || !response.data) {
      return;
    }
    SUGGEST_HELPERS = response.data;
  });
}

function getHelperResponsesOverride() {
  if (!$('[class*=ActiveContactLink]:visible [class^=TabContactStatus]:contains("Connected")')) {
    return [];
  }
  let num_chat_messages = $(CHAT_CONTAINER_SELECTOR).find('[class^=MessageBox]').length;
  let sessionId = _getSessionId();
  // Clear out messages, unsure this is necessary
  if (!num_chat_messages) {
    delete agentLastReplied[sessionId];
    delete customerLastReplied[sessionId];
    return [];
  }
  let agent_chat_entries = $(CHAT_CONTAINER_SELECTOR).find('div[class^=MessageBox] div[direction="Outgoing"][class^="Body"]');
  if (!agent_chat_entries.length) {
    delete agentLastReplied[sessionId];
  }

  let aLastReplied = agentLastReplied[sessionId];
  let cLastReplied = customerLastReplied[sessionId];

  let helper_responses = [];

  let direction = getLastDirection();
  let lastResponded = '';
  if (direction == 'Outgoing') lastResponded = 'agent';
  if (direction == 'Incoming') lastResponded = 'visitor';

  let visitorFirstName = _getVisitorName();
  if (!visitorFirstName) visitorFirstName = 'there';
  visitorFirstName = visitorFirstName.split(' ')[0];

  let cLastMessageTimeSeconds = 0;
  let aLastMessageTimeSeconds = 0;
  if (cLastReplied) {
    cLastMessageTimeSeconds = (secondsSinceEpoch() - cLastReplied);
  }
  if (aLastReplied) {
    aLastMessageTimeSeconds = (secondsSinceEpoch() - aLastReplied);
  }

  //console.log('c a last message (s)');
  //console.log(cLastMessageTimeSeconds);
  //console.log(aLastMessageTimeSeconds);

  let agentName = _getAgentName();

  if (lastResponded === 'agent') {
    for (let idx in SUGGEST_HELPERS.connected) {
      let helper = SUGGEST_HELPERS.connected[idx];
      if (helper.delay <= aLastMessageTimeSeconds) {
        helper_responses.push({
          id: `helper_${helper.id}`,
          doc: helper.text,
          'confidence': null,
        });
      }
    }
  } else if (lastResponded === 'visitor') {
    let waitOptions = [];
    for (let idx in SUGGEST_HELPERS.hold) {
      let helper = SUGGEST_HELPERS.hold[idx];
      if (helper.delay <= cLastMessageTimeSeconds) {
        waitOptions.push({
          id: `helper_${helper.id}`,
          doc: helper.text,
          'confidence': null,
        });
      }
    }
    // Randomly sample, # TODO sample from other helper types as well?
    if (waitOptions.length) {
      const selectedWaitOption = waitOptions[(new Date()).getMinutes() %  waitOptions.length];
      helper_responses.push(selectedWaitOption);
    }
  }
  let agentRespondedCount = agent_chat_entries.length;

  let sentGreeting = false;
  for (let idx in SUGGEST_HELPERS.greeting) {
    let helper = SUGGEST_HELPERS.greeting[idx];
    let formattedText = helper.text;
    // formattedText = formattedText.replaceAll(/{{\s?teamName\s?}}/g, teamName);
    formattedText = formattedText.replaceAll(/{{\s?agentName\s?}}/g, agentName);
    formattedText = formattedText.replaceAll(/{{\s?visitorFirstName\s?}}/g, visitorFirstName);
    helper.formattedText = formattedText;
    if (agent_chat_entries.length) {
      for (const agentChatEntry of agent_chat_entries) {
        if ($(agentChatEntry).text().includes(formattedText)) {
          sentGreeting = true;
        }
      }
    }
  }

  for (let idx in SUGGEST_HELPERS.greeting) {
    if (sentGreeting) break;
    let helper = SUGGEST_HELPERS.greeting[idx];
    if (helper.max_messages != null &&
        agentRespondedCount > helper.max_messages) {
      continue;
    }
    if (helper.min_messages != null &&
        agentRespondedCount < helper.min_messages) {
      continue;
    }
    if (helper.delay && helper.delay > cLastMessageTimeSeconds) {
      continue;
    }
    let formattedText = helper.formattedText;
    helper_responses.push({
      id: `helper_${helper.id}`,
      doc: formattedText,
      'confidence': null,
    });
  }

  return helper_responses;
}

function getLastDirection() {
  // Sometimes last is the element with direction, sometimes parent
  let directionEl = $(CHAT_CONTAINER_SELECTOR).find('div[class^=MessageBox]').last();
  let direction;
  if (directionEl.attr('direction')) direction = directionEl.attr('direction');
  else {
    directionEl = directionEl.find('div').first();
    direction = directionEl.attr('direction');
  }
  return direction;
}


function getLastClientChatMessagesOverride(updateFunc, postChatTurn) {
  if ($(CHAT_RESPONSE_CONTAINER_SELECTOR).parent().find('sapling-chat-controls').length == 0) {
    // Remove hidden chat controls;
    $('sapling-chat-controls').remove();
    injectChatUIOverride();
  }

  let entry_texts = [];
  // All messages
  //let chat_entries = $(CHAT_CONTAINER_SELECTOR).find('div[class^=MessageBox] [class^="Body"]');
  //let chat_senders = $(CHAT_CONTAINER_SELECTOR).find('div[class^=MessageBox] [class^=Sender]');
  // Only customer messages
  let chat_entries = $(CHAT_CONTAINER_SELECTOR).find('div[class^=MessageBox] div[direction="Incoming"][class^="Body"]');
  let chat_senders = $(CHAT_CONTAINER_SELECTOR).find('div[class^=MessageBox] div[direction="Incoming"][class^=Sender]');
  $(chat_entries).each(function(ind, entry) {
    if (chat_senders.length > ind) {
      let sender_name = $(chat_senders[ind]).text().trim();
      if (sender_name == 'SYSTEM_MESSAGE' || sender_name == 'BOT') {
        console.log('Ignoring ' + $(entry).text());
        return;
      }
    }
    // TODO May switch to this
    //if ($(entry).attr('direction') == 'Incoming') entry_texts.push($(entry).text());
    entry_texts.push($(entry).text());
  });

  // This includes both user and agent chats
  if (updateFunc) {
    $(CHAT_CONTAINER_SELECTOR).find('div[class^=MessageBox] div[class^="Body"]').each(function(ind, entry) {
      $(entry).parent().off('click');
      $(entry).parent().css('cursor', 'pointer');
      $(entry).parent().on('click', () => updateFunc($(entry).text()))
    });
  }

  let sessionId = _getSessionId();
  if (chat_entries.length != chatEntryCount[sessionId]) {
    chatEntryCount[sessionId] = chat_entries.length;
    let direction = getLastDirection();
    if (direction == 'Outgoing') agentLastReplied[sessionId] = secondsSinceEpoch();
    if (direction == 'Incoming') customerLastReplied[sessionId] = secondsSinceEpoch();
  }

  return entry_texts;
}

function injectChatUIOverride() {
  let shadowHost;
  if ($('sapling-chat-controls').length === 0) {
    shadowHost = document.createElement('sapling-chat-controls');
    shadowHost.attachShadow({mode: 'open'});
    $(CHAT_RESPONSE_CONTAINER_SELECTOR).append(shadowHost);
  } else {
    shadowHost = $('sapling-chat-controls')[0];
  }
  let shadowRoot = shadowHost.shadowRoot;

  if ($('.sapling-chat-container', shadowRoot)[0]) {
    return;
  }

  // TODO May need to handle lingering underlines

  // inject css
  $(shadowRoot).prepend($(`
<style type="text/css">
.sapling-response-wrapper {
  z-index: 2147483647 !important;
  max-height: 300px;
  width: 100%;
  overflow: default;
  padding-bottom: 10px;
}
.sapling-chat-container{
  opacity: 0.8;
}
.sapling-chat-container:hover {
  opacity: 1.0;
}
.sapling-helper-container {
}
.sapling-chat-suggestion{
  position: relative;
  max-height: 2.1em;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 5px;
  border: 1px solid rgba(82, 95, 153, 0.8);
  color: rgba(82, 95, 153, 0.8);
  background-color: #fff;
  border-radius: 0.4em;
  padding-left: 10px;
  padding-right: 23px;
  padding-top: 5px;
  padding-bottom: 5px;
  user-select: none;
  font-family: Helvetica, Arial, sans-serif;
  font-size: 12px;
  font-weight: 550;
  transition: all .15s ease;
}
.sapling-helper-container .sapling-chat-suggestion {
  border-color: #999;
  color: #666;
}
.sapling-chat-suggestion:hover {
  transform: translateY(-1px);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.32);
  background-color: #ddd;
  cursor: pointer;
  max-height: none;
}
.sapling-chat-suggestion:active {
  transform: translateY(0px);
  background-color: rgba(82, 95, 153, 0.5);
}
.sapling-chat-suggestion .sapling-suggestion-send img {
  z-index: 10;
  width: 20px;
  height: 20px;
  position: absolute;
  top: 0px; right: 0px;
  padding-top: 5px; padding-right: 5px;
  color: rgba(82, 95, 153, 0.8);
  visibility: hidden;
  transition: all .15s ease;
}
.sapling-chat-suggestion .sapling-suggestion-send img:hover {
  transform: translateY(-1px);
}
.sapling-chat-suggestion .sapling-suggestion-send img:active {
  transform: translateY(0px);
}
.sapling-chat-suggestion:hover .sapling-suggestion-send img {
  visibility: visible;
  background-color: rgba(221,221,221,0.6);
  box-shadow: 0px 0px 0px 8px rgba(221,221,221,0.6);
}
.sapling-suggestion-conf {
  z-index: 9;
  position: absolute;
  bottom: 0;
  right: 0;
  padding: 0.3em;
  color: #666;
}
.sapling-conf-low { color: #999; }
.sapling-conf-med { color: #b2cbb8; }
.sapling-conf-high { color: green; }
.sapling-response-wrapper-close {
  display: block;
  position: relative;
  top: 0px;
  left: 5px;
  font-size: 15pt;
  width: 1em;
  height: 1em;
  text-align: center;
  vertical-align: middle;
  cursor: pointer;
  font-weight: bold;
}
</style>`));

  if (SUGGEST_COLLECT_ONLY) {
    $(shadowRoot).prepend($(`<style type="text/css">
    .sapling-response-wrapper {
      display: None;
    }
    </style>`));
  }

  // inject html
  $(shadowRoot).append($(`
<div class='sapling-response-wrapper'>
  <div class='sapling-helper-container'>
  </div>
  <div class='sapling-chat-container'>
  </div>
</div>
`));
}

function shouldInitializeChatObserverOverride() {
  if (!window.location.hostname.includes('deliveroo-connect') && !window.location.hostname.includes('connect.aws') && !window.location.hostname.includes('awsapps') && !window.location.hostname.includes('amazonaws.com')) {
    return false;
  }
  // If only want on specific chat URLs
  //if (document.location.pathname.endsWith('ccp-v2') ||
      //document.location.pathname.endsWith('agent-app-v2')) {
    //return false;
  //}
  //if ($(CHAT_RESPONSE_CONTAINER_SELECTOR).height() == 0) {
    //return false;
  //}
  console.log('Initializing for Connect (v20230331)');
  return true;
}

function replaceInputSelection(inputDOM, replacementText) {
    if (inputDOM.tagName === 'TEXTAREA') {
      inputDOM.focus();
      let val = inputDOM.value;
      const startOffset = val.length;
      const endOffset = startOffset;
      inputDOM.selectionStart = startOffset;
      inputDOM.selectionEnd = endOffset;

      let newValue =  val.slice(0, startOffset) + replacementText + val.slice(endOffset);
      try {
        document.execCommand("insertText", false, replacementText);
      } catch (e) { }
      if (inputDOM.value != newValue) {
         inputDOM.value = newValue;
      }

      // collapse to the front
      inputDOM.selectionStart = startOffset;
      inputDOM.selectionEnd = startOffset;
    } else {  // contenteditable
      setTimeout(function() {
        inputDOM.focus();
        document.execCommand('insertText', false, replacementText.trim().replace('\n', '<br />'))
      }, 0);
    }

    inputDOM.dispatchEvent(new Event('input', { bubbles: true, cancelable: false }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
}

function editChatResponseOverride(text, textChangedCB) {
  const currentText = $(CHAT_INPUT_SELECTOR).first().val();
  const whitespace = /\s/;
  if (!whitespace.test(currentText.charAt(currentText.length - 1)) &&
      !whitespace.test(text.charAt(0))) {
    text = ' ' + text;
  }
  replaceInputSelection($(CHAT_INPUT_SELECTOR)[0], text);
}

function injectChatResponseOverride(text, textChangedCB) {
  let wrapperCB = function() {
    textChangedCB();
    var e = $.Event( "keypress", { which: 13 } );
    $(CHAT_INPUT_SELECTOR).first().trigger(e);
  }
  editChatResponseOverride(text, wrapperCB);
}

function setupConfirmEndChat() {
  $('[data-testid="ccp-end-contact-button"]').each(function(ind, el) {
    if ($(el).attr('confirmSetup')) return;
    $(el).attr('confirmSetup', true);
    $(el).click(function(e) {
      if (!confirm('Are you sure?')) e.stopImmediatePropagation();
    });
  });
  console.log('Set up confirm end chat.');
}

// No longer works
function getAgentIdleTime() {
  if (!agentLastReplied) return $('.fKfhWV span[aria-hidden="true"]').first().text();
  const elapsed = secondsSinceEpoch() - agentLastReplied;
  let minutes = Math.floor(elapsed / 60);
  let seconds = elapsed - 60 * minutes;
  if (minutes < 10) minutes = '0' + minutes;
  if (seconds < 10) seconds = '0' + seconds;
  return `${minutes}:${seconds}`;
}

// No longer works
function setupAgentIdle() {
  if ($('a[aria-selected=true] .fKfhWV .agentIdleTime').length) return;
  $('a[aria-selected=true] .fKfhWV').append(
    `<div class="FlexVerticalCenterContainer-j7jy1s-2 StyledStatusTimer-g3g156-10 eSpATB TimerWrap-sc-63e1s5-0 cElned" style="margin-left: 10px">
      <div type="mini" class="FlexVerticalCenterContainer-j7jy1s-2 IconWrapper-sc-134xh1t-1 dGyfZk">
      <svg viewBox="0 0 13 13" fill="currentColor" role="img" width="100%" height="100%" aria-label="Idle for" aria-hidden="false">
        <path d="M3.08 7.6a5 5 0 001.2.2 3.24 3.24 0 003.3-3.2 3.19 3.19 0 00-.3-1.4 3.26 3.26 0 012.1 3 3.24 3.24 0 01-3.3 3.2 3.26 3.26 0 01-3-1.8z"></path>
        <path d="M6.5 13A6.5 6.5 0 1113 6.5 6.51 6.51 0 016.5 13zm0-12A5.5 5.5 0 1012 6.5 5.51 5.51 0 006.5 1z"></path>
      </svg>
      </div>
      <span class="Time-sc-63e1s5-1 cEjRVJ Time-sc-1rc5sg2-0 iGYtDc"><span aria-hidden="true" class="agentIdleTime">00:00</span></span>
    </div>`)
  $('a[aria-selected=true] .fKfhWV span[aria-hidden="true"]').first().on('DOMSubtreeModified', function() {
    $('.fKfhWV span.agentIdleTime').html(getAgentIdleTime());
  });
}
