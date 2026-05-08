
// default variables
var selectedText = null;
var imageList = null;
var mdClipsFolder = '';

// 国际化系统
const i18n = {
    // 检测浏览器语言
    detectLanguage() {
        const lang = navigator.language || navigator.userLanguage;
        // 支持中文（简体、繁体、香港、台湾等）
        if (lang.startsWith('zh')) {
            return 'zh';
        }
        // 默认英文
        return 'en';
    },

    // 翻译文本库
    translations: {
        en: {
            downloadImages: 'Download Images',
            selectedText: 'Selected Text',
            entireDocument: 'Entire Document',
            includeTemplate: 'Include Template',
            fileTitle: 'File Title',
            titlePlaceholder: 'Enter file title...',
            contentPreview: 'Content Preview',
            downloadSelected: 'Download Selected',
            downloadMarkdown: 'Download Markdown',
            preparing: 'Preparing...',
            // 进度消息
            'dom-fetching': 'Fetching page content...',
            'content-extraction': 'Extracting article content...',
            'markdown-conversion': 'Converting to Markdown...',
            'image-link-processing': 'Processing images and links...',
            'finalizing': 'Preparing to display results...',
            'processing-timeout': 'Processing is taking longer, please wait...'
        },
        zh: {
            downloadImages: '下载图片',
            selectedText: '选中文本',
            entireDocument: '整个文档',
            includeTemplate: '包含模板',
            fileTitle: '文件标题',
            titlePlaceholder: '输入文件标题...',
            contentPreview: '内容预览',
            downloadSelected: '下载选中内容',
            downloadMarkdown: '下载 Markdown',
            preparing: '准备中...',
            // 进度消息
            'dom-fetching': '正在获取页面内容...',
            'content-extraction': '正在提取文章内容...',
            'markdown-conversion': '正在转换为Markdown...',
            'image-link-processing': '正在处理图片和链接...',
            'finalizing': '正在准备显示结果...',
            'processing-timeout': '处理时间较长，请耐心等待...'
        }
    },

    // 当前语言
    currentLang: 'en',

    // 初始化
    init() {
        this.currentLang = this.detectLanguage();
        this.applyTranslations();
    },

    // 获取翻译文本
    t(key) {
        return this.translations[this.currentLang][key] || this.translations.en[key] || key;
    },

    // 应用翻译到页面
    applyTranslations() {
        // 翻译带有 data-i18n 属性的元素
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            element.textContent = this.t(key);
        });

        // 翻译 placeholder 属性
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            element.placeholder = this.t(key);
        });

        // 翻译 title 属性
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            element.title = this.t(key);
        });
    }
};

/**
 * 进度指示器阶段配置
 * 
 * 定义了处理流程的各个阶段，每个阶段包含：
 * - range: 进度百分比范围 [最小值, 最大值]
 * - messageKey: 国际化消息的key
 */
const progressStages = {
    "initializing": {
        range: [0, 5],
        messageKey: "preparing"
    },
    "dom-fetching": {
        range: [5, 20],
        messageKey: "dom-fetching"
    },
    "content-extraction": {
        range: [20, 50],
        messageKey: "content-extraction"
    },
    "markdown-conversion": {
        range: [50, 80],
        messageKey: "markdown-conversion"
    },
    "image-link-processing": {
        range: [80, 95],
        messageKey: "image-link-processing"
    },
    "finalizing": {
        range: [95, 100],
        messageKey: "finalizing"
    }
};

// 初始化国际化系统
i18n.init();

const darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
// set up event handlers
const cm = CodeMirror.fromTextArea(document.getElementById("md"), {
    theme: darkMode ? "xq-dark" : "xq-light",
    mode: "markdown",
    lineWrapping: true
});
cm.on("cursorActivity", (cm) => {
    const somethingSelected = cm.somethingSelected();
    var a = document.getElementById("downloadSelection");

    if (somethingSelected) {
        a.classList.add("show");
        a.style.display = "flex";
    }
    else {
        a.classList.remove("show");
        a.style.display = "none";
    }
});
document.getElementById("download").addEventListener("click", download);
document.getElementById("downloadSelection").addEventListener("click", downloadSelection);

