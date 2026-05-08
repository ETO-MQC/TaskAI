(self.webpackChunkscriptcat=self.webpackChunkscriptcat||[]).push([["411"],{76729(e){"use strict";e.exports=`// @copyright https://github.com/silverwzw/Tampermonkey-Typescript-Declaration

declare const unsafeWindow: Window;

declare type ConfigType = "text" | "checkbox" | "select" | "mult-select" | "number" | "textarea" | "time";

declare interface Config {
  [key: string]: unknown;
  title: string;
  description: string;
  default?: unknown;
  type?: ConfigType;
  bind?: string;
  values?: unknown[];
  password?: boolean;
  // 文本类型时是字符串长度,数字类型时是最大值
  max?: number;
  min?: number;
  rows?: number; // textarea行数
  index: number; // 配置项排序位置
}

declare type UserConfig = { [key: string]: { [key: string]: Config } };

declare const GM_info: {
  version: string;
  scriptWillUpdate: boolean;
  scriptHandler: "ScriptCat";
  scriptUpdateURL?: string;
  // scriptSource: string;
  scriptMetaStr?: string;
  userConfig?: UserConfig;
  userConfigStr?: string;
  isIncognito: boolean;
  sandboxMode: "raw"; // "js" | "raw" | "none";
  userAgentData: {
    brands?: {
      brand: string;
      version: string;
    }[];
    mobile?: boolean;
    platform?: string;
    architecture?: string;
    bitness?: string;
  };
  downloadMode: "native"; // "native" | "disabled" | "browser";
  script: {
    author?: string;
    description?: string;
    // excludes: string[];
    grant: string[];
    header: string;
    // homepage?: string;
    icon?: string;
    icon64?: string;
    includes?: string[];
    // lastModified: number;
    matches: string[];
    name: string;
    namespace?: string;
    // position: number;
    "run-at": string;
    "run-in": string[];
    // resources: string[];
    // unwrap: boolean;
    version: string;
    /* options: {
      awareOfChrome: boolean;
      run_at: string;
      noframes?: boolean;
      compat_arrayLeft: boolean;
      compat_foreach: boolean;
      compat_forvarin: boolean;
      compat_metadata: boolean;
      compat_uW_gmonkey: boolean;
      override: {
        orig_excludes: string[];
        orig_includes: string[];
        use_includes: string[];
        use_excludes: string[];
        [key: string]: any;
      };
      [key: string]: any;
    }; */
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

declare function GM_listValues(): string[];

declare function GM_addValueChangeListener(name: string, listener: GMTypes.ValueChangeListener): number;

declare function GM_removeValueChangeListener(listenerId: number): void;

declare function GM_setValue(name: string, value: any): void;
// 设置多个值, values是一个对象, 键为值的名称, 值为值的内容
declare function GM_setValues(values: { [key: string]: any }): void;

declare function GM_getValue(name: string, defaultValue?: any): any;

// 获取多个值, 如果keysOrDefaults是一个对象, 则使用对象的值作为默认值
declare function GM_getValues(keysOrDefaults: { [key: string]: any } | string[] | null | undefined): {
  [key: string]: any;
};

declare function GM_deleteValue(name: string): void;

// 删除多个值, names是一个字符串数组
declare function GM_deleteValues(names: string[]): void;

// 支持level和label
declare function GM_log(message: string, level?: GMTypes.LoggerLevel, labels?: GMTypes.LoggerLabel): void;

declare function GM_getResourceText(name: string): string | undefined;

declare function GM_getResourceURL(name: string, isBlobUrl?: boolean): string | undefined;

function GM_registerMenuCommand(
  name: string,
  listener?: (inputValue?: any) => void,
  options_or_accessKey?:
    | {
        id?: number | string;
        accessKey?: string; // 菜单快捷键
        autoClose?: boolean; // 默认为 true，false 时点击后不关闭弹出菜单页面
        nested?: boolean; // SC特有配置，默认为 true，false 的话浏览器右键菜单项目由三级菜单升至二级菜单
        individual?: boolean; // SC特有配置，默认为 false，true 表示相同的菜单项不合并显示
      }
    | string
): number;

declare function GM_unregisterMenuCommand(id: number): void;

/**
 * 注册一个菜单输入框, 允许用户输入值, 并在输入完成后用回调函数
 */
declare function CAT_registerMenuInput(
  name: string,
  listener?: (inputValue?: any) => void,
  options_or_accessKey?:
    | {
        id?: number | string;
        accessKey?: string; // 菜单快捷键
        autoClose?: boolean; // 默认为 true，false 时点击后不关闭弹出菜单页面
        nested?: boolean; // SC特有配置，默认为 true，false 的话浏览器右键菜单项目由三级菜单升至二级菜单
        individual?: boolean; // SC特有配置，默认为 false，true 表示相同的菜单项不合并显示
        // 可选输入框
        inputType?: "text" | "number" | "boolean";
        title?: string; // title 只适用于输入框类型
        inputLabel?: string;
        inputDefaultValue?: string | number | boolean;
        inputPlaceholder?: string;
      }
    | string
): number;

declare const CAT_unregisterMenuInput: typeof GM_unregisterMenuCommand;

/**
 * 当使用 @early-start 时，可以使用此函数来等待脚本完全加载完成
 */
declare function CAT_scriptLoaded(): Promise<void>;

declare function GM_openInTab(url: string, options: GMTypes.OpenTabOptions): GMTypes.Tab | undefined;
declare function GM_openInTab(url: string, loadInBackground: boolean): GMTypes.Tab | undefined;
declare function GM_openInTab(url: string): GMTypes.Tab | undefined;

declare function GM_xmlhttpRequest(details: GMTypes.XHRDetails): GMTypes.AbortHandle<void>;

declare function GM_download(details: GMTypes.DownloadDetails<string | Blob | File>): GMTypes.AbortHandle<boolean>;
declare function GM_download(url: string, filename: string): GMTypes.AbortHandle<boolean>;

declare function GM_getTab(callback: (tab: object) => void): void;

declare function GM_saveTab(tab: object): Promise<void>;

declare function GM_getTabs(callback: (tabs: { [key: number]: object }) => void): void;

declare function GM_notification(details: GMTypes.NotificationDetails, ondone?: GMTypes.NotificationOnDone): void;
declare function GM_notification(
  text: string,
  title: string,
  image: string,
  onclick?: GMTypes.NotificationOnClick
): void;

declare function GM_closeNotification(id: string): void;

declare function GM_updateNotification(id: string, details: GMTypes.NotificationDetails): void;

declare function GM_setClipboard(data: string, info?: string | { type?: string; mimetype?: string }): void;

declare function GM_addElement(tag: string, attributes: Record<string, string | number | boolean>): HTMLElement;
declare function GM_addElement(
  parentNode: Node,
  tag: string,
  attrs: Record<string, string | number | boolean>
): HTMLElement;

declare function GM_addStyle(css: string): HTMLStyleElement;

// name和domain不能都为空
declare function GM_cookie(
  action: GMTypes.CookieAction,
  details: GMTypes.CookieDetails,
  ondone: (cookie: GMTypes.Cookie[], error: unknown | undefined) => void
): void;
 
/**
 * GM.* API (兼容 Greasemonkey4/Tampermonkey 4+ 的 Promise 风格)
 */
declare const GM: {
  /** 脚本信息 */
  readonly info: typeof GM_info;

  /** 获取一个值 */
  getValue<T = any>(name: string, defaultValue?: T): Promise<T>;

  /** 获取多个值, 如果keysOrDefaults是一个对象, 则使用对象的值作为默认值 */
  getValues(keysOrDefaults: { [key: string]: any } | string[] | null | undefined): Promise<{ [key: string]: any }>;

  /** 设置一个值 */
  setValue(name: string, value: any): Promise<void>;

  /** 设置多个值, values是一个对象, 键为值的名称, 值为值的内容 */
  setValues(values: { [key: string]: any }): Promise<void>;

  /** 删除一个值 */
  deleteValue(name: string): Promise<void>;

  /** 删除多个值, names是一个字符串数组 */
  deleteValues(names: string[]): Promise<void>;

  /** 获取所有已保存值的 key 列表 */
  listValues(): Promise<string[]>;

  /** 值变更监听 */
  addValueChangeListener(name: string, listener: GMTypes.ValueChangeListener): Promise<number>;
  removeValueChangeListener(listenerId: number): Promise<void>;

  /** 支持level和label */
  log(message: string, level?: GMTypes.LoggerLevel, labels?: GMTypes.LoggerLabel): Promise<void>;

  /** 获取资源文本 */
  getResourceText(name: string): Promise<string | undefined>;

  /** 获取资源URL */
  getResourceURL(name: string, isBlobUrl?: boolean): Promise<string | undefined>;

  /** 注册菜单 */
  registerMenuCommand(
    name: string,
    listener?: (inputValue?: any) => void,
    options_or_accessKey?:
      | {
          id?: number | string;
          accessKey?: string; // 菜单快捷键
          autoClose?: boolean; // 默认为 true
          title?: string; // 菜单提示
          // ScriptCat 扩展
          icon?: string; // 菜单图标
          // ScriptCat 扩展
          closeOnClick?: boolean; // 点击菜单后是否关闭, 与autoClose含义相同
        }
      | string
  ): Promise<number | string | undefined>;

  /** 注销菜单 */
  unregisterMenuCommand(id: number | string): Promise<void>;

  /** 样式注入 */
  addStyle(css: string): Promise<HTMLStyleElement>;

  /** 通知 */
  notification(details: GMTypes.NotificationDetails, ondone?: GMTypes.NotificationOnDone): Promise<void>;
  notification(text: string, title: string, image: string, onclick?: GMTypes.NotificationOnClick): Promise<void>;
  closeNotification(id: string): Promise<void>;
  updateNotification(id: string, details: GMTypes.NotificationDetails): Promise<void>;

  /** 设置剪贴板 */
  setClipboard(data: string, info?: string | { type?: string; mimetype?: string }): Promise<void>;

  /** 添加元素 */
  addElement(tag: string, attributes: Record<string, string | number | boolean>): Promise<HTMLElement>;
  addElement(parentNode: Node, tag: string, attrs: Record<string, string | number | boolean>): Promise<HTMLElement>;

  /** XMLHttpRequest */
  xmlHttpRequest(details: GMTypes.XHRDetails): Promise<GMTypes.XHRResponse>;

  /** 下载 */
  download(details: GMTypes.DownloadDetails<string | Blob | File>): Promise<boolean>;
  download(url: string, filename: string): Promise<boolean>;

  /** Tab 存储 */
  getTab(): Promise<object>;
  saveTab(tab: object): Promise<void>;
  getTabs(): Promise<{ [key: number]: object }>;

  /** 打开新标签页 */
  openInTab(url: string, options: GMTypes.OpenTabOptions): Promise<GMTypes.Tab | undefined>;
  openInTab(url: string, loadInBackground: boolean): Promise<GMTypes.Tab | undefined>;
  openInTab(url: string): Promise<GMTypes.Tab | undefined>;

  /** Cookie 操作 */
  cookie(action: GMTypes.CookieAction, details: GMTypes.CookieDetails): Promise<GMTypes.Cookie[]>;
};

/**
 * 设置浏览器代理
 * @deprecated 正式版中已废弃,后续可能会在beta版本中添加
 */
declare function CAT_setProxy(rule: CATType.ProxyRule[] | string): void;

/**
 * 清理所有代理规则
 * @deprecated 正式版中已废弃,后续可能会在beta版本中添加
 */
declare function CAT_clearProxy(): void;

/**
 * 输入x、y,模拟真实点击
 * @deprecated 正式版中已废弃,后续可能会在beta版本中添加
 */
declare function CAT_click(x: number, y: number): void;

/**
 * 打开脚本的用户配置页面
 */
declare function CAT_userConfig(): void;

/**
 * 操控管理器设置的储存系统,将会在目录下创建一个app/uuid目录供此 API 使用,如果指定了baseDir参数,则会使用baseDir作为基础目录
 * 上传时默认覆盖同名文件
 * @param action 操作类型 list 列出指定目录所有文件, upload 上传文件, download 下载文件, delete 删除文件, config 打开配置页, 暂时不提供move/mkdir等操作
 * @param details
 */
declare function CAT_fileStorage(
  action: "list",
  details: {
    // 文件路径
    path?: string;
    // 基础目录,如果未设置,则将脚本uuid作为目录
    baseDir?: string;
    onload?: (files: CATType.FileStorageFileInfo[]) => void;
    onerror?: (error: CATType.FileStorageError) => void;
  }
): void;
declare function CAT_fileStorage(
  action: "download",
  details: {
    file: CATType.FileStorageFileInfo; // 某些平台需要提供文件的hash值,所以需要传入文件信息
    onload: (data: Blob) => void;
    // onprogress?: (progress: number) => void;
    onerror?: (error: CATType.FileStorageError) => void;
    // public?: boolean;
  }
): void;
declare function CAT_fileStorage(
  action: "delete",
  details: {
    path: string;
    onload?: () => void;
    onerror?: (error: CATType.FileStorageError) => void;
    // public?: boolean;
  }
): void;
declare function CAT_fileStorage(
  action: "upload",
  details: {
    path: string;
    // 基础目录,如果未设置,则将脚本uuid作为目录
    baseDir?: string;
    data: Blob;
    onload?: () => void;
    // onprogress?: (progress: number) => void;
    onerror?: (error: CATType.FileStorageError) => void;
    // public?: boolean;
  }
): void;
declare function CAT_fileStorage(action: "config"): void;

/**
 * 脚本猫后台脚本重试, 当你的脚本出现错误时, 可以reject返回此错误, 以便脚本猫重试
 * 重试时间请注意不要与脚本执行时间冲突, 否则可能会导致重复执行, 最小重试时间为5s
 * @class CATRetryError
 */
declare class CATRetryError {
  /**
   * constructor 构造函数
   * @param {string} message 错误信息
   * @param {number} seconds x秒后重试, 单位秒
   */
  constructor(message: string, seconds: number);

  /**
   * constructor 构造函数
   * @param {string} message 错误信息
   * @param {Date} date 重试时间, 指定时间后重试
   */
  constructor(message: string, date: Date);
}

declare namespace CATType {
  interface ProxyRule {
    proxyServer: ProxyServer;
    matchUrl: string[];
  }

  type ProxyScheme = "http" | "https" | "quic" | "socks4" | "socks5";

  interface ProxyServer {
    scheme?: ProxyScheme;
    host: string;
    port?: number;
  }

  interface FileStorageError {
    // 错误码 -1 未知错误 1 用户未配置文件储存源 2 文件储存源配置错误 3 路径不存在
    // 4 上传失败 5 下载失败 6 删除失败 7 不允许的文件路径 8 网络类型的错误
    code: -1 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    error: string;
  }

  interface FileStorageFileInfo {
    // 文件名
    name: string;
    // 文件路径
    path: string;
    // 储存空间绝对路径
    absPath: string;
    // 文件大小
    size: number;
    // 文件摘要
    digest: string;
    // 文件创建时间
    createtime: number;
    // 文件修改时间
    updatetime: number;
  }

  type CATFileStorageDetails = {
    baseDir: string;
    path: string;
    filename: any;
    file: FileStorageFileInfo;
    data?: string;
  };
}

declare namespace GMTypes {
  type CookieAction = "list" | "delete" | "set";

  type LoggerLevel = "debug" | "info" | "warn" | "error";

  type LoggerLabel = {
    [key: string]: string | boolean | number | undefined;
  };

  interface CookieDetailsPartitionKeyType {
    topLevelSite?: string;
  }

  interface CookieDetails {
    url?: string;
    name?: string;
    value?: string;
    domain?: string;
    path?: string;
    secure?: boolean;
    session?: boolean;
    httpOnly?: boolean;
    expirationDate?: number;
    partitionKey?: CookieDetailsPartitionKeyType;
  }

  interface Cookie {
    domain: string;
    name: string;
    value: string;
    session: boolean;
    hostOnly: boolean;
    expirationDate?: number;
    path: string;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "unspecified" | "no_restriction" | "lax" | "strict";
  }

  // tabid是只有后台脚本监听才有的参数
  type ValueChangeListener = (
    name: string,
    oldValue: unknown,
    newValue: unknown,
    remote: boolean,
    tabid?: number
  ) => unknown;

  interface OpenTabOptions {
    /**
     * 决定新标签页是否在打开时获得焦点。
     *
     * - \`true\` → 新标签页会立即切换到前台。
     * - \`false\` → 新标签页在后台打开，不会打断当前页面的焦点。
     *
     * 默认值：true
     */
    active?: boolean;

    /**
     * 决定新标签页插入位置。
     *
     * - 如果是 \`boolean\`：
     *   - \`true\` → 插入在当前标签页之后。
     *   - \`false\` → 插入到窗口末尾。
     * - 如果是 \`number\`：
     *   - \`0\` → 插入到当前标签前一格。
     *   - \`1\` → 插入到当前标签后一格。
     *
     * 默认值：true
     */
    insert?: boolean | number;

    /**
     * 决定是否设置父标签页（即 \`openerTabId\`）。
     *
     * - \`true\` → 浏览器能追踪由哪个标签打开的子标签，
     *   有助于某些扩展（如标签树管理器）识别父子关系。
     *
     * 默认值：true
     */
    setParent?: boolean;

    /**
     * 是否在隐私窗口（无痕模式）中打开标签页。
     *
     * 注意：ScriptCat 的 manifest.json 配置了 \`"incognito": "split"\`，
     * 在 normal window 中执行时，tabId/windowId 将不可用，
     * 只能执行「打开新标签页」动作。
     *
     * 默认值：false
     */
    incognito?: boolean;

    /**
     * 历史兼容字段，仅 TM 支持。
     * 语义与 \`active\` **相反**：
     *
     * - \`true\` → 等价于 \`active = false\`（后台加载）。
     * - \`false\` → 等价于 \`active = true\`（前台加载）。
     *
     * ⚠️ 不推荐使用：与 \`active\` 功能重复且容易混淆。
     *
     * 默认值：false
     * @deprecated 请使用 \`active\` 替代
     */
    loadInBackground?: boolean;

    /**
     * 是否将新标签页固定（pin）在浏览器标签栏左侧。
     *
     * - \`true\` → 新标签页为固定状态。
     * - \`false\` → 普通标签页。
     *
     * 默认值：false
     */
    pinned?: boolean;

    /**
     * 使用 \`window.open\` 打开新标签，而不是 \`chrome.tabs.create\`
     * 在打开一些特殊协议的链接时很有用，例如 \`vscode://\`, \`m3u8dl://\`
     * 其他参数在这个打开方式下无效
     *
     * 相关：Issue #178 #1043
     * 默认值：false
     */
    useOpen?: boolean;
  }

  type SWOpenTabOptions = OpenTabOptions & Required<Pick<OpenTabOptions, "active">>;

  /**
   * XMLHttpRequest readyState 状态值
   * @see https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/readyState
   */
  type ReadyState =
    | 0 // UNSENT
    | 1 // OPENED
    | 2 // HEADERS_RECEIVED
    | 3 // LOADING
    | 4; // DONE

  interface XHRResponse {
    finalUrl?: string;
    readyState?: ReadyState;
    responseHeaders?: string;
    status?: number;
    statusText?: string;
    response?: string | Blob | ArrayBuffer | Document | ReadableStream<Uint8Array<ArrayBufferLike>> | null | undefined;
    responseText?: string | undefined;
    responseXML?: Document | null | undefined;
    responseType?: "text" | "arraybuffer" | "blob" | "json" | "document" | "stream" | "";
  }

  interface XHRProgress extends XHRResponse {
    done: number;
    lengthComputable: boolean;
    loaded: number;
    position?: number;
    total: number;
    totalSize: number;
  }

  type Listener<OBJ> = (event: OBJ) => unknown;
  type ContextType = unknown;

  type GMXHRDataType = string | Blob | File | BufferSource | FormData | URLSearchParams;

  interface XHRDetails {
    method?: "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS";
    url: string | URL | File | Blob;
    headers?: { [key: string]: string };
    data?: GMXHRDataType;
    cookie?: string;
    binary?: boolean;
    timeout?: number;
    context?: ContextType;
    responseType?: "text" | "arraybuffer" | "blob" | "json" | "document" | "stream"; // stream 在当前版本是一个较为简陋的实现
    overrideMimeType?: string;
    anonymous?: boolean;
    mozAnon?: boolean; // 发送请求时不携带cookie (兼容Greasemonkey)
    fetch?: boolean;
    user?: string;
    password?: string;
    nocache?: boolean;
    revalidate?: boolean; // 强制重新验证缓存内容：允许缓存，但必须在使用缓存内容之前重新验证
    redirect?: "follow" | "error" | "manual"; // 为了与tm保持一致, 在v0.17.0后废弃maxRedirects, 使用redirect替代, 会强制使用fetch模式
    cookiePartition?: Record<string, any> & {
      topLevelSite?: string; // 表示分区 cookie 的顶部帧站点
    }; // 包含用于发送和接收的分区 cookie 的分区键 https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/cookies#storage_partitioning
    context?: any; // 自定义值，传递给响应的 response.context 属性

    onload?: Listener<XHRResponse>;
    onloadstart?: Listener<XHRResponse>;
    onloadend?: Listener<XHRResponse>;
    onprogress?: Listener<XHRProgress>;
    onreadystatechange?: Listener<XHRResponse>;
    ontimeout?: Listener<XHRResponse>;
    onabort?: Listener<XHRResponse>;
    onerror?: (err: string | (XHRResponse & { error: string })) => void;
  }

  interface AbortHandle<RETURN_TYPE> {
    abort(): RETURN_TYPE;
  }

  interface DownloadError {
    error: "not_enabled" | "not_whitelisted" | "not_permitted" | "not_supported" | "not_succeeded" | "unknown";
    details?: string;
  }

  interface DownloadDetails<URL> {
    // TM/SC 标准参数
    url: URL;
    name: string;
    headers?: { [key: string]: string };
    saveAs?: boolean;
    conflictAction?: "uniquify" | "overwrite" | "prompt";

    // 其他参数
    timeout?: number; // SC/VM
    anonymous?: boolean; // SC/VM
    context?: ContextType; // SC/VM
    user?: string; // SC/VM
    password?: string; // SC/VM

    method?: "GET" | "POST"; // SC
    downloadMode?: "native" | "browser"; // SC
    cookie?: string; // SC

    // TM/SC 标准回调
    onload?: Listener<object>;
    onerror?: Listener<DownloadError>;
    onprogress?: Listener<{
      done: number;
      lengthComputable: boolean;
      loaded: number;
      position?: number;
      total: number;
      totalSize: number;
    }>;
    ontimeout?: (arg1?: any) => void;
  }

  interface NotificationThis extends NotificationDetails {
    id: string;
  }

  type NotificationOnClickEvent = {
    event: "click" | "buttonClick";
    id: string;
    isButtonClick: boolean;
    buttonClickIndex: number | undefined;
    byUser: boolean | undefined;
    preventDefault: () => void;
    highlight: NotificationDetails["highlight"];
    image: NotificationDetails["image"];
    silent: NotificationDetails["silent"];
    tag: NotificationDetails["tag"];
    text: NotificationDetails["tag"];
    timeout: NotificationDetails["timeout"];
    title: NotificationDetails["title"];
    url: NotificationDetails["url"];
  };
  type NotificationOnClick = (this: NotificationThis, event: NotificationOnClickEvent) => unknown;
  type NotificationOnDone = (this: NotificationThis, user?: boolean) => unknown;

  interface NotificationButton {
    title: string;
    iconUrl?: string;
  }

  interface NotificationDetails {
    text?: string;
    title?: string;
    tag?: string;
    image?: string;
    highlight?: boolean;
    silent?: boolean;
    timeout?: number;
    url?: string;
    onclick?: NotificationOnClick;
    ondone?: NotificationOnDone;
    progress?: number;
    oncreate?: NotificationOnClick;
    // 只能存在2个
    buttons?: NotificationButton[];
  }

  interface Tab {
    close(): void;
    onclose?: () => void;
    closed?: boolean;
    name?: string;
  }

  type GMClipboardInfo = string | { type?: string; mimetype?: string };
}
`},82082(e,t,r){let n=r(78401);e.exports={compatMap:{CAT_userConfig:[{type:"scriptcat",versionConstraint:">=0.11.0-beta"}],CAT_fileStorage:[{type:"scriptcat",versionConstraint:">=0.11.0"}],CAT_registerMenuInput:[{type:"scriptcat",versionConstraint:">=0.17.0-beta.2"}],CAT_unregisterMenuInput:[{type:"scriptcat",versionConstraint:">=0.17.0-beta.2"}],CAT_scriptLoaded:[{type:"scriptcat",versionConstraint:">=1.1.0-beta"}],...n.compatMap},gmPolyfillOverride:{...n.gmPolyfillOverride}}},85590(e,t,r){let n=r(64725);e.exports={compatMap:{...n.compatMap,nonFunctional:{...n.compatMap.nonFunctional,background:[],crontab:[],cloudCat:[],cloudServer:[],exportValue:[],exportCookie:[],scriptUrl:[],storageName:[],"early-start":[],"require-css":[]}}}},94930(e,t,r){"use strict";r.d(t,{s:()=>s});let{configs:n}=r(27941),i={parserOptions:{ecmaVersion:"latest",sourceType:"script",ecmaFeatures:{globalReturn:!0}},globals:{CATRetryError:"readonly",CAT_fileStorage:"readonly",CAT_userConfig:"readonly",CAT_registerMenuInput:"readonly",CAT_unregisterMenuInput:"readonly",CAT_scriptLoaded:"readonly"},rules:{"constructor-super":["error"],"for-direction":["error"],"getter-return":["error"],"no-async-promise-executor":["error"],"no-case-declarations":["error"],"no-class-assign":["error"],"no-compare-neg-zero":["error"],"no-cond-assign":["error"],"no-const-assign":["error"],"no-constant-condition":["error"],"no-control-regex":["error"],"no-debugger":["error"],"no-delete-var":["error"],"no-dupe-args":["error"],"no-dupe-class-members":["error"],"no-dupe-else-if":["error"],"no-dupe-keys":["error"],"no-duplicate-case":["error"],"no-empty":["error"],"no-empty-character-class":["error"],"no-empty-pattern":["error"],"no-ex-assign":["error"],"no-extra-boolean-cast":["error"],"no-extra-semi":["error"],"no-fallthrough":["error"],"no-func-assign":["error"],"no-global-assign":["error"],"no-import-assign":["error"],"no-inner-declarations":["error"],"no-invalid-regexp":["error"],"no-irregular-whitespace":["error"],"no-loss-of-precision":["error"],"no-misleading-character-class":["error"],"no-mixed-spaces-and-tabs":["error"],"no-new-symbol":["error"],"no-nonoctal-decimal-escape":["error"],"no-obj-calls":["error"],"no-octal":["error"],"no-prototype-builtins":["error"],"no-redeclare":["error"],"no-regex-spaces":["error"],"no-self-assign":["error"],"no-setter-return":["error"],"no-shadow-restricted-names":["error"],"no-sparse-arrays":["error"],"no-this-before-super":["error"],"no-undef":["warn"],"no-unexpected-multiline":["error"],"no-unreachable":["error"],"no-unsafe-finally":["error"],"no-unsafe-negation":["error"],"no-unsafe-optional-chaining":["error"],"no-unused-labels":["error"],"no-unused-vars":["warn"],"no-useless-backreference":["error"],"no-useless-catch":["error"],"no-useless-escape":["error"],"no-with":["error"],"require-yield":["error"],"use-isnan":["error"],"valid-typeof":["error"],...n.recommended.rules},env:{es6:!0,browser:!0,greasemonkey:!0}};i.rules["userscripts/align-attributes"]=["warn",2],i.rules["userscripts/require-download-url"]=["warn"];let s=JSON.stringify(i,null,2)},93212(e,t,r){"use strict";r.d(t,{H:()=>i,p:()=>n});class n{zipObject;constructor(e){this.zipObject=e}read(e){return this.zipObject.async(e||"string")}}class i{zip;path;modifiedDate;constructor(e,t,r){this.zip=e,this.path=t,r&&r.modifiedDate&&(this.modifiedDate=r.modifiedDate)}async write(e){let t={};if(this.modifiedDate){let e=new Date(this.modifiedDate);t.date=new Date(e.getTime()-6e4*e.getTimezoneOffset())}this.zip.file(this.path,e,t)}}},41968(e,t,r){"use strict";if(r.d(t,{A:()=>i}),/^(1709|644)$/.test(r.j))var n=r(93212);class i{zip;basePath;constructor(e,t){this.zip=e,this.basePath=t||""}async verify(){}async open(e){let t=e.name,r=this.zip.file(t);if(r)return new n.p(r);throw Error("File not found")}async openDir(e){return new i(this.zip,e)}async create(e,t){return new n.H(this.zip,e,t)}async createDir(e,t){}async delete(e){this.zip.remove(e)}async list(){let e=[];for(let[t,r]of Object.entries(this.zip.files)){let n=r.date,i=new Date(n.getTime()+6e4*n.getTimezoneOffset()).getTime();e.push({name:t,path:t,size:0,digest:"",createtime:i,updatetime:i})}return e}async getDirUrl(){throw Error("Method not implemented.")}}},10108(e,t,r){"use strict";r.d(t,{Kj:()=>a,Ng:()=>o,_z:()=>s});var n=r(6502),i=r(23717);async function s(e,t,r){let s=await e.sendMessage({action:t,data:r}),o=n.A.getInstance().logger().with({action:t,data:r,response:s});if(o.trace("sendMessage"),s?.code)throw console.error(s),s.message;try{return s.data}catch(e){o.trace("Invalid response data",i.A.E(e));return}}function o(e,t,r){return e.connect({action:t,data:r})}class a{msgSender;prefix;constructor(e,t){this.msgSender=e,this.prefix=t,this.prefix&&!this.prefix.endsWith("/")?this.prefix+="/":this.prefix=""}do(e,t){return s(this.msgSender,`${this.prefix}${e}`,t)}async doThrow(e,t){let r=await s(this.msgSender,`${this.prefix}${e}`,t);if(!r)throw Error(`doThrow: ${this.prefix}${e}`);return r}}},27114(e,t,r){"use strict";r.d(t,{S:()=>s});var n=r(70143);class i{get(e){return new Promise(t=>{chrome.storage.session.get(e,r=>{let n=chrome.runtime.lastError;n&&console.error("chrome.runtime.lastError in chrome.storage.session.get:",n),t(r[e])})})}set(e,t){return new Promise(r=>{chrome.storage.session.set({[e]:t},()=>{let e=chrome.runtime.lastError;e&&console.error("chrome.runtime.lastError in chrome.storage.session.set:",e),r()})})}batchSet(e){return new Promise(t=>{chrome.storage.session.set(e,()=>{let e=chrome.runtime.lastError;e&&console.error("chrome.runtime.lastError in chrome.storage.session.set:",e),t()})})}has(e){return new Promise(t=>{chrome.storage.session.get(e,r=>{let n=chrome.runtime.lastError;n&&console.error("chrome.runtime.lastError in chrome.storage.session.get:",n),t(void 0!==r[e])})})}del(e){return new Promise(t=>{chrome.storage.session.remove(e,()=>{let e=chrome.runtime.lastError;e&&console.error("chrome.runtime.lastError in chrome.storage.session.remove:",e),t()})})}dels(e){return new Promise(t=>{chrome.storage.session.remove(e,()=>{let e=chrome.runtime.lastError;e&&console.error("chrome.runtime.lastError in chrome.storage.session.remove:",e),t()})})}clear(){return new Promise(e=>{chrome.storage.session.clear(()=>{let t=chrome.runtime.lastError;t&&console.error("chrome.runtime.lastError in chrome.storage.session.clear:",t),e()})})}list(){return new Promise(e=>{chrome.storage.session.get(null,t=>{let r=chrome.runtime.lastError;r&&console.error("chrome.runtime.lastError in chrome.storage.session.get:",r),e(Object.keys(t))})})}}let s=new class extends i{async getOrSet(e,t){let r=await this.get(e);return r||(r=await t(),this.set(e,r)),r}tx(e,t){return(0,n.e)(e,()=>{let r,n={action:0},i=e=>{n.action=1,n.newVal=e},s=()=>{n.action=2,n.newVal=void 0};return this.get(e).then(e=>t(e,{set:i,del:s})).then(t=>(r=t,1===n.action)?this.set(e,n.newVal):2===n.action?this.del(e):void 0).then(()=>r)})}incr(e,t){return this.tx(e,(e,r)=>(e=(e||0)+t,r.set(e),e))}}},94778(e,t,r){"use strict";r.d(t,{U_:()=>i,kk:()=>n});let n="importFile:",i="scriptInfo:"},76483(e,t,r){"use strict";if(r.d(t,{VH:()=>a,Xb:()=>c,bY:()=>s,eg:()=>i,qv:()=>o}),3295!=r.j)var n=r(8330);let i=3295!=r.j?n.rE:null,s="https://discord.gg/JF76nHCCM7",o="https://docs.scriptcat.org",a="https://ext.scriptcat.org/",c=644==r.j?a+"api/v1/":null},6502(e,t,r){"use strict";r.d(t,{A:()=>i});var n=r(23717);class i{static instance;static getInstance(){return i.instance}static logger(...e){return i.getInstance().logger(...e)}writer;level="info";consoleLevel="warn";labels;constructor(e){this.writer=e.writer,this.level=e.level||this.level,this.labels=e.labels||{},void 0!==e.consoleLevel&&(this.consoleLevel=e.consoleLevel),i.instance||(i.instance=this)}logger(...e){return new n.A(this,this.labels,...e)}}},23717(e,t,r){"use strict";r.d(t,{A:()=>s});var n=r(89991);let i={none:0,trace:10,debug:100,info:1e3,warn:1e4,error:1e5};class s{core;label;constructor(e,...t){this.core=e,this.label=t}log(e,t,...r){let s,o=function(...e){let t={};return e.forEach(e=>{e.forEach(e=>{Object.keys(e).forEach(r=>{t[r]=e[r]})})}),t}(this.label,r);i[e]>=i[this.core.level]&&this.core.writer.write(e,t,o);try{s=JSON.stringify(o)}catch(e){s=o,console.error("Logger label JSON stringify error:",e)}if("none"!==this.core.consoleLevel&&i[e]>=i[this.core.consoleLevel]){"object"==typeof t&&(t=JSON.stringify(t));let r=`${(0,n.U)(new Date,"YYYY-MM-DD HH:mm:ss")} [${e}] ${t}`;switch(e){case"error":console.error(r,s);break;case"warn":console.warn(r,s);break;default:console.info(r,s)}}}with(...e){return new s(this.core,...this.label,...e)}trace(e,...t){this.log("trace",e,...t)}debug(e,...t){this.log("debug",e,...t)}info(e,...t){this.log("info",e,...t)}warn(e,...t){this.log("warn",e,...t)}error(e,...t){this.log("error",e,...t)}static E(e){return"string"==typeof e?{error:e}:e instanceof Error?(console.error(e),{error:e.message}):"object"==typeof e?e:{}}}},25830(e,t,r){"use strict";r.d(t,{A:()=>n});class n{msgSender;action;constructor(e,t="logger"){this.msgSender=e,this.action=t}write(e,t,r){this.msgSender.sendMessage({action:this.action,data:{id:0,level:e,message:t,label:r,createtime:Date.now()}})}}},71189(e,t,r){"use strict";let n,i;function s(){return i?Promise.resolve(i):(n||(n=new Promise(e=>{chrome.storage.local.get(t=>{let r=chrome.runtime.lastError;r&&console.error("chrome.runtime.lastError in chrome.storage.local.get:",r),n=void 0,e(i=t||{})})})),n)}function o(e,t){return"string"==typeof e?Promise.all([s().then(r=>{r[e]=t}),new Promise(r=>{chrome.storage.local.set({[e]:t},()=>{let e=chrome.runtime.lastError;e&&console.error("chrome.runtime.lastError in chrome.storage.local.set:",e),r()})})]).then(()=>t):Promise.all([s().then(t=>{Object.assign(t,e)}),new Promise(t=>{chrome.storage.local.set(e,()=>{let e=chrome.runtime.lastError;e&&console.error("chrome.runtime.lastError in chrome.storage.local.set:",e),t()})})]).then(()=>void 0)}function a(e,t){return new Promise(r=>{chrome.storage.local.set({[e]:t},()=>{let e=chrome.runtime.lastError;e&&console.error("chrome.runtime.lastError in chrome.storage.local.set:",e),r(t)})})}function c(e){return new Promise(t=>{chrome.storage.local.get(e,r=>{let n=chrome.runtime.lastError;n&&console.error("chrome.runtime.lastError in chrome.storage.local.get:",n),t(r[e])})})}function l(e){return new Promise(t=>{chrome.storage.local.remove(e,()=>{let e=chrome.runtime.lastError;e&&console.error("chrome.runtime.lastError in chrome.storage.local.remove:",e),t()})})}function u(e){return new Promise(t=>{chrome.storage.local.remove(e,()=>{let e=chrome.runtime.lastError;e&&console.error("chrome.runtime.lastError in chrome.storage.local.remove:",e),t()})}).catch(async()=>{for(let t of e)await l(t)})}r.d(t,{lc:()=>d});class d{prefix;useCache=!1;constructor(e){this.prefix=e,e.endsWith(":")||(this.prefix+=":")}enableCache(){this.useCache=!0}joinKey(e){return this.prefix+e}async _save(e,t){return(e=this.joinKey(e),this.useCache)?o(e,t):a(e,t)}get(e){if(e=this.joinKey(e),this.useCache){var t;return t=e,s().then(e=>e[t]?Object.assign({},e[t]):e[t])}return c(e)}gets(e){return(e=e.map(e=>this.joinKey(e)),this.useCache)?s().then(t=>e.map(e=>t[e]?Object.assign({},t[e]):t[e])):new Promise(t=>{chrome.storage.local.get(e,r=>{let n=chrome.runtime.lastError;n&&console.error("chrome.runtime.lastError in chrome.storage.local.get:",n),t(e.map(e=>r[e]))})})}getRecord(e){return(e=e.map(e=>this.joinKey(e)),this.useCache)?s().then(t=>{let r={};for(let n of e)t[n]?r[n]=Object.assign({},t[n]):r[n]=t[n];return r}):new Promise(t=>{chrome.storage.local.get(e,e=>{let r=chrome.runtime.lastError;r&&console.error("chrome.runtime.lastError in chrome.storage.local.get:",r),t(e)})})}filter(e,t){let r=[];for(let n in e)n.startsWith(this.prefix)&&(!t||t(n,e[n]))&&r.push(e[n]);return r}async find(e){return this.useCache?s().then(t=>this.filter(t,e).map(e=>e?Object.assign({},e):e)):new Promise(t=>{chrome.storage.local.get(r=>{let n=chrome.runtime.lastError;n&&console.error("chrome.runtime.lastError in chrome.storage.local.get:",n),t(this.filter(r,e))})})}async findOne(e){return this.find(e).then(e=>{if(e.length>0)return e[0]})}delete(e){if(e=this.joinKey(e),this.useCache){var t;return Promise.all([(t=e,s().then(e=>{delete e[t]})),l(e)]).then(()=>void 0)}return l(e)}deletes(e){return(e=e.map(e=>this.joinKey(e)),this.useCache)?s().then(t=>{for(let r of e)delete t[r];return u(e)}):u(e)}update(e,t){return(e=this.joinKey(e),this.useCache)?s().then(r=>{let n=r[e];return!!n&&(Object.assign(n,t),o(e,n))}):c(e).then(r=>!!r&&(Object.assign(r,t),a(e,r)))}updates(e,t){let r;if(Array.isArray(e))for(let n of(r={},e))r[n]=t;else r=e;return this._doUpdates(r).then(t=>Array.isArray(e)?e.map(e=>t[e]):t)}async _doUpdates(e){let t,r=Object.keys(e),n=r.map(e=>this.joinKey(e));t=this.useCache?await s():await new Promise(e=>{chrome.storage.local.get(n,t=>{let r=chrome.runtime.lastError;r&&console.error("chrome.runtime.lastError in chrome.storage.local.get:",r),e(t)})});let i={},a={};for(let s=0;s<r.length;s++){let o=r[s],c=n[s],l=t[c];l?(Object.assign(l,e[o]),a[c]=l,i[o]=l):i[o]=!1}return Object.keys(a).length>0&&(this.useCache?await o(a):await new Promise(e=>{chrome.storage.local.set(a,()=>{let t=chrome.runtime.lastError;t&&console.error("chrome.runtime.lastError in chrome.storage.local.set:",t),e()})})),i}all(){return this.find()}}},50441(e,t,r){"use strict";r.d(t,{$Q:()=>i,Ey:()=>c,Fp:()=>s,OY:()=>o,Pk:()=>u,fn:()=>a,g0:()=>h,h8:()=>g,jo:()=>l,oU:()=>d});var n=r(71189);let i=1,s=2,o=3,a=1,c=2,l="running",u="complete",d="error";class h extends n.lc{scriptCodeDAO=new g;constructor(){super("script")}enableCache(){super.enableCache(),this.scriptCodeDAO.enableCache()}save(e){return super._save(e.uuid,e)}findByUUID(e){return this.get(e)}async getAndCode(e){let[t,r]=await Promise.all([this.get(e),this.scriptCodeDAO.get(e)]);if(t&&r)return Object.assign(t,r)}findByName(e){return this.findOne((t,r)=>r.name===e)}findByNameAndNamespace(e,t){return this.findOne((r,n)=>n.name===e&&(!t||n.namespace===t))}findByUUIDAndSubscribeUrl(e,t){return this.findOne((r,n)=>n.uuid===e&&n.subscribeUrl===t)}findByOriginAndSubscribeUrl(e,t){return this.findOne((r,n)=>n.origin===e&&n.subscribeUrl===t)}async searchExistingScript(e,t=!0){let r=e=>{if(e.startsWith("https://scriptcat.org/scripts/code/")&&e.endsWith(".js")){let t=e.indexOf("/",35),r=e.indexOf("/",t+1);if(t>0&&r<0){let r=e.indexOf(".",t+1);return e.substring(0,t+1)+"*"+e.substring(r)}}if(e.startsWith("https://update.greasyfork.org/scripts/")&&e.endsWith(".js")){let t=e.indexOf("/",38),r=e.indexOf("/",t+1);if(t>0&&r<0){let r=e.indexOf(".",t+1);return e.substring(0,t+1)+"*"+e.substring(r)}}if(e.startsWith("https://openuserjs.org/install/")&&e.endsWith(".js")){let t=e.indexOf("/",31),r=e.indexOf("/",t+1);if(t>0&&r<0){let r=e.indexOf(".",t+1);return e.substring(0,t+1)+"*"+e.substring(r)}}return e},n=(e,t)=>e&&t&&Array.isArray(e)&&Array.isArray(t)?e.length===t.length&&(e.length<2?e[0]===t[0]:new Set([...e,...t]).size===e.length):e===t,i=(e,t)=>!!n(e.metadata.author,t.metadata.author)&&!!n(e.metadata.copyright,t.metadata.copyright)&&!!n(e.metadata.license,t.metadata.license)&&!!n(e.metadata.grant,t.metadata.grant)&&!!n(e.metadata.connect,t.metadata.connect)&&!!n(e.metadata.match,t.metadata.match)&&!!n(e.metadata.include,t.metadata.include)&&!0,{metadata:s,origin:o}=e;if(!o||s?.updateurl?.[0]||s?.downloadurl?.[0])if(!(o&&(s?.updateurl?.[0]||s?.downloadurl?.[0])))return[];else{let n=r(o),a=r(s?.updateurl?.[0]||""),c=r(s?.downloadurl?.[0]||"");return this.find((s,o)=>{if(!o.origin||n!==r(o.origin))return!1;let l=r(o.metadata?.updateurl?.[0]||""),u=r(o.metadata?.downloadurl?.[0]||"");return a===l&&c===u&&(!t||!!i(e,o))})}{let n=r(o);return this.find((s,o)=>!!o.origin&&n===r(o.origin)&&(!t||!!i(e,o)))}}}class g extends n.lc{constructor(){super("scriptCode")}findByUUID(e){return this.get(e)}save(e){return super._save(e.uuid,e)}}},45868(e,t,r){"use strict";r.d(t,{$D:()=>d,CP:()=>u,SL:()=>a,XW:()=>p,bx:()=>s,ic:()=>l,iw:()=>g,rp:()=>c,vz:()=>o,y$:()=>h});var n=r(10108),i=r(51929);class s extends n.Kj{constructor(e){super(e,"serviceWorker")}preparationOffscreen(){return this.do("preparationOffscreen")}}class o extends n.Kj{constructor(e){super(e,"serviceWorker/script")}getAllScripts(){return this.doThrow("getAllScripts")}getInstallInfo(e){return this.do("getInstallInfo",e)}install(e){return e.upsertBy||(e.upsertBy="user"),this.doThrow("install",{...e})}deletes(e){return this.do("deletes",e)}enable(e,t){return this.do("enable",{uuid:e,enable:t})}enables(e,t){return this.do("enables",{uuids:e,enable:t})}info(e){return this.doThrow("fetchInfo",e)}getFilterResult(e){return this.do("getFilterResult",e)}getScriptRunResourceByUUID(e){return this.doThrow("getScriptRunResourceByUUID",e)}excludeUrl(e,t,r){return this.do("excludeUrl",{uuid:e,excludePattern:t,remove:r})}resetMatch(e,t){return this.do("resetMatch",{uuid:e,match:t})}resetExclude(e,t){return this.do("resetExclude",{uuid:e,exclude:t})}requestCheckUpdate(e){return this.do("requestCheckUpdate",e)}sortScript(e){return this.do("sortScript",e)}pinToTop(e){return this.do("pinToTop",e)}importByUrl(e){return this.doThrow("importByUrl",e)}installByCode(e,t,r="user"){return this.do("installByCode",{uuid:e,code:t,upsertBy:r})}setCheckUpdateUrl(e,t,r){return this.do("setCheckUpdateUrl",{uuid:e,checkUpdate:t,checkUpdateUrl:r})}updateMetadata(e,t,r){return this.do("updateMetadata",{uuid:e,key:t,value:r})}async getBatchUpdateRecordLite(e){return this.do("getBatchUpdateRecordLite",e)}async fetchCheckUpdateStatus(){return this.do("fetchCheckUpdateStatus")}async sendUpdatePageOpened(){return this.do("sendUpdatePageOpened")}async batchUpdateListAction(e){return this.do("batchUpdateListAction",e)}async openUpdatePageByUUID(e){return this.do("openUpdatePageByUUID",e)}async openBatchUpdatePage(e){return this.do("openBatchUpdatePage",e)}async checkScriptUpdate(e){return this.do("checkScriptUpdate",e)}}class a extends n.Kj{constructor(e){super(e,"serviceWorker/resource")}getScriptResources(e){return this.doThrow("getScriptResources",e)}deleteResource(e){return this.do("deleteResource",e)}}class c extends n.Kj{constructor(e){super(e,"serviceWorker/value")}getScriptValue(e){return this.doThrow("getScriptValue",e)}setScriptValue({uuid:e,key:t,value:r,ts:n}){let s=[[t,(0,i._8)(r)]];return this.do("setScriptValues",{uuid:e,keyValuePairs:s,ts:n})}setScriptValues(e){return this.do("setScriptValues",e)}}class l extends n.Kj{constructor(e){super(e,"serviceWorker/runtime")}runScript(e){return this.do("runScript",e)}stopScript(e){return this.do("stopScript",e)}pageLoad(){return this.doThrow("pageLoad")}scriptLoad(e,t){return this.do("scriptLoad",{flag:e,uuid:t})}}class u extends n.Kj{constructor(e){super(e,"serviceWorker/popup")}getPopupData(e){return this.doThrow("getPopupData",e)}menuClick(e,t,r){return this.do("menuClick",{uuid:e,menus:t,inputValue:r})}}class d extends n.Kj{constructor(e){super(e,"serviceWorker/runtime/permission")}confirm(e,t){return this.do("confirm",{uuid:e,userConfirm:t})}getPermissionInfo(e){return this.doThrow("getInfo",e)}deletePermission(e,t,r){return this.do("deletePermission",{uuid:e,permission:t,permissionValue:r})}getScriptPermissions(e){return this.doThrow("getScriptPermissions",e)}addPermission(e){return this.do("addPermission",e)}updatePermission(e){return this.do("updatePermission",e)}resetPermission(e){return this.do("resetPermission",e)}}class h extends n.Kj{constructor(e){super(e,"serviceWorker/synchronize")}export(e){return this.do("export",e)}backupToCloud(e,t){return this.do("backupToCloud",{type:e,params:t})}importResources(e,t,r,n){return this.do("importResources",{uuid:e,requires:t,resources:r,requiresCss:n})}}class g extends n.Kj{constructor(e){super(e,"serviceWorker/subscribe")}install(e){return this.do("install",{subscribe:e})}delete(e){return this.do("delete",{url:e})}checkUpdate(e){return this.do("checkUpdate",{url:e})}enable(e,t){return this.do("enable",{url:e,enable:t})}}class p extends n.Kj{constructor(e){super(e,"serviceWorker/system")}connectVSCode(e){return this.do("connectVSCode",e)}}},74695(e,t,r){"use strict";if(r.d(t,{g:()=>u}),!/^(3295|5357)$/.test(r.j))var n=r(23232);if(!/^(3295|5357)$/.test(r.j))var i=r(85698);if(!/^(3295|5357)$/.test(r.j))var s=r(55286);if(!/^(3295|5357)$/.test(r.j))var o=r(79544);if(!/^(3295|5357)$/.test(r.j))var a=r(90179);if(!/^(3295|5357)$/.test(r.j))var c=r(31246);if(!/^(3295|5357)$/.test(r.j))var l=r(46767);function u(e){switch(e){case"en-US":default:return n.A;case"zh-CN":return i.A;case"zh-TW":return s.A;case"ja-JP":return o.A;case"de-DE":return a.A;case"vi-VN":return c.A;case"ru-RU":return l.A}}},12851(e,t,r){"use strict";let n;r.d(t,{Ay:()=>T,Ls:()=>_,MF:()=>y,NC:()=>x,W1:()=>k,ZA:()=>C,ig:()=>j,sg:()=>w,v2:()=>v});var i=r(55974),s=r(88944),o=r(15657),a=r.n(o),c=r(64895),l=r.n(c);if(3295!=r.j)var u=r(79833);if(3295!=r.j)var d=r(77387);if(3295!=r.j)var h=r(59447);if(3295!=r.j)var g=r(94911);if(3295!=r.j)var p=r(32514);if(3295!=r.j)var m=r(86673);if(3295!=r.j)var f=r(62826);if(3295!=r.j)var b=r(79982);r(70986),r(67588),r(75881),r(57645),r(32240),r(27222),r(27396),a().extend(l());let y="";function v(e,t){i.Ay.changeLanguage(e,t),a().locale(e.toLocaleLowerCase())}function x(e="en-US"){i.Ay.use(s.r9).init({fallbackLng:"en-US",lng:e,interpolation:{escapeValue:!1},resources:{"en-US":{title:"English",translation:u},"zh-CN":{title:"简体中文",translation:h},"zh-TW":{title:"繁体中文",translation:g},"ja-JP":{title:"日本語",translation:m},"de-DE":{title:"Deutsch",translation:f},"vi-VN":{title:"Tiếng Việt",translation:d},"ru-RU":{title:"Русский",translation:b},"ach-UG":{title:"伪语言",translation:p}}}),e.startsWith("zh-")||(y="/en")}function w(e){let t=chrome.i18n.getUILanguage();x(globalThis.localStorage&&localStorage.language||t);let r=e=>{y=e.startsWith("zh-")?"":"/en",v(e)};e.getLanguage().then(e=>{n(e),r(e)}),e.addListener("language",r)}new Promise(e=>{n=e});let S=()=>`${i.Ay?.language?.toLowerCase()}`;function k(e){let t=S(),r=e.metadata[`name:${t}`];if(!r){let n=t.split("-")[0];r=e.metadata[`name:${n}`]}return r?r[0]:e.name}function C(e){let t=e.metadata,r=S(),n=t[`description:${r}`];if(!n){let e=r.split("-")[0];n=t[`description:${e}`]}return n?n[0]:t.description?.[0]||""}function _(){return S().startsWith("zh-")}function j(){return chrome.i18n.getAcceptLanguages().then(e=>{for(let t=0;t<e.length;t+=1){let r=e[t];if(i.Ay.hasResourceBundle(r,"translation"))return r}let t={};for(let e of i.Ay.languages){let r=e.split("-")[0];t[r]||(t[r]=[]),t[r].push(e)}for(let r=0;r<e.length;r+=1){let n=e[r].split("-")[0];if(t[n]&&t[n].length>0)return t[n][0]}return""})}let T=/^(3295|5357)$/.test(r.j)?null:i.Ay},24975(e,t,r){"use strict";r.d(t,{A:()=>c});var n=r(25172),i=r(75390),s=r(47112);if(/^6(44|905)$/.test(r.j))var o=r(64446);if(/^6(44|905)$/.test(r.j))var a=r(95883);r(7561).CB.setEditorTheme=e=>i.EN.setTheme(e);let c=/^6(44|905)$/.test(r.j)?s.forwardRef(({id:e,className:t,code:r,diffCode:c,editable:l},u)=>{let[d,h]=(0,s.useState)(),[g,p]=(0,s.useState)(!1),[m,f]=(0,s.useState)(""),b=(0,s.useRef)(null);return(0,s.useImperativeHandle)(u,()=>({editor:d})),(0,s.useEffect)(()=>{Promise.all([o.EO.getEslintConfig(),o.EO.getEnableEslint()]).then(([e,t])=>{f(e),p(t)})},[]),(0,s.useEffect)(()=>{let t;if(void 0===c||void 0===r||!b.current)return()=>{};let n=document.getElementById(e),s={folding:!0,foldingStrategy:"indentation",automaticLayout:!0,scrollbar:{alwaysConsumeMouseWheel:!1},overviewRulerBorder:!1,scrollBeyondLastLine:!1,glyphMargin:!0,unicodeHighlight:{ambiguousCharacters:!1},acceptSuggestionOnCommitCharacter:!0,acceptSuggestionOnEnter:"on",quickSuggestionsDelay:10,suggestOnTriggerCharacters:!0,tabCompletion:"off",suggest:{localityBonus:!0,preview:!0},suggestSelection:"first",wordBasedSuggestions:"off",parameterHints:{enabled:!0},quickSuggestions:{other:!0,comments:!0,strings:!0},fastScrollSensitivity:10,smoothScrolling:!0,inlineSuggest:{enabled:!0},guides:{indentation:!0},renderLineHighlightOnlyWhenFocus:!0,snippetSuggestions:"top",cursorBlinking:"phase",cursorSmoothCaretAnimation:"off",autoIndent:"advanced",wrappingIndent:"indent",wordSegmenterLocales:["ja","zh-CN","zh-Hant-TW"],renderLineHighlight:"gutter",renderWhitespace:"selection",renderControlCharacters:!0,dragAndDrop:!1,emptySelectionClipboard:!1,copyWithSyntaxHighlighting:!1,bracketPairColorization:{enabled:!0},mouseWheelZoom:!0,links:!0,accessibilitySupport:"off",largeFileOptimizations:!0,colorDecorators:!0};return c?(t=i.EN.createDiffEditor(n,{hideUnchangedRegions:{enabled:!0},enableSplitViewResizing:!1,renderSideBySide:!1,readOnly:!0,diffWordWrap:"off",...s})).setModel({original:i.EN.createModel(c,"javascript"),modified:i.EN.createModel(r,"javascript")}):((t=i.EN.create(n,{language:"javascript",theme:"dark"===document.body.getAttribute("arco-theme")?"vs-dark":"vs",readOnly:!l,...s})).setValue(r),h(t)),()=>{t?.dispose()}},[b,r,c,l,e]),(0,s.useEffect)(()=>{let t;if(!g||!d)return()=>{};let r=d.getModel();if(!r)return()=>{};let n=()=>{t&&clearTimeout(t),t=setTimeout(()=>{t=null,a.v.sendLinterMessage({code:r.getValue(),id:e,config:JSON.parse(m)})},500)};n(),r.onDidChangeContent(()=>{n()});let s=t=>{var n;let s,a;if(e!==t.id)return;i.EN.setModelMarkers(r,"ESLint",t.markers);let c=new Map;t.markers.forEach(e=>{e.fix&&c.set(`${e.code.value}|${e.startLineNumber}|${e.endLineNumber}|${e.startColumn}|${e.endColumn}`,e.fix)}),o.Eb.set("eslint-fix",c),n=t.markers.map(({startLineNumber:e,endLineNumber:t,severity:r})=>({startLineNumber:e,endLineNumber:t,severity:r})),s={4:"icon-warn",8:"icon-error"},a=r.getAllDecorations().filter(e=>e.options.glyphMarginClassName&&Object.values(s).includes(e.options.glyphMarginClassName)),d.removeDecorations(a.map(e=>e.id)),d.createDecorationsCollection(n.map(({startLineNumber:e,endLineNumber:t,severity:r})=>({range:new i.Q6(e,1,t,1),options:{isWholeLine:!0,glyphMarginClassName:s[r]}})))};return a.v.hook.addListener("message",s),()=>{a.v.hook.removeListener("message",s)}},[e,d,g,m]),(0,n.jsx)("div",{id:e,className:t,ref:b})}):null},70772(e,t,r){"use strict";r.d(t,{A:()=>G});var n=r(25172);if(!/^(3295|5357|5788)$/.test(r.j))var i=r(97653);if(!/^(3295|5357|5788)$/.test(r.j))var s=r(4971);if(!/^(3295|5357|5788)$/.test(r.j))var o=r(76624);if(!/^(3295|5357|5788)$/.test(r.j))var a=r(99874);if(!/^(3295|5357|5788)$/.test(r.j))var c=r(20529);if(!/^(3295|5357|5788)$/.test(r.j))var l=r(75525);if(!/^(3295|5357|5788)$/.test(r.j))var u=r(35313);if(!/^(3295|5357|5788)$/.test(r.j))var d=r(49268);if(!/^(3295|5357|5788)$/.test(r.j))var h=r(32354);if(!/^(3295|5357|5788)$/.test(r.j))var g=r(19894);if(!/^(3295|5357|5788)$/.test(r.j))var p=r(49281);if(!/^(3295|5357|5788)$/.test(r.j))var m=r(44892);if(!/^(3295|5357|5788)$/.test(r.j))var f=r(37472);if(!/^(3295|5357|5788)$/.test(r.j))var b=r(59720);if(!/^(3295|5357|5788)$/.test(r.j))var y=r(41212);if(!/^(3295|5357|5788)$/.test(r.j))var v=r(71471);if(!/^(3295|5357|5788)$/.test(r.j))var x=r(22484);if(!/^(3295|5357|5788)$/.test(r.j))var w=r(8024);if(!/^(3295|5357|5788)$/.test(r.j))var S=r(70454);var k=r(47112),C=r(88944);if(!/^(3295|5357|5788)$/.test(r.j))var _=r(7561);if(!/^(3295|5357|5788)$/.test(r.j))var j=r(18702);if(!/^(3295|5357|5788)$/.test(r.j))var T=r(51618);var E=r(34900);if(!/^(3295|5357|5788)$/.test(r.j))var U=r(64446);if(!/^(3295|5357|5788)$/.test(r.j))var L=r(12851);if(!/^(3295|5357|5788)$/.test(r.j))var A=r(74695);if(!/^(3295|5357|5788)$/.test(r.j))var M=r(96940);if(!/^(3295|5357|5788)$/.test(r.j))var R=r(53278);if(!/^(3295|5357|5788)$/.test(r.j))var D=r(41994);let P=async e=>{try{let{hostname:t,pathname:r}=new URL(e.replace(/\/$/,""));if(!("scriptcat.org"===t&&/script-show-page\/\d+$/.test(r)))return e;{let e=r.match(/\d+$/)[0],{code:t,data:n,msg:i}=await fetch(`https://scriptcat.org/api/v2/scripts/${e}`).then(e=>e.json()).then(e=>e);if(0!==t)return{success:!1,msg:i};{let t=n.name;return`https://scriptcat.org/scripts/code/${e}/${t}.user.js`}}}catch{return e}},O=async e=>{let t=new TextEncoder().encode(e);return crypto.subtle.digest("SHA-1",t).then(e=>{let t=new Uint8Array(e),r="";for(let e=0;e<t.length;e++){let n=t[e];r+=`${n<16?"0":""}${n.toString(16)}`}return r})},$=async e=>{if(0==e.length)return;let t=await Promise.allSettled(e.map(async e=>{let t=await P(e);return t instanceof Object?await Promise.resolve(t):await T.fH.do("importByUrl",t)})),r={success:0,fail:0,msg:[]};return t.forEach(({value:e},t)=>{e.success?r.success++:(r.fail++,r.msg.push(`#${t+1}: ${e.msg}`))}),r},N=e=>(e=e.closest("button")?.parentNode||e,e=e.closest("span")?.parentNode||e,e=e.closest(".arco-collapse-item-content")?.parentNode||e,e=e.closest(".arco-card")?.parentNode||e,e=e.closest("aside")?.parentNode||e),I=k.memo(({active:e,text:t})=>e?(0,n.jsx)("div",{className:"sc-inset-0",style:{position:"absolute",zIndex:100,display:"flex",justifyContent:"center",alignItems:"center",color:"grey",fontSize:36,backdropFilter:"blur(4px)",background:"var(--color-fill-2)",opacity:.8},children:t}):null);I.displayName="DropzoneOverlay";let G=/^(3295|5357|5788)$/.test(r.j)?null:({children:e,className:t,pageName:r})=>{let[P,G]=i.A.useModal(),{colorThemeState:z,updateColorTheme:B}=(0,_.Us)(),H=(0,k.useRef)(null),[F,V]=(0,k.useState)(!1),[W,q]=(0,k.useState)(!1),{t:K}=(0,C.Bd)(),J=e=>{e&&P.info({title:K("script_import_result"),content:(0,n.jsxs)(s.A,{direction:"vertical",style:{width:"100%"},children:[(0,n.jsx)("div",{style:{textAlign:"center"},children:(0,n.jsxs)(s.A,{size:"small",style:{fontSize:18},children:[(0,n.jsx)(m.A,{style:{color:"green"}}),e.success,"",(0,n.jsx)(f.A,{style:{color:"red"}}),e.fail]})}),e.msg.length>0&&(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)("b",{children:K("failure_info")+":"}),e.msg]})]})})},Y=async e=>{let t=await $(e);t&&J(t)},X=e=>{let t={success:0,fail:0,msg:[]};Promise.all(e.map(async e=>{try{let r=e.handle;if(!r)if(e instanceof FileSystemFileHandle)r=e;else if(e instanceof File){document.getElementById("import-local").value="";let r=new Blob([e],{type:"text/javascript"}),n=(0,D.xM)({blob:r,persistence:!1}),i=await T.fH.importByUrl(n);i.success?t.success++:(t.fail++,t.msg.push(...i.msg));return}else throw Error("Invalid Local File Access");let n=await r.getFile();if(!n.name||!n.size)throw Error("No Read Access Right for File");let i=await Promise.allSettled([n.text().then(e=>(0,M.jo)(e,`file:///*resp-check*/${n.name}`)),O(`f=${n.name}
s=${n.size},m=${n.lastModified}`)]);if("rejected"===i[0].status||!i[0].value||"rejected"===i[1].status)throw Error(K("script_import_failed"));let s=i[1].value;if(await (0,R.cC)(s,r),!window.open(`/src/install.html?file=${s}`,"_blank"))throw Error(K("install_page_open_failed"));t.success++}catch(e){t.fail++,t.msg.push(e.message)}})).then(()=>{J(t)})},{getRootProps:Q,getInputProps:Z,isDragActive:ee}=(0,E.VB)({accept:{"text/javascript":[".js"]},onDrop:X,noClick:!0,noKeyboard:!0});(0,k.useEffect)(()=>{document.body.classList.toggle("dragzone-active",ee)},[ee]);let et=(0,k.useMemo)(()=>[...Object.keys(L.Ay.store.data).filter(e=>"ach-UG"!==e).map(e=>({key:e,title:L.Ay.store.data[e].title})),{key:"help",title:K("help_translate")}],[K]);(0,k.useEffect)(()=>{(0,L.ig)().then(e=>{e||q(!0)})},[]);let er=async()=>{Y(H.current.dom.value.split(`
`).filter(e=>e)),V(!1)};return(0,n.jsxs)(o.Ay,{renderEmpty:()=>(0,n.jsx)(a.A,{description:K("no_data")}),locale:(0,A.g)(L.Ay.language),componentConfig:{Select:{getPopupContainer:e=>N(e)}},getPopupContainer:e=>N(e.parentNode),children:[G,(0,n.jsxs)(c.A,{className:"tw-min-h-screen",children:[(0,n.jsxs)(c.A.Header,{style:{height:"50px",borderBottom:"1px solid var(--color-neutral-3)"},className:"tw-flex tw-items-center tw-justify-between tw-px-4",children:[(0,n.jsx)(i.A,{title:K("import_link"),visible:F,onOk:er,onCancel:()=>{V(!1)},children:(0,n.jsx)(l.A.TextArea,{ref:H,rows:8,placeholder:K("import_script_placeholder"),defaultValue:"",onKeyDown:e=>{e.ctrlKey&&"Enter"===e.key&&(e.preventDefault(),er())}})}),(0,n.jsxs)("div",{className:"tw-flex tw-flex-row tw-items-center",children:[(0,n.jsx)("img",{style:{height:"40px"},src:"/assets/logo.png",alt:"ScriptCat"}),(0,n.jsx)(u.A.Title,{heading:4,className:"!tw-m-0",children:"ScriptCat"})]}),(0,n.jsxs)(s.A,{size:"small",className:"action-tools",children:["options"===r&&(0,n.jsx)(d.A,{droplist:(0,n.jsxs)(h.A,{style:{maxHeight:"100%",width:"calc(100% + 10px)"},children:[(0,n.jsx)(h.A.Item,{children:(0,n.jsxs)("a",{href:"#/script/editor",children:[(0,n.jsx)(j.$lf,{})," ",K("create_user_script")]})},"/script/editor"),(0,n.jsx)(h.A.Item,{children:(0,n.jsxs)("a",{href:"#/script/editor?template=background",children:[(0,n.jsx)(j.JVA,{})," ",K("create_background_script")]})},"background"),(0,n.jsx)(h.A.Item,{children:(0,n.jsxs)("a",{href:"#/script/editor?template=crontab",children:[(0,n.jsx)(j.jcj,{})," ",K("create_scheduled_script")]})},"crontab"),(0,n.jsxs)(h.A.Item,{onClick:()=>{"showOpenFilePicker"in window?window.showOpenFilePicker({multiple:!0,types:[{description:"JavaScript",accept:{"text/javascript":[".js"]}}]}).then(e=>{X(e)}):document.getElementById("import-local")?.click()},children:[(0,n.jsx)(j.z4K,{})," ",K("import_by_local")]},"import_local"),(0,n.jsxs)(h.A.Item,{onClick:()=>{V(!0)},children:[(0,n.jsx)(b.A,{})," ",K("import_link")]},"link")]}),position:"bl",children:(0,n.jsxs)(g.A,{type:"text",size:"small",style:{color:"var(--color-text-1)"},className:"!tw-text-size-sm",children:[(0,n.jsx)(j.ZLe,{})," ",K("create_script")," ",(0,n.jsx)(y.A,{})]})}),(0,n.jsx)(d.A,{droplist:(0,n.jsxs)(h.A,{onClickMenuItem:e=>{B(e)},selectedKeys:[z],children:[(0,n.jsxs)(h.A.Item,{children:[(0,n.jsx)(v.A,{})," ",K("light")]},"light"),(0,n.jsxs)(h.A.Item,{children:[(0,n.jsx)(x.A,{})," ",K("dark")]},"dark"),(0,n.jsxs)(h.A.Item,{children:[(0,n.jsx)(w.A,{})," ",K("system_follow")]},"auto")]}),position:"bl",children:(0,n.jsx)(g.A,{type:"text",size:"small",icon:(0,n.jsxs)(n.Fragment,{children:["auto"===z&&(0,n.jsx)(w.A,{}),"light"===z&&(0,n.jsx)(v.A,{}),"dark"===z&&(0,n.jsx)(x.A,{})]}),style:{color:"var(--color-text-1)"},className:"!tw-text-lg"})}),W&&(0,n.jsx)(d.A,{droplist:(0,n.jsx)(h.A,{children:et.map(e=>(0,n.jsx)(h.A.Item,{onClick:()=>{"help"===e.key?window.open("https://crowdin.com/project/scriptcat","_blank"):(U.EO.setLanguage(e.key),p.A.success(K("language_change_tip")))},children:e.title},e.key))}),children:(0,n.jsx)(g.A,{type:"text",size:"small",iconOnly:!0,icon:(0,n.jsx)(S.A,{}),style:{color:"var(--color-text-1)"},className:"!tw-text-lg"})})]})]}),(0,n.jsxs)(c.A,{className:`tw-bottom-0 tw-w-full ${t}`,style:{background:"var(--color-fill-2)"},...Q({}),children:[(0,n.jsx)("input",{id:"import-local",...Z({style:{display:"none"}})}),(0,n.jsx)(I,{active:ee,text:K("drag_script_here_to_upload")}),e]})]})]})}},30132(e,t,r){"use strict";r.d(t,{ON:()=>f,Q3:()=>b,R7:()=>y,e8:()=>v});var n=r(25172),i=r(47112);if(644==r.j)var s=r(19894);if(644==r.j)var o=r(82059);if(644==r.j)var a=r(4971);if(/^(5788|644|6905)$/.test(r.j))var c=r(59559);if(644==r.j)var l=r(22491);if(644==r.j)var u=r(35059);if(644==r.j)var d=r(14589);if(644==r.j)var h=r(69726);var g=r(88944);if(644==r.j)var p=r(64446);if(644==r.j)var m=r(41994);function f({script:e}){let t,{t:r}=(0,g.Bd)(),i=[];return(e.metadata.homepageurl||(t=function(e){try{if(e.includes("scriptcat.org")){let t=e.split("/")[5];return(0,n.jsx)(s.A,{type:"text",iconOnly:!0,size:"small",target:"_blank",href:`https://scriptcat.org/script-show-page/${t}`,children:(0,n.jsx)("img",{width:16,height:16,src:"/assets/logo.png",alt:""})})}if(e.includes("greasyfork.org")){let t=e.split("/")[4];return(0,n.jsx)(s.A,{type:"text",iconOnly:!0,size:"small",target:"_blank",href:`https://greasyfork.org/scripts/${t}`,children:(0,n.jsx)("img",{width:16,height:16,src:"/assets/logo/gf.png",alt:""})})}if(e.includes("raw.githubusercontent.com")||e.includes("github.com")){let t=`${e.split("/")[3]}/${e.split("/")[4]}`;return(0,n.jsx)(s.A,{type:"text",iconOnly:!0,size:"small",target:"_blank",href:`https://github.com/${t}`,style:{color:"var(--color-text-1)"},icon:(0,n.jsx)(l.A,{})})}}catch(e){console.error(e)}}(e.downloadUrl||"")),t&&i.push((0,n.jsx)(o.A,{content:r("homepage"),children:t})),e.metadata.homepage&&i.push((0,n.jsx)(o.A,{content:r("homepage"),children:(0,n.jsx)(s.A,{type:"text",iconOnly:!0,icon:(0,n.jsx)(u.A,{}),size:"small",href:e.metadata.homepage[0],target:"_blank"})})),e.metadata.homepageurl&&i.push((0,n.jsx)(o.A,{content:r("homepage"),children:(0,n.jsx)(s.A,{type:"text",iconOnly:!0,icon:(0,n.jsx)(u.A,{}),size:"small",href:e.metadata.homepageurl[0],target:"_blank"})})),e.metadata.website&&i.push((0,n.jsx)(o.A,{content:r("script_website"),children:(0,n.jsx)(s.A,{type:"text",iconOnly:!0,icon:(0,n.jsx)(u.A,{}),size:"small",href:e.metadata.website[0],target:"_blank"})})),e.metadata.source&&i.push((0,n.jsx)(o.A,{content:r("script_source"),children:(0,n.jsx)(s.A,{type:"text",iconOnly:!0,icon:(0,n.jsx)(d.A,{}),size:"small",href:e.metadata.source[0],target:"_blank"})})),e.metadata.supporturl&&i.push((0,n.jsx)(o.A,{content:r("bug_feedback_script_support"),children:(0,n.jsx)(s.A,{type:"text",iconOnly:!0,icon:(0,n.jsx)(h.A,{}),size:"small",href:e.metadata.supporturl[0],target:"_blank"})})),0===i.length)?null:(0,n.jsx)(a.A,{size:"mini",children:i.map((e,t)=>(0,n.jsx)("i",{children:e},t))})}function b({script:e,size:t=32,style:r}){let[s,o]=(0,i.useState)(!1);(r=r||{}).display=r.display||"inline-block",r.marginRight=r.marginRight||"8px",r.backgroundColor=r.backgroundColor||"unset";let a=e.metadata,[l]=a.icon||a.iconurl||a.icon64||a.icon64url||[];return l&&!s?(0,n.jsx)(c.A,{size:t||32,shape:"square",style:r,children:(0,n.jsx)("img",{src:l,alt:e?.name,onError:()=>o(!0)})}):(0,n.jsx)(n.Fragment,{})}function y(e){let[t,r]=(0,i.useState)(()=>{let t=`default${(0,m.Cb)(e)}`,n=p.EO[t],i="function"==typeof n?n():void 0;return Promise.resolve(p.EO.get(e)).then(e=>r(e)),i}),n=(0,i.useRef)(t=>{void 0===t?r(t=>(p.EO.set(e,t),t)):(p.EO.set(e,t),r(t))}).current;return(0,i.useEffect)(()=>p.EO.addListener(e,e=>{r(e)}),[e]),[t,r,n]}function v(e){if(!e)return"gray";let t=["red","orangered","orange","gold","lime","green","cyan","arcoblue","purple","pinkpurple","magenta","gray"],r=5381;for(let t=0,n=e.length;t<n;t++)r=33*r^e.charCodeAt(t);let n=(r>>>=0)%t.length;return t[n]}},7561(e,t,r){"use strict";r.d(t,{CB:()=>a,Dv:()=>d,Us:()=>h});var n=r(25172),i=r(47112);if(!/^(3295|5357)$/.test(r.j))var s=r(64446);if(!/^(3295|5357)$/.test(r.j))var o=r(12097);let a=/^(3295|5357)$/.test(r.j)?null:{setEditorTheme:null},c=/^(3295|5357)$/.test(r.j)?null:(0,i.createContext)(void 0),l=!1,u=e=>{switch("dark"!==e&&"light"!==e?(e=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light",l=!0):l=!1,e){case"dark":document.documentElement.classList.add("dark"),document.body.setAttribute("arco-theme","dark"),a.setEditorTheme?.("vs-dark");break;case"light":document.documentElement.classList.remove("dark"),document.body.removeAttribute("arco-theme"),a.setEditorTheme?.("vs")}},d=({children:e})=>{let[t,r]=(0,i.useState)(()=>(u(localStorage.lightMode),window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",()=>{l&&u("auto")}),localStorage.lightMode||"auto")),[a,d]=(0,i.useState)(!1);return(0,i.useEffect)(()=>{let e=new o.b;return e.append((0,s.o)("onColorThemeUpdated",{onColorThemeUpdated({theme:e}){u(e),r(e)}}.onColorThemeUpdated)),e.unhook},[]),(0,n.jsx)(c.Provider,{value:{colorThemeState:t,updateColorTheme:e=>{localStorage.lightMode=e,s.JD.publish("onColorThemeUpdated",{theme:e})},setGuideMode:d,guideMode:a},children:e})};function h(){let e=(0,i.useContext)(c);if(!e)throw Error("useAppContext must be used within an AppProvider");return e}},64446(e,t,r){"use strict";r.d(t,{EO:()=>l,Eb:()=>u,JD:()=>c,iU:()=>d,o:()=>h});var n=r(87424),i=r(98456),s=r(75918),o=r(12851),a=r(45868);let c=new n.j,l=new i.GL(c),u=new Map,d=new s.Dz;new a.XW(d);let h=(e,t)=>c.subscribe(e,e=>{let r=e?.myMessage||e;"object"==typeof r&&t(r)});(0,o.sg)(l)},79434(e,t,r){"use strict";r.d(t,{A:()=>n});class n{prefix;storage;constructor(e,t){this.prefix=`${e}_`,this.storage=t?chrome.storage.sync:chrome.storage.local}buildKey(e){return this.prefix+e}get(e){return new Promise(t=>{e=this.buildKey(e),this.storage.get(e,r=>{t(r&&r[e])})})}set(e,t){return new Promise(r=>{let n={};n[this.buildKey(e)]=t,this.storage.set(n,()=>r())})}remove(e){return new Promise(t=>{this.storage.remove(this.buildKey(e),()=>t())})}removeAll(){return new Promise(e=>{this.storage.clear(()=>e())})}keys(){return new Promise(e=>{let t={},r=this.buildKey("");this.storage.get(n=>{if(!n)return e(t);for(let e of Object.keys(n))e.startsWith(r)&&(t[e.substring(r.length)]=n[e]);return e(t)})})}}},98456(e,t,r){"use strict";if(r.d(t,{GF:()=>h,GL:()=>g,Pm:()=>f}),!/^(3295|5357)$/.test(r.j))var n=r(79434);if(!/^(3295|5357)$/.test(r.j))var i=r(94930);if(!/^(3295|5357)$/.test(r.j))var s=r(87769);if(!/^(3295|5357)$/.test(r.j))var o=r(12851);if(!/^(3295|5357)$/.test(r.j))var a=r(76483);if(!/^(3295|5357)$/.test(r.j))var c=r(76729);if(!/^(3295|5357)$/.test(r.j))var l=r(41994);var u=r(80413);if(!/^(3295|5357)$/.test(r.j))var d=r(60206);let h="systemConfigChange";class g{mq;cache=new Map;syncStorage=new n.A("system",!0);localStorage=new n.A("system",!1);isLocalKey(e){return d.n.has(e)}getStorage(e){return this.isLocalKey(e)?this.localStorage:this.syncStorage}EE=new u.A;constructor(e){this.mq=e,this.mq.subscribe(h,({key:e,value:t,prev:r})=>{this.cache.set(e,t),this.EE.emit(e,t,r)})}addListener(e,t){return this.EE.on(e,t),this.EE.off.bind(this.EE,e,t)}watch(e,t){return this.get(e).then(e=>{t(e,void 0)}),this.addListener(e,t)}resolveDefault(e){return e?.asyncValue?.()||e}async transferSyncToLocal(e,t){let r=await this.syncStorage.get(e);return void 0===r?(this.cache.set(e,void 0),this.resolveDefault(t)):(await this.syncStorage.remove(e),await this.localStorage.set(e,r),this.cache.set(e,r),r)}_get(e,t){if(this.cache.has(e)){let r=this.cache.get(e);return Promise.resolve(void 0===r?this.resolveDefault(t):r)}return this.getStorage(e).get(e).then(r=>void 0!==r?(this.cache.set(e,r),r):this.isLocalKey(e)?this.transferSyncToLocal(e,t):(this.cache.set(e,r),this.resolveDefault(t)))}get(e){let t=`get${(0,l.Cb)(e)}`;if("function"==typeof this[t])return this[t]();throw Error(`Method ${t} does not exist on SystemConfig`)}set(e,t){let r=`set${(0,l.Cb)(e)}`;if("function"==typeof this[r])this[r](t);else throw Error(`Method ${r} does not exist on SystemConfig`)}_set(e,t){let r,n=this.cache.get(e),i=this.getStorage(e);void 0===t?(this.cache.delete(e),r=i.remove(e)):(this.cache.set(e,t),r=i.set(e,t)),r.then(()=>{this.mq.publish(h,{key:e,value:t,prev:n})})}defaultCheckScriptUpdateCycle(){return 86400}getCheckScriptUpdateCycle(){return this._get("check_script_update_cycle",this.defaultCheckScriptUpdateCycle())}setCheckScriptUpdateCycle(e){this._set("check_script_update_cycle",e)}getSilenceUpdateScript(){return this._get("silence_update_script",!1)}setSilenceUpdateScript(e){this._set("silence_update_script",e)}getEnableAutoSync(){return this._get("enable_auto_sync",!0)}setEnableAutoSync(e){this._set("enable_auto_sync",e)}getUpdateDisableScript(){return this._get("update_disable_script",!0)}setUpdateDisableScript(e){this._set("update_disable_script",e)}getVscodeUrl(){return this._get("vscode_url","ws://localhost:8642")}setVscodeUrl(e){this._set("vscode_url",e)}getVscodeReconnect(){return this._get("vscode_reconnect",!1)}setVscodeReconnect(e){this._set("vscode_reconnect",e)}defaultBackup(){return{filesystem:"webdav",params:{}}}getBackup(){return this._get("backup",this.defaultBackup())}setBackup(e){this._set("backup",e)}defaultCloudSync(){return{enable:!1,syncDelete:!1,syncStatus:!0,filesystem:"webdav",params:{}}}getCloudSync(){return this._get("cloud_sync",this.defaultCloudSync())}setCloudSync(e){this._set("cloud_sync",e)}defaultCatFileStorage(){return{status:"unset",filesystem:"webdav",params:{}}}getCatFileStorage(){return this._get("cat_file_storage",this.defaultCatFileStorage())}setCatFileStorage(e){this._set("cat_file_storage",e)}getEnableEslint(){return this._get("enable_eslint",!0)}setEnableEslint(e){this._set("enable_eslint",e)}getEslintConfig(){return this._get("eslint_config",i.s)}setEslintConfig(e){return""===e?void this._set("eslint_config",i.s):(JSON.parse(e),this._set("eslint_config",e))}getEditorConfig(){return this._get("editor_config",s.s)}setEditorConfig(e){return""===e?void this._set("editor_config",s.s):(JSON.parse(e),this._set("editor_config",e))}getEditorTypeDefinition(){return localStorage.getItem("editor_type_definition")||c}setEditorTypeDefinition(e){""===e?delete localStorage.editor_type_definition:localStorage.setItem("editor_type_definition",e)}getLogCleanCycle(){return this._get("log_clean_cycle",7)}setLogCleanCycle(e){this._set("log_clean_cycle",e)}getScriptListColumnWidth(){return this._get("script_list_column_width",{})}setScriptListColumnWidth(e){this._set("script_list_column_width",e)}defaultMenuExpandNum(){return 5}getMenuExpandNum(){return this._get("menu_expand_num",this.defaultMenuExpandNum())}setMenuExpandNum(e){this._set("menu_expand_num",e)}async getLanguage(){if(globalThis.localStorage){let e=localStorage.getItem("language");if(e)return e}return this._get("language",{asyncValue:()=>(0,o.ig)().then(e=>e||chrome.i18n.getUILanguage())}).then(e=>(globalThis.localStorage&&localStorage.setItem("language",`${e}`),e))}setLanguage(e){this._set("language",e),globalThis.localStorage&&localStorage.setItem("language",e)}setCheckUpdate(e){this._set("check_update",{notice:e.notice,version:e.version,isRead:e.isRead})}async getCheckUpdate(e){let t=await this._get("check_update",{notice:"",isRead:!1,version:a.eg});return"function"==typeof e?.sanitizeHTML&&(t.notice=e.sanitizeHTML(t.notice)),t}setEnableScript(e){chrome.extension.inIncognitoContext?this._set("enable_script_incognito",e):this._set("enable_script",e)}async getEnableScript(){if(!chrome.extension.inIncognitoContext)return this._get("enable_script",!0);{let[e,t]=await Promise.all([this._get("enable_script",!0),this._get("enable_script_incognito",!0)]);return e&&t}}async getEnableScriptNormal(){return this._get("enable_script",!0)}async getEnableScriptIncognito(){return this._get("enable_script_incognito",!0)}setBlacklist(e){this._set("blacklist",e)}getBlacklist(){return this._get("blacklist","")}setBadgeNumberType(e){this._set("badge_number_type",e)}getBadgeNumberType(){return this._get("badge_number_type","script_count")}setBadgeBackgroundColor(e){this._set("badge_background_color",e)}getBadgeBackgroundColor(){return this._get("badge_background_color","#4e5969")}setBadgeTextColor(e){this._set("badge_text_color",e)}getBadgeTextColor(){return this._get("badge_text_color","#ffffff")}setScriptMenuDisplayType(e){this._set("script_menu_display_type",e)}getScriptMenuDisplayType(){return this._get("script_menu_display_type","all")}}let p="",m=0,f=e=>(p||(p=((1213056*Math.random()|0)+466560).toString(36).toUpperCase()),e=e.replace(/@name\s+(New Userscript)[\r\n]/g,(e,t)=>e.replace(t,`${t} ${p}-${++m}`)))},60206(e,t,r){"use strict";r.d(t,{n:()=>n});let n=new Set(["cloud_sync","backup","cat_file_storage","vscode_url","vscode_reconnect","language","script_list_column_width","check_update","enable_script","enable_script_incognito"])},70143(e,t,r){"use strict";r.d(t,{e:()=>s});let n=/^(4259|5788|9518)$/.test(r.j)?null:{},i=async e=>{let t;for(;t=e.head;){let{task:r,resolve:n,reject:i}=t;t.task=t.resolve=t.reject=null;try{let e=await r();n(e)}catch(e){i(e)}e.head=t.next,t.next=null}e.tail=null},s=(e,t)=>new Promise((r,s)=>{let o=n[e]||(n[e]={head:null,tail:null}),a={task:t,resolve:r,reject:s,next:null};o.tail?(o.tail.next=a,o.tail=a):(o.head=a,o.tail=a,i(o))})},19883(e,t,r){"use strict";r.d(t,{nT:()=>a,xG:()=>c});var n=r(13932);if(!/^(3295|5788)$/.test(r.j))var i=r(55974);let s=new n.CronTime("* * * * *").sendAt().constructor,o=/^(3295|5357|5788)$/.test(r.j)?null:{1:{unit:"minute",format:"yyyy-MM-dd HH:mm:ss",label:"minute"},2:{unit:"hour",format:"yyyy-MM-dd HH:mm:ss",label:"hour"},3:{unit:"day",format:"yyyy-MM-dd",label:"day"},4:{unit:"month",format:"yyyy-MM",label:"month"},5:{unit:"week",format:"yyyy-MM-dd",label:"week"}},a=(e,t=new Date)=>{let r=l(e,t),n=r.next.toFormat(r.format);return r.once?(0,i.t)(`cron_oncetype.${r.once}`,{next:n}):n},c=e=>{let t=e.trim().split(" "),r=+(5===t.length);if(t.length+r!==6)throw Error((0,i.t)("cron_invalid_expr"));let n=-1;for(let e=0;e<t.length;e++){let i=t[e];if(i.startsWith("once")){n=e+r,t[e]=i.slice(5,-1)||"*";break}}return{cronExpr:t.join(" "),oncePos:n}},l=(e,t=new Date)=>{let r,{cronExpr:a,oncePos:l}=c(e);try{r=new n.CronTime(a)}catch{throw Error((0,i.t)("cron_invalid_expr"))}let u=s.fromJSDate(t),d="yyyy-MM-dd HH:mm:ss",h="";if(l>=1&&l<=5){let e=o[l];h=e.label,d=e.format,u=(u=u.plus({[e.unit]:1}).startOf(e.unit)).minus({milliseconds:1})}return{next:r.getNextDateFrom(u),format:d,once:h}}},89991(e,t,r){"use strict";function n(e){return s(new Date(1e3*e),"YYYY-MM-DD HH:mm:ss")}r.d(t,{H:()=>n,U:()=>s});let i=/YYYY|MM|DD|HH|mm|ss/g;function s(e=new Date,t="YYYY-MM-DD HH:mm:ss"){return t.replace(i,t=>{switch(t){case"YYYY":return e.getFullYear().toString();case"MM":{let t=e.getMonth()+1;return t<10?"0"+t:t.toString()}case"DD":{let t=e.getDate();return t<10?"0"+t:t.toString()}case"HH":{let t=e.getHours();return t<10?"0"+t:t.toString()}case"mm":{let t=e.getMinutes();return t<10?"0"+t:t.toString()}case"ss":{let t=e.getSeconds();return t<10?"0"+t:t.toString()}}return t})}},94718(e,t,r){"use strict";r.d(t,{MU:()=>a,X0:()=>c,hJ:()=>l});var n=r(55499),i=r.n(n);let s=e=>{let t=e?/charset=([^;]+)/i.exec(e):null;return t?t[1].trim().toLowerCase().replace(/['"]/g,""):""},o=(e,t=!0)=>{let r;if(!(e instanceof Uint8Array))throw TypeError("utf32Bytes must be a Uint8Array");let n=e.byteLength;if(n%4!=0)throw RangeError("UTF-32 byte length must be a multiple of 4");let i=n>>>2;if(t)r=new Uint32Array(e.buffer,e.byteOffset,i);else{let t=new DataView(e.buffer,e.byteOffset,n);r=new Uint32Array(i);for(let e=0,i=0;e<n;e+=4)r[i++]=t.getUint32(e,!1)}65279===r[0]&&(r=r.subarray(1));let s="";for(let e=0;e<r.length;e+=16384)s+=String.fromCodePoint(...r.subarray(e,e+16384));return s},a=(e,t)=>"utf-32le"===e?o(t,!0):"utf-32be"===e?o(t,!1):new TextDecoder(e).decode(t),c=(e,t)=>{let r=s(t);if(r)try{return new TextDecoder(r),r}catch(e){console.warn(`Invalid charset from Content-Type header: ${r}, error: ${e.message}`)}let n=Math.min(e.length,16384),o=e.subarray(0,n),c=i().analyse(o),l=0,u=[],d=1/0;for(let e of c){let t,r=e.name.toLowerCase();try{t=a(r,o)}catch{}if(!t)continue;if(l){if(l>70&&e.confidence<30)break;else if(l>50&&e.confidence<20)break}else if((l=e.confidence)>90)return r;let n=new Set(t),i=n.size;!(i>d)&&(n.has("�")&&(i+=Math.max(t.split("�").length-1,1)),u.push({encoding:r,charLen:i}),i<d&&(d=i))}let h=u.find(e=>e.charLen===d);return h?.encoding||"utf-8"},l=async(e,t)=>{let r=new Uint8Array(await e.arrayBuffer());if(0===r.length)return"";let n=s(t);if(n)try{return a(n,r)}catch(e){console.warn(`Invalid charset from Content-Type header: ${n}, error: ${e.message}`)}let i=239===r[0]&&187===r[1]&&191===r[2]?"utf-8":255===r[0]&&254===r[1]?0===r[2]&&0===r[3]?"utf-32le":"utf-16le":254===r[0]&&255===r[1]?"utf-16be":0===r[0]&&0===r[1]&&254===r[2]&&255===r[3]?"utf-32be":null;if(i)return a(i,r);let o=Math.min(r.length,16384);if(r.length%2==0){let e=function(e,t=e.length){if(t<64)return null;let r=[0,0,0,0];for(let n=0;n<t;n++)0===e[n]&&r[3&n]++;let n=r[0]+r[1]+r[2]+r[3];if(n<.07*t)return null;let i=n/t;if(i>.54){let e=r[0]+r[1]+r[2],n=r[1]+r[2]+r[3];return e>4.5*n&&e>.3*t?"utf-32be":n>4.5*e&&n>.3*t?"utf-32le":null}if(i>.1){let e=r[0]+r[2],t=r[1]+r[3];if(e>4.2*t)return"utf-16be";if(t>4.2*e)return"utf-16le";if(e>2.1*t&&i>.2)return"utf-16be";if(t>2.1*e&&i>.2)return"utf-16le"}return null}(r,o);if(e)return a(e,r)}let c="utf-8";try{new TextDecoder("utf-8",{fatal:!0}).decode(r.subarray(0,o))}catch{c="windows-1252"}return a(c,r)}},53278(e,t,r){"use strict";r.d(t,{Vj:()=>a,cC:()=>o,fc:()=>c});var n=r(18075);class i extends n.Ay{handles;constructor(){super("filehandle-temp-dexie"),this.version(1).stores({handles:""}),this.handles=this.table("handles")}}let s=new i;async function o(e,t){await s.handles.put({handle:t,timestamp:Date.now()},e)}async function a(e){let t=await s.handles.get(e);if(t?.handle instanceof FileSystemFileHandle)return t.handle;throw Error("Handle not found or invalid")}async function c(e=9e5){let t=Date.now();await s.handles.filter(r=>t-r.timestamp>e).delete()}},12097(e,t,r){"use strict";r.d(t,{b:()=>n});class n{isMounted=!0;unhooks=[];append(...e){this.unhooks?.push(...e)}unhook=()=>{if(this.isMounted=!1,null!==this.unhooks){for(let e of this.unhooks)e();this.unhooks.length=0,this.unhooks=null}}}},51929(e,t,r){"use strict";r.d(t,{G2:()=>s,_8:()=>o});let n=[1],i=[2],s=e=>{switch(e[0]){case 1:return;case 2:return null;default:return e[1]}},o=e=>{switch(e){case void 0:return n;case null:return i;default:return[0,e]}}},87769(e,t,r){"use strict";r.d(t,{s:()=>n});let n=JSON.stringify({noSemanticValidation:!0,noSyntaxValidation:!1,onlyVisible:!1,allowNonTsExtensions:!0,allowJs:!0,checkJs:!0,noUnusedLocals:!1,noFallthroughCasesInSwitch:!1,noImplicitThis:!1,strict:!0},null,2)},95883(e,t,r){"use strict";r.d(t,{A:()=>u,v:()=>d});var n=r(64446),i=r(80413),s=r(75390);if(/^6(44|905)$/.test(r.j))var o=r(96082);let a=new Worker("/src/linter.worker.js"),c=n.EO.getLanguage(),l={"zh-CN":{title:"简体中文",thisIsAUserScript:"一个用户脚本",undefinedPrompt:"未定义的提示符",quickfix:"修复 {0} 问题",addEslintDisableNextLine:"添加 eslint-disable-next-line 注释",addEslintDisable:"添加 eslint-disable 注释",prompt:{name:"脚本名称",namespace:"脚本命名空间",copyright:"脚本的版权信息",license:"脚本的开源协议",version:"脚本版本",description:"脚本描述",icon:"脚本图标",iconURL:"脚本图标",defaulticon:"脚本图标",icon64:"64x64 大小的脚本图标",icon64URL:"64x64 大小的脚本图标",grant:"脚本特殊 Api 权限申请",author:"脚本作者","run-at":"脚本的运行时间<br>`document-start`：在前端匹配到网址后，以最快的速度注入脚本到页面中<br>`document-end`：DOM 加载完成后注入脚本，此时页面脚本和图像等资源可能仍在加载<br>`document-idle`：所有内容加载完成后注入脚本<br>`document-body`：脚本只会在页面中有 body 元素时才会注入","run-in":"脚本注入的环境",homepage:"脚本主页",homepageURL:"脚本主页",website:"脚本主页",background:"后台脚本",include:"脚本匹配 url 运行的页面",match:"脚本匹配 url 运行的页面",exclude:"脚本匹配 url 不运行的页面",connect:"获取网站的访问权限",resource:"引入资源文件",require:"引入外部 js 文件","require-css":"引入外部 css 文件",noframes:"表示脚本不运行在 `<frame>` 中",compatible:"用于在 GreasyFork 中显示脚本的兼容性支持","inject-into":"脚本注入环境<br>`content`：脚本注入到 content 环境<br>`page`：脚本注入到网页环境（默认）<br>注：SC 不支持以 CSP 判断是否需要脚本注入到 content 环境的 `inject-into: auto` 设计。","early-start":"配合 `run-at: document-start` 的声明，使用 `early-start` 可以比网页更快地加载并执行脚本，但存在一定性能问题与 GM API 使用限制。（SC 独有）",definition:"ScriptCat 特有功能：一个 `.d.ts` 文件的引用地址，能够自动补全编辑器的提示",antifeature:`与脚本市场有关，不受欢迎的功能需要加上此描述值
referral-link：该脚本会修改或重定向到作者的返佣链接
ads：该脚本会在访问的页面上插入广告
payment：该脚本需要付费才能够正常使用
miner：该脚本存在利用用户资源但不为用户产生收益或收益极其微弱的行为
membership：该脚本需要注册会员/关注公众号才能正常使用
tracking：该脚本会追踪你的用户信息`.replace(/\n/g,"<br>"),updateURL:"脚本检查更新的 url",downloadURL:"脚本更新的下载地址",supportURL:"支持站点、bug 反馈页面",source:"脚本源码页",crontab:`定时脚本 crontab 参考（不适用于云端脚本）
* * * * * * 每秒运行一次
* * * * * 每分钟运行一次
0 */6 * * * 每 6 小时的 0 分执行一次
15 */6 * * * 每 6 小时的 15 分执行一次
* once * * * 每小时运行一次
* * once * * 每天运行一次
* 10 once * * 每天 10:00-10:59 运行一次，若 10:04 已运行，本日 10:05-10:59 不再运行
* 1,3,5 once * * 每天 1/3/5 点运行一次，若 1 点已运行，当天 3、5 点不再运行
* */4 once * * 每隔 4 小时检测并运行一次，若 4 点已运行，当天 8/12/16/20/24 点不再运行
* 10-23 once * * 每天 10:00-23:59 运行一次，若 10:04 已运行，当日 10:05-23:59 不再运行
* once 13 * * 每个月 13 号的每小时运行一次`.replace(/\n/g,"<br>")}},"en-US":{title:"English",thisIsAUserScript:"A user script",undefinedPrompt:"Undefined Prompt",quickfix:"Fix {0} Issue",addEslintDisableNextLine:"Add eslint-disable-next-line Comment",addEslintDisable:"Add eslint-disable Comment",prompt:{name:"Script name",namespace:"Script namespace",copyright:"Script copyright information",license:"Script open-source license",version:"Script version",description:"Script description",icon:"Script icon",iconURL:"Script icon",defaulticon:"Script icon",icon64:"64x64 script icon",icon64URL:"64x64 script icon",grant:"Request special script API permissions",author:"Script author","run-at":"When the script runs<br>`document-start`: inject as early as possible after URL match<br>`document-end`: inject after DOM has loaded (images etc. may still load)<br>`document-idle`: inject after all content has finished loading<br>`document-body`: inject only when a body element exists","run-in":"Environment in which the script is injected",homepage:"Script homepage",homepageURL:"Script homepage",website:"Script homepage",background:"Background script",include:"Pages whose URLs match and run this script",match:"Pages whose URLs match and run this script",exclude:"Pages whose URLs match and do NOT run this script",connect:"Sites the script can access",resource:"Imported resource files",require:"Imported external JS files","require-css":"Imported external CSS files",noframes:"Do not run the script inside `<frame>`",compatible:"Compatibility information shown on GreasyFork","inject-into":"Script injection context<br>`content`: inject into content context<br>`page`: inject into page context (default)<br>Note: SC does not support `inject-into: auto`, which chooses context based on CSP.","early-start":"Used with `run-at: document-start`. `early-start` lets the script execute even earlier than the page, but may affect performance and limit GM APIs. (SC only)",definition:"ScriptCat-only: URL of a `.d.ts` file used for editor auto-completion",antifeature:"For script markets: describe any unwanted or controversial features",updateURL:"URL used to check for script updates",downloadURL:"URL used to download script updates",supportURL:"Support site / bug report page",source:"Script source code page",crontab:`Scheduled script crontab examples (not for cloud scripts)
* * * * * * Run every second
* * * * * Run every minute
0 */6 * * * Run once at minute 0 every 6 hours
15 */6 * * * Run once at minute 15 every 6 hours
* once * * * Run once every hour
* * once * * Run once every day
* 10 once * * Run once between 10:00-10:59 each day; if it runs at 10:04, it won't run again that day between 10:05-10:59
* 1,3,5 once * * Run once at 1:00, 3:00, 5:00 each day; if it runs at 1:00, it won't run again at 3:00 or 5:00
* */4 once * * Check and run once every 4 hours; if it runs at 4:00, it won't run again that day at 8:00, 12:00, 16:00, 20:00, 24:00
* 10-23 once * * Run once between 10:00-23:59 each day; if it runs at 10:04, it won't run again that day between 10:05-23:59
* once 13 * * Run once every hour on the 13th day of each month`.replace(/\n/g,"<br>")}},"zh-TW":{title:"繁體中文",thisIsAUserScript:"一個使用者腳本",undefinedPrompt:"未定義的提示符",quickfix:"修復 {0} 問題",addEslintDisableNextLine:"新增 eslint-disable-next-line 註解",addEslintDisable:"新增 eslint-disable 註解",prompt:{name:"腳本名稱",namespace:"腳本命名空間",copyright:"腳本的版權資訊",license:"腳本的開源協議",version:"腳本版本",description:"腳本描述",icon:"腳本圖示",iconURL:"腳本圖示",defaulticon:"腳本圖示",icon64:"64x64 大小的腳本圖示",icon64URL:"64x64 大小的腳本圖示",grant:"腳本特殊 Api 權限申請",author:"腳本作者","run-at":"腳本的執行時間<br>`document-start`：在前端匹配到網址後，以最快速度將腳本注入頁面<br>`document-end`：DOM 載入完成後注入腳本，此時頁面腳本與圖像資源可能仍在載入<br>`document-idle`：所有內容載入完成後注入腳本<br>`document-body`：僅在頁面存在 body 元素時才注入腳本","run-in":"腳本注入的環境",homepage:"腳本首頁",homepageURL:"腳本首頁",website:"腳本首頁",background:"背景腳本",include:"腳本匹配 url 執行的頁面",match:"腳本匹配 url 執行的頁面",exclude:"腳本匹配 url 不執行的頁面",connect:"取得網站的存取權限",resource:"引入資源檔案",require:"引入外部 js 檔","require-css":"引入外部 css 檔",noframes:"表示腳本不在 `<frame>` 中執行",compatible:"用於在 GreasyFork 中顯示腳本相容性資訊","inject-into":"腳本注入環境<br>`content`：將腳本注入 content 環境<br>`page`：將腳本注入網頁環境（預設）<br>註：SC 不支援依據 CSP 判斷是否注入 content 環境的 `inject-into: auto`。","early-start":"配合 `run-at: document-start` 使用，`early-start` 可以比網頁更早載入並執行腳本，但可能造成效能問題與 GM API 限制。（SC 獨有）",definition:"ScriptCat 特有功能：一個 `.d.ts` 檔案的引用網址，可啟用編輯器自動提示",antifeature:"與腳本市場相關，不受歡迎的功能需要在此描述",updateURL:"腳本檢查更新的 url",downloadURL:"腳本更新的下載網址",supportURL:"支援站點、錯誤回報頁面",source:"腳本原始碼頁面",crontab:`排程腳本 crontab 參考（不適用於雲端腳本）
* * * * * * 每秒執行一次
* * * * * 每分鐘執行一次
0 */6 * * * 每 6 小時的第 0 分執行一次
15 */6 * * * 每 6 小時的第 15 分執行一次
* once * * * 每小時執行一次
* * once * * 每天執行一次
* 10 once * * 每天 10:00-10:59 執行一次，若在 10:04 已執行，當日 10:05-10:59 不再執行
* 1,3,5 once * * 每天 1/3/5 點執行一次，若 1 點已執行，當天 3、5 點不再執行
* */4 once * * 每隔 4 小時檢查並執行一次，若 4 點已執行，當天 8/12/16/20/24 點不再執行
* 10-23 once * * 每天 10:00-23:59 執行一次，若 10:04 已執行，當日 10:05-23:59 不再執行
* once 13 * * 每月 13 號的每小時執行一次`.replace(/\n/g,"<br>")}},"ja-JP":{title:"日本語",thisIsAUserScript:"ユーザースクリプト",undefinedPrompt:"未定義のプロンプト",quickfix:"{0} の問題を修正",addEslintDisableNextLine:"eslint-disable-next-line コメントを追加",addEslintDisable:"eslint-disable コメントを追加",prompt:{name:"スクリプト名",namespace:"スクリプトの名前空間",copyright:"スクリプトの著作権情報",license:"スクリプトのライセンス",version:"スクリプトのバージョン",description:"スクリプトの説明",icon:"スクリプトのアイコン",iconURL:"スクリプトのアイコン",defaulticon:"スクリプトのアイコン",icon64:"64x64 サイズのスクリプトアイコン",icon64URL:"64x64 サイズのスクリプトアイコン",grant:"スクリプトが要求する特別な API 権限",author:"スクリプトの作者","run-at":"スクリプトの実行タイミング<br>`document-start`：URL がマッチした直後、できるだけ早くスクリプトを注入<br>`document-end`：DOM 読み込み完了後に注入（画像などは読み込み中の可能性あり）<br>`document-idle`：ページ内のすべての読み込み完了後に注入<br>`document-body`：body 要素が存在する場合のみ注入","run-in":"スクリプトを注入するコンテキスト",homepage:"スクリプトのホームページ",homepageURL:"スクリプトのホームページ",website:"スクリプトのホームページ",background:"バックグラウンドスクリプト",include:"スクリプトを実行する URL パターン",match:"スクリプトを実行する URL パターン",exclude:"スクリプトを実行しない URL パターン",connect:"アクセス権を要求するサイト",resource:"読み込むリソースファイル",require:"読み込む外部 JS ファイル","require-css":"読み込む外部 CSS ファイル",noframes:"スクリプトを `<frame>` 内では実行しない",compatible:"GreasyFork に表示される互換性情報","inject-into":"スクリプトの注入コンテキスト<br>`content`：コンテンツスクリプト環境に注入<br>`page`：ページコンテキストに注入（既定）<br>注：SC は CSP に基づき自動でコンテキストを切り替える `inject-into: auto` には対応していません。","early-start":"`run-at: document-start` と併用します。`early-start` を指定するとページよりも早くスクリプトを実行できますが、パフォーマンスへの影響や GM API の制限が発生する場合があります（SC 独自機能）。",definition:"ScriptCat 専用機能：`.d.ts` ファイルの URL。エディタの補完を有効にします。",antifeature:"スクリプトマーケット向け：好まれない機能がある場合、ここに説明を記載します。",updateURL:"スクリプト更新を確認する URL",downloadURL:"スクリプト更新をダウンロードする URL",supportURL:"サポートサイト・バグ報告ページ",source:"スクリプトのソースコードページ",crontab:`スケジュールスクリプトの crontab 例（クラウドスクリプトには非対応）
* * * * * * 毎秒実行
* * * * * 毎分実行
0 */6 * * * 6 時間ごとに 0 分に 1 回実行
15 */6 * * * 6 時間ごとに 15 分に 1 回実行
* once * * * 毎時 1 回実行
* * once * * 毎日 1 回実行
* 10 once * * 毎日 10:00-10:59 の間に 1 回実行。10:04 に実行された場合、その日は 10:05-10:59 に再実行されません
* 1,3,5 once * * 毎日 1/3/5 時に 1 回実行。1 時に実行された場合、その日は 3 時と 5 時に再実行されません
* */4 once * * 4 時間ごとに確認して 1 回実行。4 時に実行された場合、その日は 8/12/16/20/24 時に再実行されません
* 10-23 once * * 毎日 10:00-23:59 の間に 1 回実行。10:04 に実行された場合、その日は 10:05-23:59 に再実行されません
* once 13 * * 毎月 13 日の各時間帯で 1 回実行`.replace(/\n/g,"<br>")}},"de-DE":{title:"Deutsch",thisIsAUserScript:"Ein Benutzerskript",undefinedPrompt:"Undefinierter Prompt",quickfix:"{0}-Problem beheben",addEslintDisableNextLine:"eslint-disable-next-line Kommentar hinzuf\xfcgen",addEslintDisable:"eslint-disable Kommentar hinzuf\xfcgen",prompt:{name:"Skriptname",namespace:"Skript-Namensraum",copyright:"Urheberrechtsinformationen des Skripts",license:"Open-Source-Lizenz des Skripts",version:"Skriptversion",description:"Skriptbeschreibung",icon:"Skript-Symbol",iconURL:"Skript-Symbol",defaulticon:"Skript-Symbol",icon64:"64x64 Skript-Symbol",icon64URL:"64x64 Skript-Symbol",grant:"Angeforderte spezielle API-Berechtigungen",author:"Skriptautor","run-at":"Zeitpunkt der Skriptausf\xfchrung<br>`document-start`: so fr\xfch wie m\xf6glich nach URL-Match injizieren<br>`document-end`: nach dem Laden des DOM injizieren (Bilder usw. k\xf6nnen noch laden)<br>`document-idle`: nach vollst\xe4ndigem Laden aller Inhalte injizieren<br>`document-body`: nur injizieren, wenn ein body-Element vorhanden ist","run-in":"Kontext, in den das Skript injiziert wird",homepage:"Skript-Homepage",homepageURL:"Skript-Homepage",website:"Skript-Homepage",background:"Hintergrundskript",include:"Seiten-URLs, auf denen das Skript ausgef\xfchrt wird",match:"Seiten-URLs, auf denen das Skript ausgef\xfchrt wird",exclude:"Seiten-URLs, auf denen das Skript nicht ausgef\xfchrt wird",connect:"Websites, auf die das Skript zugreifen darf",resource:"Zu ladende Ressourcendateien",require:"Zu ladende externe JS-Dateien","require-css":"Zu ladende externe CSS-Dateien",noframes:"Skript nicht innerhalb von `<frame>` ausf\xfchren",compatible:"Kompatibilit\xe4tsinformationen f\xfcr GreasyFork","inject-into":"Skript-Injektionskontext<br>`content`: in den Content-Kontext injizieren<br>`page`: in den Seitenkontext injizieren (Standard)<br>Hinweis: SC unterst\xfctzt `inject-into: auto` nicht, bei dem der Kontext \xfcber CSP gew\xe4hlt wird.","early-start":"Wird mit `run-at: document-start` verwendet. `early-start` l\xe4sst das Skript noch vor der Seite laufen, kann aber die Leistung beeintr\xe4chtigen und GM-APIs einschr\xe4nken. (Nur in SC)",definition:"Nur f\xfcr ScriptCat: URL zu einer `.d.ts`-Datei f\xfcr Editor-Autovervollst\xe4ndigung",antifeature:"F\xfcr Script-Marktpl\xe4tze: hier unerw\xfcnschte oder kontroverse Funktionen beschreiben",updateURL:"URL zur Aktualisierungspr\xfcfung des Skripts",downloadURL:"URL zum Herunterladen von Skriptaktualisierungen",supportURL:"Support-Seite / Bugtracker",source:"Quellcode-Seite des Skripts",crontab:`Beispiele f\xfcr geplante Skripte (crontab, nicht f\xfcr Cloud-Skripte)
* * * * * * Jede Sekunde ausf\xfchren
* * * * * Jede Minute ausf\xfchren
0 */6 * * * Alle 6 Stunden zur Minute 0 ausf\xfchren
15 */6 * * * Alle 6 Stunden zur Minute 15 ausf\xfchren
* once * * * Einmal pro Stunde ausf\xfchren
* * once * * Einmal pro Tag ausf\xfchren
* 10 once * * Einmal t\xe4glich zwischen 10:00-10:59; wenn um 10:04 ausgef\xfchrt, an diesem Tag nicht erneut zwischen 10:05-10:59
* 1,3,5 once * * Einmal t\xe4glich um 1:00, 3:00, 5:00; wenn um 1:00 ausgef\xfchrt, an diesem Tag nicht erneut um 3:00 oder 5:00
* */4 once * * Alle 4 Stunden pr\xfcfen und einmal ausf\xfchren; wenn um 4:00 ausgef\xfchrt, an diesem Tag nicht erneut um 8:00, 12:00, 16:00, 20:00, 24:00
* 10-23 once * * Einmal t\xe4glich zwischen 10:00-23:59; wenn um 10:04 ausgef\xfchrt, an diesem Tag nicht erneut zwischen 10:05-23:59
* once 13 * * Einmal st\xfcndlich am 13. Tag jedes Monats ausf\xfchren`.replace(/\n/g,"<br>")}},"vi-VN":{title:"Tiếng Việt",thisIsAUserScript:"Một user script",undefinedPrompt:"Prompt chưa được định nghĩa",quickfix:"Sửa lỗi {0}",addEslintDisableNextLine:"Th\xeam ch\xfa th\xedch eslint-disable-next-line",addEslintDisable:"Th\xeam ch\xfa th\xedch eslint-disable",prompt:{name:"T\xean script",namespace:"Namespace của script",copyright:"Th\xf4ng tin bản quyền của script",license:"Giấy ph\xe9p m\xe3 nguồn mở của script",version:"Phi\xean bản script",description:"M\xf4 tả script",icon:"Biểu tượng script",iconURL:"Biểu tượng script",defaulticon:"Biểu tượng script",icon64:"Biểu tượng script k\xedch thước 64x64",icon64URL:"Biểu tượng script k\xedch thước 64x64",grant:"Quyền API đặc biệt m\xe0 script y\xeau cầu",author:"T\xe1c giả script","run-at":"Thời điểm chạy script<br>`document-start`: ch\xe8n script sớm nhất c\xf3 thể sau khi khớp URL<br>`document-end`: ch\xe8n sau khi DOM tải xong (ảnh v.v. c\xf3 thể vẫn đang tải)<br>`document-idle`: ch\xe8n sau khi to\xe0n bộ nội dung đ\xe3 tải xong<br>`document-body`: chỉ ch\xe8n khi trang c\xf3 phần tử body","run-in":"Ngữ cảnh m\xe0 script được ch\xe8n v\xe0o",homepage:"Trang chủ script",homepageURL:"Trang chủ script",website:"Trang chủ script",background:"Script nền (background)",include:"Trang c\xf3 URL khớp v\xe0 chạy script",match:"Trang c\xf3 URL khớp v\xe0 chạy script",exclude:"Trang c\xf3 URL khớp nhưng KH\xd4NG chạy script",connect:"Trang web m\xe0 script được ph\xe9p truy cập",resource:"Tệp t\xe0i nguy\xean được import",require:"Tệp JS b\xean ngo\xe0i được import","require-css":"Tệp CSS b\xean ngo\xe0i được import",noframes:"Kh\xf4ng chạy script b\xean trong `<frame>`",compatible:"Th\xf4ng tin tương th\xedch hiển thị tr\xean GreasyFork","inject-into":"Ngữ cảnh ch\xe8n script<br>`content`: ch\xe8n v\xe0o ngữ cảnh content<br>`page`: ch\xe8n v\xe0o ngữ cảnh trang (mặc định)<br>Lưu \xfd: SC kh\xf4ng hỗ trợ `inject-into: auto`, lựa chọn ngữ cảnh dựa tr\xean CSP.","early-start":"D\xf9ng c\xf9ng với `run-at: document-start`. `early-start` cho ph\xe9p script chạy sớm hơn cả trang, nhưng c\xf3 thể g\xe2y ảnh hưởng hiệu năng v\xe0 giới hạn một số GM API. (Chỉ c\xf3 trong SC)",definition:"T\xednh năng ri\xeang của ScriptCat: URL tới tệp `.d.ts` gi\xfap bật gợi \xfd tự động trong tr\xecnh soạn thảo",antifeature:"D\xf9ng cho chợ script: m\xf4 tả c\xe1c t\xednh năng kh\xf4ng được người d\xf9ng ưa th\xedch",updateURL:"URL d\xf9ng để kiểm tra cập nhật script",downloadURL:"URL tải về bản cập nhật script",supportURL:"Trang hỗ trợ / b\xe1o lỗi",source:"Trang m\xe3 nguồn script",crontab:`V\xed dụ crontab cho script chạy định kỳ (kh\xf4ng \xe1p dụng cho script tr\xean cloud)
* * * * * * Chạy mỗi gi\xe2y
* * * * * Chạy mỗi ph\xfat
0 */6 * * * Chạy 1 lần v\xe0o ph\xfat 0 mỗi 6 giờ
15 */6 * * * Chạy 1 lần v\xe0o ph\xfat 15 mỗi 6 giờ
* once * * * Chạy 1 lần mỗi giờ
* * once * * Chạy 1 lần mỗi ng\xe0y
* 10 once * * Chạy 1 lần mỗi ng\xe0y trong khoảng 10:00-10:59; nếu chạy l\xfac 10:04 th\xec h\xf4m đ\xf3 kh\xf4ng chạy lại trong 10:05-10:59
* 1,3,5 once * * Chạy 1 lần l\xfac 1:00, 3:00, 5:00 mỗi ng\xe0y; nếu chạy l\xfac 1:00 th\xec h\xf4m đ\xf3 kh\xf4ng chạy lại l\xfac 3:00 hoặc 5:00
* */4 once * * Kiểm tra v\xe0 chạy 1 lần mỗi 4 giờ; nếu chạy l\xfac 4:00 th\xec h\xf4m đ\xf3 kh\xf4ng chạy lại l\xfac 8:00, 12:00, 16:00, 20:00, 24:00
* 10-23 once * * Chạy 1 lần mỗi ng\xe0y trong khoảng 10:00-23:59; nếu chạy l\xfac 10:04 th\xec h\xf4m đ\xf3 kh\xf4ng chạy lại trong 10:05-23:59
* once 13 * * Chạy 1 lần mỗi giờ v\xe0o ng\xe0y 13 hằng th\xe1ng`.replace(/\n/g,"<br>")}},"ru-RU":{title:"Русский",thisIsAUserScript:"Пользовательский скрипт",undefinedPrompt:"Неопределённый промпт",quickfix:"Исправить проблему {0}",addEslintDisableNextLine:"Добавить комментарий eslint-disable-next-line",addEslintDisable:"Добавить комментарий eslint-disable",prompt:{name:"Имя скрипта",namespace:"Пространство имён скрипта",copyright:"Информация об авторских правах скрипта",license:"Лицензия с открытым исходным кодом",version:"Версия скрипта",description:"Описание скрипта",icon:"Иконка скрипта",iconURL:"Иконка скрипта",defaulticon:"Иконка скрипта",icon64:"Иконка скрипта 64x64",icon64URL:"Иконка скрипта 64x64",grant:"Запрашиваемые специальные права доступа к API",author:"Автор скрипта","run-at":"Момент запуска скрипта<br>`document-start`: внедрить как можно раньше после совпадения URL<br>`document-end`: внедрить после загрузки DOM (изображения и др. могут ещё загружаться)<br>`document-idle`: внедрить после полной загрузки содержимого<br>`document-body`: внедрить только если на странице есть элемент body","run-in":"Контекст, в который внедряется скрипт",homepage:"Домашняя страница скрипта",homepageURL:"Домашняя страница скрипта",website:"Домашняя страница скрипта",background:"Фоновый скрипт",include:"Страницы, на которых скрипт выполняется (совпадение URL)",match:"Страницы, на которых скрипт выполняется (совпадение URL)",exclude:"Страницы, на которых скрипт НЕ выполняется (совпадение URL)",connect:"Сайты, к которым скрипт может обращаться",resource:"Подключаемые ресурсные файлы",require:"Подключаемые внешние JS-файлы","require-css":"Подключаемые внешние CSS-файлы",noframes:"Не запускать скрипт внутри `<frame>`",compatible:"Информация о совместимости, отображаемая на GreasyFork","inject-into":"Контекст внедрения скрипта<br>`content`: внедрить в контекст content<br>`page`: внедрить в контекст страницы (по умолчанию)<br>Примечание: SC не поддерживает `inject-into: auto`, когда контекст выбирается по CSP.","early-start":"Используется совместно с `run-at: document-start`. `early-start` позволяет выполнять скрипт раньше загрузки страницы, но может ухудшать производительность и ограничивать некоторые GM API. (Только в SC)",definition:"Особенность ScriptCat: URL файла `.d.ts`, используемого для автодополнения в редакторе",antifeature:"Для маркетплейсов скриптов: опишите здесь нежелательные / спорные функции",updateURL:"URL для проверки обновлений скрипта",downloadURL:"URL для загрузки обновлений скрипта",supportURL:"Страница поддержки / отчёта об ошибках",source:"Страница с исходным кодом скрипта",crontab:`Примеры crontab для планового запуска скриптов (не для облачных скриптов)
* * * * * * Запуск каждую секунду
* * * * * Запуск каждую минуту
0 */6 * * * Запуск раз в 6 часов в 00 минут
15 */6 * * * Запуск раз в 6 часов в 15 минут
* once * * * Запуск раз в час
* * once * * Запуск раз в день
* 10 once * * Запуск раз в день между 10:00-10:59; если выполнен в 10:04, в этот день не запустится снова между 10:05-10:59
* 1,3,5 once * * Запуск раз в день в 1:00, 3:00, 5:00; если выполнен в 1:00, в этот день не запустится в 3:00 и 5:00
* */4 once * * Проверка и запуск раз в 4 часа; если выполнен в 4:00, в этот день не запустится в 8:00, 12:00, 16:00, 20:00, 24:00
* 10-23 once * * Запуск раз в день между 10:00-23:59; если выполнен в 10:04, в этот день не запустится снова между 10:05-23:59
* once 13 * * Запуск каждый час в течение 13-го числа месяца`.replace(/\n/g,"<br>")}}};function u(){window.MonacoEnvironment={getWorkerUrl:(e,t)=>"typescript"===t||"javascript"===t?"/src/ts.worker.js":"/src/editor.worker.js"};let e=l["en-US"],t=t=>{let r=(t=t||"")&&(t in l?t:"en-US")||"en-US";e=l[r]};c.then(e=>{t(e)}),n.EO.addListener("language",e=>{t(e)});let r=/\/\/[ \t]*@(\S+)[ \t]*(.*)$/;s.eo.registerHoverProvider("javascript",{provideHover:(t,n)=>new Promise(i=>{let s=t.getLineContent(n.lineNumber),o=r.exec(s);if(o){let t=o[1];i({contents:[{value:e.prompt[t]||e.undefinedPrompt,supportHtml:!0}]})}else i(/==UserScript==/.test(s)?{contents:[{value:e.thisIsAUserScript}]}:null)})}),s.eo.registerCodeActionProvider("javascript",{provideCodeActions:(t,r,i)=>{let s=[],a=n.Eb.get("eslint-fix");for(let r=0;r<i.markers.length;r+=1){let n=i.markers[r],c="string"==typeof n.code?n.code:n.code.value,l=a.get(`${c}|${n.startLineNumber}|${n.endLineNumber}|${n.startColumn}|${n.endColumn}`);if(l){let r={resource:t.uri,textEdit:{range:l.range,text:l.text},versionId:void 0};s.push({title:e.quickfix.replace("{0}",`${c}`),diagnostics:[n],kind:"quickfix",edit:{edits:[r]},isPreferred:!0})}if("no-undef"===c){let e=(n.message||"").match(/^[^']*'([^']+)'[^']*$/),r=e&&e[1];if(r){let e,{insertLine:i,globalLine:a}=(0,o.IK)(t);if(null!=a){let n=t.getLineContent(a),i=(0,o.Gh)(n,r);e={range:{startLineNumber:a,startColumn:1,endLineNumber:a,endColumn:n.length+1},text:i}}else e={range:{startLineNumber:i,startColumn:1,endLineNumber:i,endColumn:1},text:`/* global ${r} */
`};s.push({title:`将 '${r}' 声明为全局变量 (/* global */)`,diagnostics:[n],kind:"quickfix",edit:{edits:[{resource:t.uri,textEdit:e,versionId:void 0}]},isPreferred:!1})}}s.push({title:e.addEslintDisableNextLine,diagnostics:[n],kind:"quickfix",edit:{edits:[{resource:t.uri,textEdit:{range:{startLineNumber:n.startLineNumber,endLineNumber:n.startLineNumber,startColumn:1,endColumn:1},text:`// eslint-disable-next-line ${"string"==typeof n.code?n.code:n.code.value}
`},versionId:void 0}]},isPreferred:!0}),s.push({title:e.addEslintDisable,diagnostics:[n],kind:"quickfix",edit:{edits:[{resource:t.uri,textEdit:{range:{startLineNumber:1,endLineNumber:1,startColumn:1,endColumn:1},text:`/* eslint-disable ${"string"==typeof n.code?n.code:n.code.value} */
`},versionId:void 0}]},isPreferred:!0})}return{actions:s,dispose:()=>{}}}}),Promise.all([n.EO.getEditorConfig(),n.EO.getEditorTypeDefinition()]).then(([e,t])=>{let r=JSON.parse(e);s.eo.typescript.javascriptDefaults.setCompilerOptions({allowNonTsExtensions:!0,...r}),s.eo.typescript.javascriptDefaults.addExtraLib(t,"scriptcat.d.ts")})}class d{static hook=new i.A;static sendLinterMessage(e){a.postMessage(e)}}a.onmessage=e=>{d.hook.emit("message",e.data)}},96082(e,t,r){"use strict";r.d(t,{Gh:()=>i,IK:()=>n});let n=e=>{let t=e.getLineCount(),r=1,n=null,i=1;for(;i<=t;){let s=e.getLineContent(i).trim();if(""===s||s.startsWith("//")){i+=1;continue}if(s.startsWith("/*")){for(/^\/\*\s*global\b/.test(s)&&(n=i);i<=t&&!e.getLineContent(i).includes("*/");)i+=1;i+=1;continue}r=i;break}return r>t&&(r=t+1),{insertLine:r,globalLine:n}},i=(e,t)=>{if(RegExp("(?:^|[\\s,]|global\\s+)"+t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"(?=[\\s,]|\\*/|$)").test(e))return e;let r=e.lastIndexOf("*/");if(-1===r)return e+", "+t;let n=e.slice(0,r).trimEnd(),i=e.slice(r),s=!/global\s*$/.test(n)&&!/[, ]$/.test(n);return n+(s?", ":" ")+t+" "+i}},96940(e,t,r){"use strict";if(r.d(t,{SU:()=>m,jR:()=>h,jo:()=>p}),!/^(3295|5357|5788)$/.test(r.j))var n=r(11104);if(!/^(3295|5357|5788)$/.test(r.j))var i=r(50441);if(6905==r.j)var s=r(41329);if(!/^(3295|5357|5788)$/.test(r.j))var o=r(19883);if(!/^(3295|5357|5788)$/.test(r.j))var a=r(22124);if(!/^(3295|5357|5788)$/.test(r.j))var c=r(55974);if(!/^(3295|5357|5788)$/.test(r.j))var l=r(94718);let u=/\/\/[ \t]*==User(Script|Subscribe)==([\s\S]+?)\/\/[ \t]*==\/User\1==/m,d=/\/\/[ \t]*@(\S+)[ \t]*(.*)$/gm;function h(e){let t,r,n=!1;if(!(r=u.exec(e)))return null;n="Subscribe"===r[1],t=r[2];let i={};for(d.lastIndex=0;null!==(r=d.exec(t));){let e=r[1].toLowerCase(),t=r[2]?.trim()??"";(i[e]||(i[e]=[])).push(t)}return!i.name||Object.keys(i).length<3?null:(i.namespace||(i.namespace=[""]),n&&(i.usersubscribe=[]),i)}async function g(e){let t=await fetch(e,{headers:{"Cache-Control":"no-cache"}});if(200!==t.status)throw Error("fetch script info failed");if(t.headers.get("content-type")?.includes("text/html"))throw Error("url is html");return await (0,l.hJ)(t,t.headers.get("content-type"))}async function p(e,t,r,s=!1,l,u){let d,m;l=l??new i.g0;let f=function(e,t,r){let s=h(e);if(!s)throw Error((0,c.t)("error_metadata_invalid"));if(!s.name?.[0])throw Error((0,c.t)("error_script_name_required"));if(void 0===s.namespace)throw Error((0,c.t)("error_script_namespace_required"));let l=i.$Q;if(void 0!==s.crontab){l=i.Fp;try{(0,o.nT)(s.crontab[0])}catch{throw Error((0,c.t)("error_cron_invalid",{expr:s.crontab[0]}))}}else void 0!==s.background&&(l=i.OY);let u="",d="",g=t;s.updateurl&&s.downloadurl?([d]=s.updateurl,[g]=s.downloadurl):d=t.replace("user.js","meta.js"),(t.startsWith("http://")||t.startsWith("https://"))&&(u=new URL(t).hostname);let p=r||(0,n.g)(),m=(0,a.B)(e),f=Date.now();return{uuid:p,name:s.name[0],author:s.author&&s.author[0],namespace:s.namespace[0],originDomain:u,origin:t,checkUpdate:!0,checkUpdateUrl:d,downloadUrl:g,config:m,metadata:s,selfMetadata:{},sort:-1,type:l,status:i.Ey,runStatus:i.Pk,createtime:f,updatetime:f,checktime:f}}(e,t,r);if(r&&(d=await l.get(r)),d||r&&!s||(d=await l.findByNameAndNamespace(f.name,f.namespace)),!d&&u?.byWebRequest){let e=await l.searchExistingScript(f);if(1===e.length){let t=e[0]?.checkUpdateUrl;if(t)try{let r=await g(t),n=r?h(r):null;n&&n.name[0]===f.name&&(n.namespace?.[0]||"")===f.namespace&&(d=e[0])}catch{}}}let b=e=>e?.grant?.includes("none")&&e?.grant?.some(e=>e.startsWith("GM")),y=e=>{if(e){for(let t of Object.values(e))if(t&&new Set(t).size!==t.length)return!0}};if(u?.byEditor&&b(f.metadata)&&(!d||!b(d.metadata)))throw Error((0,c.t)("error_grant_conflict"));if(u?.byEditor&&y(f.metadata)&&(!d||!y(d.metadata)))throw Error((0,c.t)("error_metadata_line_duplicated"));if(d){if(d.type===i.$Q&&f.type!==i.$Q||f.type===i.$Q&&d.type!==i.$Q)throw Error((0,c.t)("error_script_type_mismatch"));let e=await new i.h8().get(d.uuid);if(!e)throw Error((0,c.t)("error_old_script_code_missing"));m=e;let{uuid:t,createtime:r,lastruntime:n,error:s,sort:o,selfMetadata:a,subscribeUrl:l,checkUpdate:u,status:h}=d;Object.assign(f,{uuid:t,createtime:r,lastruntime:n,error:s,sort:o,selfMetadata:a||{},subscribeUrl:l,checkUpdate:u,status:h})}else f.type===i.$Q&&(f.status=i.fn),f.checktime=Date.now();return{script:f,oldScript:d,oldScriptCode:m?.code}}async function m(e,t){let r=new s.T9,n=h(e);if(!n)throw Error((0,c.t)("error_metadata_invalid"));if(void 0===n.name)throw Error((0,c.t)("error_subscribe_name_required"));let i=Date.now(),o={url:t,name:n.name[0],code:e,author:n.author&&n.author[0]||"",scripts:{},metadata:n,status:s.Gw,createtime:i,updatetime:i,checktime:i},a=await r.findByUrl(t);if(a){let{url:e,scripts:t,createtime:r,status:n}=a;Object.assign(o,{url:e,scripts:t,createtime:r,status:n})}return{subscribe:o,oldSubscribe:a}}},41994(e,t,r){"use strict";function n(e,t){return Math.floor(Math.random()*(t-e+1))+e}function i(){return`-${Date.now().toString(36)}.${n(8e11,2e12).toString(36)}`}function s(e){switch(typeof e){case"string":case"number":case"boolean":case"object":return typeof e;default:return"unknown"}}function o(e){if(""===e)return;let t=e[0],r=e.substring(1);switch(t){case"b":return"true"===r;case"n":return parseFloat(r);case"o":try{return JSON.parse(r)}catch{return e}case"s":return r;default:return e}}async function a(){let[e]=await chrome.tabs.query({active:!0,lastFocusedWindow:!0});if(!e?.discarded)return e}function c(e){return new Promise(t=>{setTimeout(t,e)})}function l(e){let t=e.metadata?.storagename;return t?t[0]:e.uuid}async function u(){if(chrome.extension.inIncognitoContext)return!0;try{if(chrome.userScripts,"function"!=typeof chrome.userScripts?.getScripts)return!1;let e=await chrome.userScripts.getScripts({ids:["scriptcat-content","scriptcat-inject"]});if(!e||"object"!=typeof e||"number"!=typeof e.length)return!1;if(e[0]?.id)return!0;{let e=`undefined-id-${Date.now()}`;return await chrome.userScripts.register([{id:e,js:[{code:"void 0;"}],matches:["https://not-found.scriptcat.org/"],world:"USER_SCRIPT"}]),await chrome.userScripts.unregister({ids:[e]}),!0}}catch(e){return console.error("checkUserScriptsAvailable error:",e),!1}}r.d(t,{B$:()=>u,Cb:()=>w,Im:()=>n,L4:()=>l,Sk:()=>m,Z5:()=>i,_x:()=>s,bw:()=>a,dZ:()=>h,fY:()=>x,fx:()=>g,hy:()=>y,i:()=>f,mt:()=>o,sn:()=>C,v6:()=>k,wI:()=>b,xM:()=>p,yy:()=>c,z3:()=>S,zr:()=>v});var d,h=5788==r.j?((d={})[d.Edge=2]="Edge",d[d.Chrome=1]="Chrome",d[d.chromeA=4]="chromeA",d[d.chromeB=8]="chromeB",d[d.chromeC=16]="chromeC",d[d.edgeA=32]="edgeA",d):null;function g(){let e={firefox:0,webkit:0,chrome:0,unknown:0,chromeVersion:0};if("u">typeof mozInnerScreenX)e.firefox=1;else if("object"==typeof webkitIndexedDB)e.webkit=1;else if("function"==typeof webkitRequestAnimationFrame){let t=navigator.userAgent.includes("Edg/"),r=function(){try{return Number(navigator.userAgent.match(/(Chrome|Chromium)\/([0-9]+)/)?.[2])}catch(e){return console.error("Error getting browser version:",e),0}}();e.chrome|=t?2:1,e.chrome|=4*(r<120),e.chrome|=r<138?8:16,t&&(e.chrome|=32*(r>=144)),e.chromeVersion=r}else e.unknown=1;return e}let p=(e,t)=>{if("function"!=typeof URL?.createObjectURL){if(!t)throw Error("URL.createObjectURL is not supported");return t(e)}{let t=URL.createObjectURL(e.blob);return e.persistence||setTimeout(()=>{URL.revokeObjectURL(t)},6e4),t}};function m(e){return new Promise(t=>{let r=new FileReader;r.onloadend=function(){t(this.result)},r.readAsDataURL(e)})}function f(e){let t=e.split(",")[0].split(":")[1].split(";")[0],r=atob(e.split(",")[1]),n=new Uint8Array(new ArrayBuffer(r.length));for(let e=0;e<r.length;e+=1)n[e]=r.charCodeAt(e);return new Blob([n],{type:t})}function b(e){return btoa(encodeURIComponent(e).replace(/%([0-9A-F]{2})/g,(e,t)=>String.fromCharCode(parseInt(`0x${t}`,16))))}function y(e){let t=e.indexOf("==UserScript=="),r=e.indexOf("==/UserScript==");return -1===t||-1===r?null:`// ${e.substring(t,r+15)}`}function v(e){let t=e.indexOf("==UserConfig=="),r=e.indexOf("==/UserConfig==");return -1===t||-1===r?null:`/* ${e.substring(t,r+15)} */`}let x=e=>e?e.split(`
`).map(e=>e.trim()).filter(e=>e):[];function w(e){return e.replace(/^[a-z]|_([a-z])/g,(e,t=e)=>t.toUpperCase())}let S=(e,t=2)=>{if(0===e)return"0 B";let r=Math.floor(Math.log(e)/Math.log(1024)),n=e/Math.pow(1024,r);return`${n.toFixed(t)} ${["B","KB","MB","GB","TB"][r]}`},k=e=>{if(!e)return"";let t="";return e.split(`
`).forEach(e=>{let r=e.indexOf(":");if(r>0){let n=e.substring(0,r),i=e.substring(r+1).trim();t+=`${n}:${i}\r
`}}),t.substring(0,t.length-2)},C=e=>{let t=new Date(Date.UTC(e.getFullYear(),e.getMonth(),e.getDate()));t.setUTCDate(t.getUTCDate()+4-(t.getUTCDay()||7));let r=new Date(Date.UTC(t.getUTCFullYear(),0,1));return Math.ceil(((t.getTime()-r.getTime())/864e5+1)/7)}},11104(e,t,r){"use strict";r.d(t,{g:()=>i});var n=r(73207);let i="function"==typeof crypto.randomUUID?crypto.randomUUID.bind(crypto):n.A},22124(e,t,r){"use strict";r.d(t,{B:()=>i});var n=r(87518);function i(e){let t=/\/\*\s*==UserConfig==([\s\S]+?)\s*==\/UserConfig==\s*\*\//m.exec(e);if(!t)return;let r=t[1].trim().split(/[-]{3,}/),i={},s=new Set;for(let e of r){let t=(0,n.qg)(e);if(t&&"object"==typeof t)for(let[e,r]of Object.entries(t)){if(!r||"object"!=typeof r)throw Error(`UserConfig group "${e}" is not a valid object.`);i[e]=r,"#options"!==e&&(s.add(e),Object.keys(i[e]||{}).forEach((t,r)=>{let n=i[e];n[t]&&"object"==typeof n[t]&&(n[t].index=n[t].index||r)}))}}return i["#options"]={sort:Array.from(s)},i}},8330(e){"use strict";e.exports={rE:"1.3.2"}}}]);