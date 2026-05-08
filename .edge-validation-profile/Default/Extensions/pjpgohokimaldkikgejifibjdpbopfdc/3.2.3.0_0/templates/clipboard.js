// console logs do not work in offscreen page.
// use chrome.runtime.sendMessage to pass debugging to background service worker

let snippetCopyItem = document.getElementById('snippet-copy');

async function cacheClipboardContents() {
  let cachedClipboardItem = document.getElementById('clipboard-cache');
  cachedClipboardItem.innerHTML = '';
  cachedClipboardItem.focus();

  let range = document.createRange();
  range.selectNodeContents(cachedClipboardItem);
  let select = window.getSelection();
  select.removeAllRanges();
  select.addRange(range);

  if (EXTENSION_BROWSER === 'ff') {
    navigator.clipboard.readText().then(
      (clipboardContents) => {
        cachedClipboardItem.text(clipboardContents);
      },
      (error) => {
      },
    );
  } else {
    document.execCommand('paste');
  }
}

async function popCachedClipboardContents() {
  let cachedClipboardItem = document.getElementById('clipboard-cache');
  // // make sure the timeout is equal to or longer than the snippet paste timeout
  await new Promise(resolve => setTimeout(resolve, 200));
  // cachedClipboardItem.innerHTML = 'asdf';
  let range = document.createRange();
  range.selectNodeContents(cachedClipboardItem);
  let select = window.getSelection();
  select.removeAllRanges();
  select.addRange(range);
  document.execCommand('copy');
  select.removeAllRanges();
  cachedClipboardItem.innerHTML = '';
}

function copySnippetToClipboard(insertHTML, fontStyle) {
  snippetCopyItem.innerHTML = '';
  if (fontStyle) {
    $(snippetCopyItem).css(fontStyle);
  } else {
    $(snippetCopyItem).css('');
  }
  $(snippetCopyItem).append($.parseHTML(insertHTML));
  let range = document.createRange();
  range.selectNodeContents(snippetCopyItem);
  let select = window.getSelection();
  select.removeAllRanges();
  select.addRange(range);
  document.execCommand('copy');
  select.removeAllRanges();
  snippetCopyItem.innerHTML = '';
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request) {
    return false;
  }
  if (request.action === 'copy-snippet') {
    chrome.runtime.sendMessage({ action: 'offscreen-log', log: 'copy-snippet' });
    copySnippetToClipboard(request.html, request.fontStyle);
    sendResponse({ status: true, success: true });
    return false;
  } else if (request.action === 'cache-clipboard') {
    chrome.runtime.sendMessage({ action: 'offscreen-log', log: 'cache-clipboard' });
    cacheClipboardContents();
    sendResponse({ status: true, success: true });
    return false;
  } else if (request.action === 'pop-cached-clipboard') {
    chrome.runtime.sendMessage({ action: 'offscreen-log', log: 'pop-cached-clipboard' });
    popCachedClipboardContents().then(() => {
      sendResponse({ status: true, success: true });
    });
    return true; // Will respond asynchronously
  }
  return false;
});