// defaultOptions现在从shared/default-options.js中获取

const checkInitialSettings = options => {
    if (options.includeTemplate) {
        document.querySelector("#includeTemplate").checked = true;
        document.querySelector("#includeTemplate").closest('.option-item').classList.add("checked");
    }

    if (options.downloadImages) {
        document.querySelector("#downloadImages").checked = true;
        document.querySelector("#downloadImages").closest('.option-item').classList.add("checked");
    }

    if (options.clipSelection) {
        document.querySelector("#selected").checked = true;
        document.querySelector("#selected").closest('.option-item').classList.add("checked");
    } else {
        document.querySelector("#document").checked = true;
        document.querySelector("#document").closest('.option-item').classList.add("checked");
    }
}

const toggleClipSelection = (options, isSelected) => {
    options.clipSelection = isSelected;

    // 更新radio按钮状态
    document.querySelector("#selected").checked = isSelected;
    document.querySelector("#document").checked = !isSelected;

    // 更新视觉状态
    document.querySelector("#selected").closest('.option-item').classList.toggle("checked", isSelected);
    document.querySelector("#document").closest('.option-item').classList.toggle("checked", !isSelected);

    chrome.storage.sync.set(options).then(() => clipSite()).catch((error) => {
        console.error(error);
    });
}

const toggleIncludeTemplate = options => {
    options.includeTemplate = !options.includeTemplate;

    // 更新checkbox状态
    document.querySelector("#includeTemplate").checked = options.includeTemplate;
    document.querySelector("#includeTemplate").closest('.option-item').classList.toggle("checked", options.includeTemplate);

    chrome.storage.sync.set(options).then(() => {
        // 更新主菜单项
        chrome.contextMenus.update("toggle-includeTemplate", {
            checked: options.includeTemplate
        }).catch(err => {
            console.warn("无法更新 toggle-includeTemplate 菜单项:", err);
        });

        // 尝试更新标签页菜单项，但如果不存在则忽略错误
        try {
            chrome.contextMenus.update("tabtoggle-includeTemplate", {
                checked: options.includeTemplate
            }).catch(err => {
                // 忽略错误，因为在某些浏览器中这个菜单项可能不存在
                console.debug("tabtoggle-includeTemplate 菜单项不存在，这是正常的");
            });
        } catch (err) {
            // 忽略任何其他错误
            console.debug("处理 tabtoggle-includeTemplate 时出错，这是正常的");
        }

        return clipSite()
    }).catch((error) => {
        console.error(error);
    });
}

const toggleDownloadImages = options => {
    options.downloadImages = !options.downloadImages;

    // 更新checkbox状态
    document.querySelector("#downloadImages").checked = options.downloadImages;
    document.querySelector("#downloadImages").closest('.option-item').classList.toggle("checked", options.downloadImages);

    chrome.storage.sync.set(options).then(() => {
        // 更新主菜单项
        chrome.contextMenus.update("toggle-downloadImages", {
            checked: options.downloadImages
        }).catch(err => {
            console.warn("无法更新 toggle-downloadImages 菜单项:", err);
        });

        // 尝试更新标签页菜单项，但如果不存在则忽略错误
        try {
            chrome.contextMenus.update("tabtoggle-downloadImages", {
                checked: options.downloadImages
            }).catch(err => {
                // 忽略错误，因为在某些浏览器中这个菜单项可能不存在
                console.debug("tabtoggle-downloadImages 菜单项不存在，这是正常的");
            });
        } catch (err) {
            // 忽略任何其他错误
            console.debug("处理 tabtoggle-downloadImages 时出错，这是正常的");
        }
        return clipSite(); // 添加这一行
    }).catch((error) => {
        console.error(error);
    });
}
const showOrHideClipOption = selection => {
    const clipOption = document.getElementById("clipOption");
    if (selection) {
        clipOption.classList.add("show");
        clipOption.style.display = "flex";
    }
    else {
        clipOption.classList.remove("show");
        clipOption.style.display = "none";
    }
}

