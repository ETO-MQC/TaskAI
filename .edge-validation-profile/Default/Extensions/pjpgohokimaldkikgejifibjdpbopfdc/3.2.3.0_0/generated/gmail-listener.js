(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
const extId = document.currentScript.getAttribute('data-extension-id');

function initGmailListener(gmail) {
  console.log('Email:', gmail.get.user_email());

  function handleEmail(url, body, data, xhr) {
    chrome.runtime.sendMessage(
      extId,
      { url, body, data, xhr },
      (response) => {
        if (chrome.runtime.lastError) console.log(chrome.runtime.lastError);
        else if (!response.success) console.log(response);
      },
    );
  }
  gmail.observe.before('send_message', handleEmail);
  gmail.observe.before('send_scheduled_message', handleEmail);
}

if (window.self === window.top) {
  const loaderInt = setInterval(() => {
    if (!window._gmailjs) {
      return;
    }
    clearInterval(loaderInt);
    initGmailListener(window._gmailjs);
  }, 200);
}

},{}]},{},[1]);
