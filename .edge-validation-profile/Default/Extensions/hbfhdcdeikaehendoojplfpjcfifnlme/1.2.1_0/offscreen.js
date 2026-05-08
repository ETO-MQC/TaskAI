const WORKER_URL = chrome.runtime.getURL("opusEncoderWorker.min.js");
const AEM_DELEGATION_URL =
  // "https://127.0.0.1:8089/index.html";
  "https://g.alicdn.com/idst-fe/tingwu-chrome-extension-aem-delegation/0.0.17/index.html";

// long lived connection for audio stream encoder
chrome.runtime.onConnect.addListener((port) => {
  console.log("onConnect", port.name);
  if (!port.name.startsWith("offscreen_")) {
    return;
  }

  port.onMessage.addListener((request) => {
    handleOpusEncoderWorkerMessage(request, port);
  });
});

// message listener for aem delegation
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type !== "offscreen") {
    return;
  }

  handleAEMDelegationMessage(request.payload);
});

const opusEncoderWorkerMap = new Map();

const createOpusEncoderWorker = (tabId) => {
  let worker = opusEncoderWorkerMap.get(tabId);
  if (worker) {
    destroyOpusEncoderWorker(worker);
  }

  worker = new Worker(WORKER_URL);
  opusEncoderWorkerMap.set(tabId, worker);

  console.log("opus encoder created", tabId);

  return worker;
};

const destroyOpusEncoderWorker = (tabId) => {
  const worker = opusEncoderWorkerMap.get(tabId);
  if (!worker) {
    return;
  }

  worker.postMessage({
    command: "done",
  });
  worker.onmessage = null;
  worker.terminate();
  opusEncoderWorkerMap.delete(tabId);

  console.log("opus encoder destroyed", tabId);
};

const handleOpusEncoderWorkerMessage = (request, port) => {
  if (request.type !== "opus-encoder") {
    return;
  }

  const { payload = {} } = request;
  const { command } = payload;

  if (command === "init") {
    const { encoderPath, ...commandData } = payload;
    const opusEncoderWorker = createOpusEncoderWorker(port.name);
    opusEncoderWorker.postMessage({
      command,
      ...commandData,
    });

    opusEncoderWorker.postMessage({
      command: "getHeaderPages",
    });

    opusEncoderWorker.onmessage = ({ data }) => {
      if (data.message === "page") {
        port.postMessage({
          command: "page",
          data: Array.from(data.page),
        });
      } else if (data.message === "ready") {
        port.postMessage({
          command: "ready",
        });
      }
    };
  } else if (command === "encode") {
    const opusEncoderWorker = opusEncoderWorkerMap.get(port.name);
    if (!opusEncoderWorker) {
      return;
    }

    const { buffers } = payload;
    opusEncoderWorker.postMessage({
      command,
      buffers: [new Float32Array(buffers)],
    });
  } else if (command === "done") {
    destroyOpusEncoderWorker(port.name);
  }
};

const handleAEMDelegationMessage = (request) => {
  const aemDelegationIframe = document.body.querySelector(
    "iframe#aem-delegation"
  );
  const anonymousAemDelegationIframe = document.body.querySelector(
    "iframe#anonymous-aem-delegation"
  );

  if (request.type === 'initAem') {
    const {
      payload: { uid = "", env = import.meta.env.REACT_APP_SERVER_ENV } = {},
    } = request;
    let src, id;

    if (uid) {
      src = `${AEM_DELEGATION_URL}?env=${env}&uid=${uid}`;
      id = "aem-delegation";
      if (aemDelegationIframe && aemDelegationIframe.src === src) return;
    } else {
      if (anonymousAemDelegationIframe) return;
      src = `${AEM_DELEGATION_URL}?env=${env}`;
      id = "anonymous-aem-delegation";
    }

    const iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.id = id;
    document.body.appendChild(iframe);
    return;
  }

  if (request.type === 'log-aplus') {
    aemDelegationIframe &&
      aemDelegationIframe.contentWindow.postMessage(
        { type: "log-aplus", payload: request.payload },
        AEM_DELEGATION_URL
      );
    return;
  }

  if (request.type ==='activateLog') {
    aemDelegationIframe &&
      aemDelegationIframe.contentWindow.postMessage(
        { type: "activateLog", payload: request.payload, pageId: request.payload.params.pageId },
        AEM_DELEGATION_URL
      );
    return;
  }
  if (request.type ==='commonLog') {
    aemDelegationIframe &&
      aemDelegationIframe.contentWindow.postMessage(
        { type: "commonLog", payload: request.payload, pageId: request.payload.params.pageId },
        AEM_DELEGATION_URL
      );
    return;
  }

  if (request.type ==='log') {
    aemDelegationIframe &&
      aemDelegationIframe.contentWindow.postMessage(
        { type: "log", payload: request.payload },
        AEM_DELEGATION_URL
      );
    return;
  }

  if (request.type === 'log-aplus-anonymous') {
    anonymousAemDelegationIframe &&
      anonymousAemDelegationIframe.contentWindow.postMessage(
        { type: "log-aplus", payload: request.payload },
        AEM_DELEGATION_URL
      );
    return;
  }
  if (request.type === 'activateLog-anonymous') {
    anonymousAemDelegationIframe &&
      anonymousAemDelegationIframe.contentWindow.postMessage(
        { type: "activateLog-anonymous", payload: request.payload, pageId: request.payload.params.pageId },
        AEM_DELEGATION_URL
      );
    return;
  }
  if (request.type === 'commonLog-anonymous') {
    anonymousAemDelegationIframe &&
      anonymousAemDelegationIframe.contentWindow.postMessage(
        { type: "commonLog-anonymous", payload: request.payload, pageId: request.payload.params.pageId },
        AEM_DELEGATION_URL
      );
    return;
  }

  if (request.type === 'log-anonymous') {
    anonymousAemDelegationIframe &&
      anonymousAemDelegationIframe.contentWindow.postMessage(
        { type: "log", payload: request.payload },
        AEM_DELEGATION_URL
      );
  }

  // if (request.type === 'unloginPage') {
  //   aemDelegationIframe &&
  //     aemDelegationIframe.contentWindow.postMessage(
  //       { type: "activeMain" },
  //       AEM_DELEGATION_URL
  //     );
  //   return;
  // }
  // if (request.type === 'loginPage') {
  //   anonymousAemDelegationIframe &&
  //     anonymousAemDelegationIframe.contentWindow.postMessage(
  //       { type: "activeMain" },
  //       AEM_DELEGATION_URL
  //     );
  //   return;
  // }
};