function getSelectionAndDom() {
    return {
        "dom": document.documentElement.outerHTML,
        "selection": window.getSelection().toString()
    };
}

const clipSite = () => {
    return chrome.tabs.query({
        currentWindow: true,
        active: true
    }).then((tabs) => {
        const id = tabs[0].id;
        return chrome.scripting.executeScript({
            target: { tabId: id },
            func: getSelectionAndDom
        })
            .then((result) => {
                if (result && result[0] && result[0].result) {
                    showOrHideClipOption(result[0].result.selection);
                    let message = {
                        type: "clip",
                        dom: result[0].result.dom,
                        selection: result[0].result.selection
                    }
                    return chrome.storage.sync.get(defaultOptions).then(options => {
                        chrome.runtime.sendMessage({
                            ...message,
                            ...options
                        });
                    }).catch(err => {
                        console.error(err);
                        showError(err)
                        return chrome.runtime.sendMessage({
                            ...message,
                            ...defaultOptions
                        });
                    }).catch(err => {
                        console.error(err);
                        showError(err)
                    });
                }
            }).catch(err => {
                console.error(err);
                showError(err)
            });
    });
}

// inject the necessary scripts
chrome.storage.sync.get(defaultOptions).then(options => {
    checkInitialSettings(options);

    // 为选项项添加点击事件处理
    document.querySelector('label[for="selected"]') || document.querySelector('#selected').closest('label').addEventListener("click", (e) => {
        if (e.target.type !== 'radio') {
            e.preventDefault();
            document.querySelector("#selected").click();
        }
    });

    document.querySelector('label[for="document"]') || document.querySelector('#document').closest('label').addEventListener("click", (e) => {
        if (e.target.type !== 'radio') {
            e.preventDefault();
            document.querySelector("#document").click();
        }
    });

    // Radio按钮事件处理
    document.getElementById("selected").addEventListener("change", (e) => {
        if (e.target.checked) {
            toggleClipSelection(options, true);
        }
    });

    document.getElementById("document").addEventListener("change", (e) => {
        if (e.target.checked) {
            toggleClipSelection(options, false);
        }
    });

    // Checkbox事件处理
    document.getElementById("includeTemplate").addEventListener("change", (e) => {
        toggleIncludeTemplate(options);
    });

    document.getElementById("downloadImages").addEventListener("change", (e) => {
        toggleDownloadImages(options);
    });

    // 为label添加点击事件以触发checkbox
    document.querySelector('#includeTemplate').closest('label').addEventListener("click", (e) => {
        if (e.target.type !== 'checkbox') {
            e.preventDefault();
            const checkbox = document.querySelector("#includeTemplate");
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
        }
    });

    document.querySelector('#downloadImages').closest('label').addEventListener("click", (e) => {
        if (e.target.type !== 'checkbox') {
            e.preventDefault();
            const checkbox = document.querySelector("#downloadImages");
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
        }
    });

    return chrome.tabs.query({
        currentWindow: true,
        active: true
    });
}).then((tabs) => {
    var id = tabs[0].id;
    var url = tabs[0].url;
    chrome.scripting.executeScript({
        target: { tabId: id },
        files: ["/contentScript/contentScript.js"]
    })
        .then(() => {
            console.info("Successfully injected MarkDownload content script");
            return clipSite(); // remove id parameter
        }).catch((error) => {
            console.error(error);
            showError(error);
        });
});

// listen for notifications from the background page
chrome.runtime.onMessage.addListener(notify);

