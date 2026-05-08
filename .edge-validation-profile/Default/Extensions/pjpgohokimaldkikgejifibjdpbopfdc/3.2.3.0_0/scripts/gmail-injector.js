function addScript(src) {
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = chrome.runtime.getURL(src);
  script.setAttribute('data-extension-id', chrome.runtime.id);
  (document.body || document.head || document.documentElement).appendChild(script);
}

if (!document.querySelectorAll(`[data-extension-id="${chrome.runtime.id}"]`).length) {
  let isFirefox = typeof InstallTrigger !== 'undefined';
  if (!isFirefox) {
    addScript('generated/gmail-module.js');
    addScript('generated/gmail-listener.js');
  }
}