//function to send the download message to the background page
function sendDownloadMessage(text) {
    if (text != null) {

        return chrome.tabs.query({
            currentWindow: true,
            active: true
        }).then(tabs => {
            var message = {
                type: "download",
                markdown: text,
                title: document.getElementById("title").value,
                tab: tabs[0],
                imageList: imageList,
                mdClipsFolder: mdClipsFolder
            };
            return chrome.runtime.sendMessage(message);
        });
    }
}

// event handler for download button
async function download(e) {
    e.preventDefault();
    await sendDownloadMessage(cm.getValue());
    window.close();
}

// event handler for download selected button
async function downloadSelection(e) {
    e.preventDefault();
    if (cm.somethingSelected()) {
        await sendDownloadMessage(cm.getSelection());
    }
}

//function that handles messages from the injected script into the site
function notify(message) {
    // message for displaying markdown
    if (message.type == "display.md") {
        // set the values from the message
        //document.getElementById("md").value = message.markdown;
        cm.setValue(message.markdown);
        document.getElementById("title").value = message.article.title;
        imageList = message.imageList;
        mdClipsFolder = message.mdClipsFolder;

        // show the hidden elements
        document.getElementById("container").style.display = 'flex';
        document.getElementById("spinner").style.display = 'none';
        document.getElementById("progress-container").style.display = 'none';
        // focus the download button
        document.getElementById("download").focus();
        cm.refresh();
    }
    // 处理进度更新消息
    else if (message.type == "progress.update") {
        updateProgress(message.stage, message.percentage, message.message);
    }
    // 处理重新剪辑消息，从background script发送
    else if (message.type == "reclip") {
        clipSite();
    }
}

/**
 * 超时处理变量
 * progressTimeout: 用于存储超时计时器的ID
 * lastProgressUpdate: 记录最后一次进度更新的时间戳
 */
let progressTimeout;
let lastProgressUpdate = 0;

/**
 * 更新进度指示器
 * @param {string} stage - 当前处理阶段的标识符
 * @param {number} percentage - 可选，当前进度百分比，如果未提供则使用阶段的起始百分比
 * @param {string} message - 可选，显示给用户的自定义消息，如果未提供则使用阶段的默认消息
 */
function updateProgress(stage, percentage, message) {
    const progressContainer = document.getElementById("progress-container");
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.querySelector('.progress-text');
    const progressPercentage = document.querySelector('.progress-percentage');

    // 显示进度容器，隐藏spinner
    document.getElementById("spinner").style.display = 'none';
    progressContainer.style.display = 'flex';

    // 更新进度条
    if (progressFill && progressText && progressPercentage) {
        // 如果提供了具体百分比，则使用它；否则使用阶段的起始百分比
        const stageConfig = progressStages[stage];
        const actualPercentage = percentage !== undefined ?
            percentage : (stageConfig ? stageConfig.range[0] : 0);

        // 获取国际化消息
        let displayMessage = message;
        if (!displayMessage && stageConfig) {
            displayMessage = i18n.t(stageConfig.messageKey);
        }
        if (!displayMessage) {
            displayMessage = i18n.t('preparing');
        }

        // 更新UI元素
        progressFill.style.width = `${actualPercentage}%`;
        progressText.textContent = displayMessage;
        progressPercentage.textContent = `${Math.round(actualPercentage)}%`;

        // 清除之前的超时计时器
        if (progressTimeout) {
            clearTimeout(progressTimeout);
        }

        // 记录最后更新时间
        lastProgressUpdate = Date.now();

        // 设置新的超时计时器，如果10秒内没有更新，显示提示信息
        progressTimeout = setTimeout(() => {
            if (Date.now() - lastProgressUpdate > 10000) {
                progressText.textContent = i18n.t('processing-timeout');
            }
        }, 10000);
    }
}

function showError(err) {
    // show the hidden elements
    document.getElementById("container").style.display = 'flex';
    document.getElementById("spinner").style.display = 'none';
    document.getElementById("progress-container").style.display = 'none';
    cm.setValue(`Error clipping the page\n\n${err}`)
}
