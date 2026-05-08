(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
const gm = require('gmail-js');
const jq = require('jquery');

window._gmailjs = window._gmailjs || new gm.Gmail(jq);

},{"gmail-js":2,"jquery":3}],2:[function(require,module,exports){
///////////////////////////////////////////
// gmail.js
// Kartik Talwar
// https://github.com/KartikTalwar/gmail.js
//

/*eslint-env es6*/

var Gmail = function(localJQuery) {

    /*
      Use the provided "jQuery" if possible, in order to avoid conflicts with
      other extensions that use $ for other purposes.
    */
    var $;
    if (localJQuery === false) {
        // leave $ undefined, which may be fine for some purposes.
    } else if (typeof localJQuery !== "undefined") {
        $ = localJQuery;
    } else if (typeof jQuery !== "undefined") {
        $ = jQuery;
    } else {
        throw new Error("GmailJS requires jQuery to be present in global scope or provided as a constructor argument.");
    }

    var window_opener = typeof (window) !== "undefined" ? window.opener : null;
    if (window_opener) {
        try {
            // access to window.opener domain will fail in case of cross-origin access
            var opener_domain = window_opener.document.domain;
            if (opener_domain !== window.document.domain) {
                console.warn("GmailJS: window.opener domain differs from window domain.");
                window_opener = null;
            }
        } catch (error) {
            console.warn("GmailJS: Unable to access window.opener!", error);
            window_opener = null;
        }
    }

    /** @type Gmail */
    var api = {
        get : {},
        observe : {},
        check : { data: {}},
        tools : {},
        tracker : {},
        dom : {},
        chat : {},
        compose : {},
        helper : {get: {}}
    };

    api.DISABLE_OLD_GMAIL_API_DEPRECATION_WARNINGS = false;

    function oldGmailApiDeprecated(text = "Migrate to new API compatible with new Gmail to silence this warning!") {
        if (api.DISABLE_OLD_GMAIL_API_DEPRECATION_WARNINGS) {
            return;
        }

        console.warn("GmailJS: using deprecated API for old Gmail.", text);
    }

    api.version           = "0.8.0";
    api.tracker.globals   = typeof GLOBALS !== "undefined"
        ? GLOBALS
        : (
            window_opener && window_opener.GLOBALS || []
        );
    api.tracker.view_data = typeof VIEW_DATA !== "undefined"
        ? VIEW_DATA
        : (
            window_opener && window_opener.VIEW_DATA || []
        );
    api.tracker.ik        = api.tracker.globals[9] || "";
    api.tracker.mla       = undefined;
    api.tracker.hangouts  = undefined;

    // cache-store for passively pre-fetched/intercepted email-data from load_email_data.
    api.cache = {};
    api.cache.debug_xhr_fetch = false;
    api.cache.emailIdCache = {};
    api.cache.emailLegacyIdCache = {};
    api.cache.threadCache = {};

    api.get.last_active = function() {
        var data = api.tracker.globals[17][15];
        return {
            time : data[1],
            ip : data[3],
            mac_address : data[9],
            time_relative : data[10]
        };
    };


    /**
     * Gets list of logged in accounts.
     *
     * @returns {GmailLoggedInAccount[]}
     */
    api.get.loggedin_accounts = function() {
        const data = api.tracker.mla;

        if (!Array.isArray(data)) {
            return [];
        }

        return data[1].map(item => ({
            name: item[4],
            email: item[0],
            index: item[3]
        }));
    };


    api.get.user_email = function() {
        let user_email = api.tracker.globals[10];
        if (user_email) {
            return user_email;
        }

        const elements = document.getElementsByClassName("eYSAde");
        for (const el of elements) {
            if (el.innerHTML.indexOf("@") === -1) {
                return el.innerHTML;
            }
        }

        // give up
        return null;
    };


    api.get.manager_email = function() {
        if (api.helper.get.is_delegated_inbox()) {
            return api.get.delegated_to_email();
        }

        return api.get.user_email();
    };


    /**
     * Gets email of current logged-in user, who views delegated account inbox.
     *
     * @returns {string|null} Returns null when Gmail is opened for a non-delegated account or when there is no
     * information about current logged-in user.
     */
    api.get.delegated_to_email = function() {
        if (!api.helper.get.is_delegated_inbox()) {
            return null;
        }

        const userIndexPrefix = "/u/";
        const pathname = window.location.pathname;
        const delegatedToUserIndex = parseInt(pathname.substring(pathname.indexOf(userIndexPrefix) + userIndexPrefix.length), 10);

        const loggedInAccounts = api.get.loggedin_accounts();
        const loggedInAccount = loggedInAccounts.find(account => account.index === delegatedToUserIndex);

        return loggedInAccount ? loggedInAccount.email : null;
    };

    api.helper.get.is_locale = function(locale) {
        // A locale is a string that begins with 2 letters, either lowercase or uppercase
        // The "lowercase" check distinguishes locales from other 2-letter strings like "US"
        // (the user"s location?).
        if (!locale || ((typeof locale) !== "string") || locale.length < 2) {
            return false;
        }

        if (locale.match(/[0-9]/)) {
            return false;
        }

        var localePrefix = locale.slice(0, 2);
        return localePrefix.toLowerCase() === localePrefix ||
            localePrefix.toUpperCase() === localePrefix;
    };

    api.helper.filter_locale = function(locale) {
        if (!api.helper.get.is_locale(locale)) {
            return null;
        }

        // strip region-denominator
        return locale.substring(0,2).toLowerCase();
    };

    api.helper.array_starts_with = function(list, item) {
        if (list && list.length > 0 && list[0] === item) {
            return true;
        } else {
            return false;
        }
    };

    api.helper.get.array_sublist = function(nestedArray, itemKey) {
        if (nestedArray) {
            for(var i=0; i<nestedArray.length; i++) {
                var list = nestedArray[i];
                if (api.helper.array_starts_with(list, itemKey)) {
                    return list;
                }
            }
        }

        return null;
    };

    api.helper.get.locale_from_url_params = function(value) {
        // check if is URL
        if (value && value.indexOf && (value.indexOf("https://") === 0 || value.indexOf("http://") === 0)) {
            var urlParts = value.split("?");
            if (urlParts.length > 1) {
                var hash = urlParts[1];
                var hashParts = hash.split("&");
                for (var i=0; i < hashParts.length; i++)
                {
                    var kvp = hashParts[i].split("=");
                    if (kvp.length === 2 && kvp[0] === "hl") {
                        return kvp[1];
                    }
                }
            }
        }

        return null;
    };

    api.helper.get.locale_from_globals_item = function(list) {
        if (!list) {
            return null;
        }

        for (var i=0; i<list.length; i++) {
            var item = list[i];
            var locale = api.helper.get.locale_from_url_params(item);
            if (locale) {
                return locale;
            }
        }

        // fallback to user-locale
        return list[8];
    };

    api.get.localization = function() {
        var globals = api.tracker.globals;

        // candidate is globals[17]-subarray which starts with "ui"
        // has historically been observed as [7], [8] and [9]!
        var localeList = api.helper.get.array_sublist(globals[17], "ui");
        if (localeList !== null && localeList.length > 8) {
            let locale = api.helper.get.locale_from_globals_item(localeList);
            locale = api.helper.filter_locale(locale);
            if (locale) {
                return locale;
            }
        }

        // in new gmail, globals[12] may contain a link to an help-article, with a hl= language-code
        if (globals[12] !== null) {
            let locale = api.helper.get.locale_from_url_params(globals[12]);
            locale = api.helper.filter_locale(locale);
            if (locale) {
                return locale;
            }
        }

        // and in even newer gmail this seems to work:
        if (globals[4]) {
            let locale = globals[4].split(".")[1];
            locale = api.helper.filter_locale(locale);
            if (locale) {
                return locale;
            }
        }

        return null;
    };

    api.check.is_new_data_layer = function () {
        return window["GM_SPT_ENABLED"] === "true";
    };

    api.check.is_new_gui = function () {
        return window.GM_RFT_ENABLED === "true";
    };

    api.check.is_thread = function() {
        // There are currently two selectors in use for view_thread: Bu and nH,
        // Which correspond to two different ways a thread may be viewed by the user.
        // There are two different code paths to determine if we are within a thread.

        // This is the nH path:
        // this should match the sub_selector (nH -> if/iY):
        var check_1 = $(".nH .if,.iY").children(":eq(1)").children().children(":eq(1)").children();

        // And this is the Bu path. We don't bother here checking for the sub_selector.
        var check_2 = api.get.email_ids();

        return check_1.length > 1 || check_2.length > 1;
    };

    /**
    * New contact selection UI as announced in
    * https://workspaceupdates.googleblog.com/2021/10/visual-updates-for-composing-email-in-gmail.html
    **/
    api.check.is_peoplekit_compose = function (el) {
        return $(el).find("div[name=to] input[peoplekit-id]").length !== 0;
    };

    api.dom.inbox_content = function() {
        return $("div[role=main]:first");
    };


    api.check.is_preview_pane = function() {
        var dom = api.dom.inbox_content();
        var boxes = dom.find("[gh=tl]");

        var previewPaneFound = false;
        boxes.each(function() {
            if($(this).hasClass("aia")) {
                previewPaneFound = true;
            }
        });

        return previewPaneFound;
    };

    api.check.is_multiple_inbox = function() {
        var dom = api.dom.inboxes();
        return dom.length > 1;
    };


    api.check.is_horizontal_split = function() {
        var dom = api.dom.inbox_content();
        var box = dom.find("[gh=tl]").find(".nn");

        return box.length === 0;
    };


    api.check.is_vertical_split = function() {
        return api.check.is_horizontal_split() === false;
    };


    api.check.is_tabbed_inbox = function() {
        return document.querySelectorAll(".aKh").length === 1;
    };


    api.check.is_right_side_chat = function() {
        var chat = document.querySelectorAll(".ApVoH");
        if(chat.length === 0) {
            return false;
        }

        return chat[0].getAttribute("aria-labelledby") === ":wf";
    };

    api.check.should_compose_fullscreen = function(){
        console.warn("gmail.js: This function is known to be unreliable, and may be deprecated in a future release.");
        var bx_scfs = [];
        try {
            bx_scfs = api.tracker.globals[17][4][1][32];
        } catch(er) {
            bx_scfs = ["bx_scfs","false"];
        }
        return (bx_scfs[1] === "true" ) ? true : false;
    };


    api.check.is_google_apps_user =function() {
        var email = api.get.user_email();
        return email.indexOf("gmail.com", email.length - "gmail.com".length) === -1;
    };


    api.get.storage_info = function() {
        var div = document.querySelector(".md.mj div");
        var used = div.querySelectorAll("span")[0].textContent.replace(/,/g, '.'); //convert to standard decimal
        var total = div.querySelectorAll("span")[1].textContent.replace(/,/g, '.');
        var percent = parseFloat(used.replace(/[^0-9\.]/g, "")) * 100 / parseFloat(total.replace(/[^0-9\.]/g, ""));
        return {used : used, total : total, percent : Math.floor(percent)};
    };


    api.dom.inboxes = function() {
        var dom = api.dom.inbox_content();
        return dom.find("[gh=tl]");
    };

    api.dom.email_subject = function () {
        var e = $(".hP");

        for(var i=0; i<e.length; i++) {
            if($(e[i]).is(":visible")) {
                return $(e[i]);
            }
        }

        return $();
    };


    api.get.email_subject = function() {
        var subject_dom = api.dom.email_subject();

        return subject_dom.text();
    };


    api.dom.email_body = function() {
        return $(".nH.hx");
    };

    api.dom.toolbar = function() {
        var tb = $("[gh='mtb']");

        while($(tb).children().length === 1){
            tb = $(tb).children().first();
        }

        return tb;
    };

    api.dom.right_toolbar = function() {
        return $("[gh='tm'] .Cr.aqJ");
    };

    api.check.is_inside_email = function() {
        if(api.get.current_page() !== "email" && !api.check.is_preview_pane()) {
            return false;
        }

        var items = document.querySelectorAll(".ii.gt .a3s");
        var ids = [];

        for(var i=0; i<items.length; i++) {
            var mail_id = items[i].getAttribute("class").split(" ")[2];
            if(mail_id !== "undefined" && mail_id !== undefined) {
                ids.push(items[i]);
            }
        }

        return ids.length > 0;
    };

    api.check.is_plain_text = function() {
        var settings = api.tracker.globals[17][4][1];

        for (var i = 0; i < settings.length; i++) {
            var plain_text_setting = settings[i];
            if (plain_text_setting[0] === "bx_cm") {
                return plain_text_setting[1] === "0";
            }
        }

        // default to rich text mode, which is more common nowadays
        return false;
    };

    api.dom.email_contents = function() {
        var items = document.querySelectorAll(".ii.gt div.a3s.aXjCH");
        var ids = [];

        for(var i=0; i<items.length; i++) {
            var mail_id = items[i].getAttribute("class").split(" ")[2];
            var is_editable = items[i].getAttribute("contenteditable");
            if(mail_id !== "undefined" && mail_id !== undefined) {
                if(is_editable !== "true") {
                    ids.push(items[i]);
                }
            }
        }

        return ids;
    };


    api.get.email_ids = function() {
        oldGmailApiDeprecated();

        if(api.check.is_inside_email()) {
            var data = api.get.email_data();
            return Object.keys(data.threads);
        }
        return [];
    };


    api.get.compose_ids = function() {
        var ret = [];
        var dom = document.querySelectorAll(".M9 [name=draft]");
        for(var i = 0; i < dom.length; i++) {
            if(dom[i].value !== "undefined"){
                ret.push(dom[i].value);
            }
        }
        return ret;
    };

    api.get.thread_id = function() {
        oldGmailApiDeprecated();

        // multiple elements contains this attribute, but only the visible header of the visible email is a H2!
        const elem = document.querySelector("h2[data-legacy-thread-id]");
        if (elem !== null) {
            return elem.dataset.legacyThreadId;
        }
        else {
            // URL-based analysis is unreliable!
            return undefined;
        }
    };

    api.get.email_id = function() {
        oldGmailApiDeprecated();

        return api.get.thread_id();
    };

    api.check.is_priority_inbox = function() {
        return document.querySelector(".qh") !== null;
    };


    api.check.is_rapportive_installed = function() {
        return document.querySelector("#rapportive-sidebar") !== null;
    };


    api.check.is_streak_installed = function() {
        return document.querySelector("[id^='bentoBox'],[id*=' bentoBox'],[class*=' bentoBox'],[class*='bentoBox']") !== null;
    };


    api.check.is_anydo_installed = function() {
        return document.querySelector("[id^='anydo'],[id*=' anydo'],[class*=' anydo'],[class*='anydo']") !== null;
    };


    api.check.is_boomerang_installed = function() {
        return document.querySelector("[id^='b4g_'],[id*=' b4g_'],[class*=' b4g_'],[class*='b4g_']") !== null;
    };


    api.check.is_xobni_installed = function() {
        return document.querySelector("#xobni_frame") !== null;
    };


    api.check.is_signal_installed = function() {
        return document.querySelector("[id^='Signal'],[id*=' Signal'],[class*=' signal'],[class*='signal']") !== null;
    };


    api.check.are_shortcuts_enabled = function() {
        var flag_name = "bx_hs";
        var flag_value = undefined;

        var check = true; // Flag possibly missing in convo view.

        var array_with_flag = api.tracker.globals[17][4][1];

        for(var i=0; i<array_with_flag.length; i++) {
            var current = array_with_flag[i];

            if(current[0] === flag_name) {
                flag_value = current[1];
                break;
            }
        }

        if(flag_value !== undefined) {
            var values = {
                "0": true,
                "1": false
            };

            check = values[flag_value];
        }

        return check;
    };


    api.dom.get_left_sidebar_links = function() {
        return $("div[role=navigation] [title]");
    };

    api.dom.header = function() {
        return $("#gb");
    };

    api.dom.search_bar = function() {
        return $("[gh=sb]");
    };


    api.get.search_query = function() {
        var dom = api.dom.search_bar();
        return dom.find("input")[0].value;
    };


    api.get.unread_inbox_emails = function() {
        return api.helper.get.navigation_count("inbox");
    };


    api.get.unread_draft_emails = function() {
        return api.helper.get.navigation_count("drafts");
    };


    api.get.unread_spam_emails = function() {
        return api.helper.get.navigation_count("spam");
    };


    api.get.unread_forum_emails = function() {
        return api.helper.get.navigation_count("forums");
    };


    api.get.unread_update_emails = function() {
        return api.helper.get.navigation_count("updates");
    };


    api.get.unread_promotion_emails = function() {
        return api.helper.get.navigation_count("promotions");
    };


    api.get.unread_social_emails = function() {
        return api.helper.get.navigation_count("social_updates");
    };

    api.helper.get.navigation_count = function(i18nName) {
        const title = api.tools.i18n(i18nName);
        const dom = document.querySelectorAll("div[role=navigation] [title*='" + title + "']");

        if (dom.length > 0) {
            // this check should implicitly always be true, but better safe than sorry?
            if(dom[0].title.indexOf(title) !== -1) {
                const value = parseInt(dom[0].attributes['aria-label'].value.replace(/[^0-9]/g, ""));
                if (!isNaN(value)) {
                    return value;
                }
            }
        }

        return 0;
    };


    api.get.beta = function() {
        var features = {
            "new_nav_bar" : document.querySelector("#gbz") !== null
        };

        return features;
    };


    api.get.unread_emails = function() {
        return {
            inbox         : api.get.unread_inbox_emails(),
            drafts        : api.get.unread_draft_emails(),
            spam          : api.get.unread_spam_emails(),
            forum         : api.get.unread_forum_emails(),
            update        : api.get.unread_update_emails(),
            promotions    : api.get.unread_promotion_emails(),
            social        : api.get.unread_social_emails()
        };
    };


    api.tools.error = function(str, ...args) {
        console.error(str, ...args);
    };

    api.tools.parse_url = function(url) {
        var regex = /[?&]([^=#]+)=([^&#]*)/g;
        var params = {};
        var match = regex.exec(url);

        while (match) {
            params[match[1]] = match[2];
            match = regex.exec(url);
        }

        return params;
    };

    api.tools.sleep = function(milliseconds) {
        var start = new Date().getTime();
        while(true) {
            if ((new Date().getTime() - start) > milliseconds){
                break;
            }
        }
    };


    api.tools.multitry = function(delay, tries, func, check, counter, retval) {
        if(counter !== undefined && counter >= tries) {
            return retval;
        }

        counter = (counter === undefined) ? 0 : counter;

        var value = func();

        if(check(value)) {
            return value;
        } else {
            api.tools.sleep(delay);
            api.tools.multitry(delay, tries, func, check, counter+1, value);
        }
    };


    api.tools.deparam = function (params, coerce) {

        var each = function (arr, fnc) {
            var data = [];
            for (var i = 0; i < arr.length; i++) {
                data.push(fnc(arr[i]));
            }
            return data;
        };

        var isArray = Array.isArray || function(obj) {
            return Object.prototype.toString.call(obj) === "[object Array]";
        };

        var obj = {},
            coerce_types = {
                "true": !0,
                "false": !1,
                "null": null
            };
        each(params.replace(/\+/g, " ").split("&"), function (v, j) {
            var param = v.split("="),
                key = decodeURIComponent(param[0]),
                val,
                cur = obj,
                i = 0,
                keys = key.split("]["),
                keys_last = keys.length - 1;
            if (/\[/.test(keys[0]) && /\]$/.test(keys[keys_last])) {
                keys[keys_last] = keys[keys_last].replace(/\]$/, "");
                keys = keys.shift().split("[").concat(keys);
                keys_last = keys.length - 1;
            } else {
                keys_last = 0;
            }
            if (param.length === 2) {
                val = decodeURIComponent(param[1]);
                if (coerce) {
                    val = val && !isNaN(val) ? +val : val === "undefined" ? undefined : coerce_types[val] !== undefined ? coerce_types[val] : val;
                }
                if (keys_last) {
                    for (; i <= keys_last; i++) {
                        key = keys[i] === "" ? cur.length : keys[i];
                        cur = cur[key] = i < keys_last ? cur[key] || (keys[i + 1] && isNaN(keys[i + 1]) ? {} : []) : val;
                    }
                } else {
                    if (isArray(obj[key])) {
                        obj[key].push(val);
                    } else if (obj[key] !== undefined) {
                        obj[key] = [obj[key], val];
                    } else {
                        obj[key] = val;
                    }
                }
            } else if (key) {
                obj[key] = coerce ? undefined : "";
            }
        });
        return obj;
    };

    api.tools.get_pathname_from_url = function(url) {
        if (typeof(document) !== "undefined") {
            const a = document.createElement("a");
            a.href = url;
            return a.pathname;
        } else {
            return url;
        }
    };

    api.tools.parse_actions = function(params, xhr) {

        // upload_attachment event - if found, don"t check other observers. See issue #22
        if(params.url.act === "fup" || params.url.act === "fuv" || params.body_is_object) {
            return params.body_is_object && api.observe.bound("upload_attachment") ? { upload_attachment: [ params.body_params ] } : false; // trigger attachment event
        }

        if(params.url.search !== undefined) {
            // console.log(params.url, params.body, params.url_raw);
        }

        var triggered = {}; // store an object of event_name: [response_args] for events triggered by parsing the actions
        var action_map = {
            "tae"         : "add_to_tasks",
            "rc_^i"       : "archive",
            "tr"          : "delete",
            "dm"          : "delete_message_in_thread",
            "dl"          : "delete_forever",
            "dc_"         : "delete_label",
            "dr"          : "discard_draft",
            "el"          : "expand_categories",
            "cffm"        : "filter_messages_like_these",
            "arl"         : "label",
            "mai"         : "mark_as_important",
            "mani"        : "mark_as_not_important",
            "us"          : "mark_as_not_spam",
            "sp"          : "mark_as_spam",
            "mt"          : "move_label",
            "ib"          : "move_to_inbox",
            "ig"          : "mute",
            "rd"          : "read",
            "sd"          : "save_draft",
            "sm"          : "send_message",
            "mo"          : "show_newly_arrived_message",
            "st"          : "star",
            "cs"          : "undo_send",
            "ug"          : "unmute",
            "ur"          : "unread",
            "xst"         : "unstar",
            "new_mail"    : "new_email",
            "poll"        : "poll",
            "refresh"     : "refresh",
            "rtr"         : "restore_message_in_thread",
            "open_email"  : "open_email",
            "toggle_threads"  : "toggle_threads"
        };

        if(typeof params.url.ik === "string") {
            api.tracker.ik = params.url.ik;
        }

        if(typeof params.url.at === "string") {
            api.tracker.at = params.url.at;
        }

        if(typeof params.url.rid === "string") {
            if(params.url.rid.indexOf("mail") !== -1) {
                api.tracker.rid = params.url.rid;
            }
        }

        var action      = decodeURIComponent(params.url.act);
        var sent_params = params.body_params;
        var email_ids   = (typeof sent_params.t === "string") ? [sent_params.t] : sent_params.t;
        var response    = null;

        switch(action) {
        case "cs":
        case "ur":
        case "rd":
        case "tr":
        case "sp":
        case "us":
        case "ib":
        case "dl":
        case "st":
        case "xst":
        case "mai":
        case "mani":
        case "ig":
        case "ug":
        case "dr":
        case "mt":
        case "cffm":
        case "rc_^i":
            response = [email_ids, params.url, params.body];
            break;

        case "arl":
        case "dc_":
            response = [email_ids, params.url, params.body, params.url.acn];
            break;

        case "sd":
            response = [email_ids, params.url, sent_params];
            break;

        case "tae":
        case "sm":
            response = [params.url, params.body, sent_params];
            break;

        case "el":
            response = [params.url, params.body, sent_params.ex === "1"];
            break;

        case "dm":
        case "rtr":
        case "mo":
            response = [sent_params.m, params.url, params.body];
            break;

        }

        if(typeof params.url._reqid === "string" && params.url.view === "tl" && params.url.auto !== undefined) {
            response = [params.url.th, params.url, params.body];
            if(api.observe.bound("new_email")) {
                triggered.new_email = response;
            }
        }

        if((params.url.view === "cv" || params.url.view === "ad") && typeof params.url.th === "string" && typeof params.url.search === "string" && params.url.rid === undefined) {
            response = [params.url.th, params.url, params.body];
            if(api.observe.bound("open_email")) {
                triggered.open_email = response;
            }
        }

        if((params.url.view === "cv" || params.url.view === "ad") && typeof params.url.th === "object" && typeof params.url.search === "string" && params.url.rid !== undefined) {
            response = [params.url.th, params.url, params.body];
            if(api.observe.bound("toggle_threads")) {
                triggered.toggle_threads = response;
            }
        }

        if((params.url.view === "cv" || params.url.view === "ad") && typeof params.url.th === "string" && typeof params.url.search === "string" && params.url.rid !== undefined) {
            if(params.url.msgs !== undefined) {
                response = [params.url.th, params.url, params.body];
                if(api.observe.bound("toggle_threads")) {
                    triggered.toggle_threads = response;
                }
            }
        }

        if(typeof params.url.SID === "string" && typeof params.url.zx === "string" && params.body.indexOf("req0_") !== -1) {
            api.tracker.SID = params.url.SID;
            response = [params.url, params.body, sent_params];
            if(api.observe.bound("poll")) {
                triggered.poll = response;
            }
        }

        if(typeof params.url.ik === "string" && typeof params.url.search === "string" && params.body.length === 0 && typeof params.url._reqid === "string") {
            response = [params.url, params.body, sent_params];
            if(api.observe.bound("refresh")) {
                triggered.refresh = response;
            }
        }

        if(response && action_map[action] && api.observe.bound(action_map[action])) {
            triggered[action_map[action]] = response;
        }

        if(params.method === "POST") {
            triggered.http_event = [params]; // send every event and all data
        }

        // handle new data-format introduced with new gmail 2018.
        if (api.check.is_new_data_layer()) {
            api.tools.parse_request_payload(params, triggered);
        }

        return triggered;
    };

    api.check.data.is_thread_id = function(id) {
        return id
            && typeof id === "string"
            && /^thread-[a|f]:/.test(id);
    };

    api.check.data.is_thread = function(obj) {
        return obj
            && typeof obj === "object"
            && obj["0"]
            && api.check.data.is_thread_id(obj["0"]);
    };

    api.check.data.is_email_id = function(id) {
        return id
            && typeof id === "string"
            && id.indexOf('bump-') === -1
            && /^msg-[a|f]:/.test(id);
    };

    api.check.data.is_email = function(obj) {
        return obj
            && typeof obj === "object"
            && obj["0"]
            && api.check.data.is_email_id(obj["0"]);
    };

    /** New payload, see https://github.com/KartikTalwar/gmail.js/issues/722 */
    api.check.data.is_email_new = function(obj) {
        return obj
            && obj[0]
            && api.check.data.is_email_id(obj[0]);
    };

    api.check.data.is_legacy_email_id = function(id) {
        return id
            && typeof id === "string"
            && /^[0-9a-f]{16,}$/.test(id);
    };

    api.check.data.is_action = function(obj) {
        return api.check.data.is_first_type_action(obj)
            || api.check.data.is_second_type_action(obj);
    };

    api.check.data.is_first_type_action = function(obj) {
        return obj
            && obj["1"]
            && Array.isArray(obj["1"])
            && obj["1"].length === 1
            && typeof obj["1"]["0"] === 'string';
    };

    api.check.data.is_second_type_action = function(obj) {
        return obj
            && obj["2"]
            && Array.isArray(obj["2"])
            && obj["2"].length
            && typeof obj["2"]["0"] === 'string';
    };

    api.check.data.is_smartlabels_array = function(obj) {
        const isNotArray = !obj || !Array.isArray(obj) ||obj.length === 0;
        if (isNotArray) {
            return false;
        }

        for (let item of obj) {
            if (typeof item !== "string") {
                return false;
            }

            if (!/^\^[a-z]+/.test(item)) {
                return false;
            }
        }

        return true;
    };

    /**
       A lightweight check to see if a object (most likely) is a JSON-string.
    */
    api.check.data.is_json_string = function(obj) {
        if (!obj || typeof obj !== "string") {
            return false;
        }

        let str = obj.trim();
        return ((str.startsWith("{") && str.endsWith("}"))
            || (str.startsWith("[") && str.endsWith("]")));
    };

    api.tools.get_thread_id = function(obj) {
        return api.check.data.is_thread(obj)
            && obj["1"];
    };

    api.tools.get_thread_data = function(obj) {
        return obj
            && obj["2"]
            && typeof obj["2"] === "object"
            && obj["2"]["7"]
            && typeof obj["2"]["7"] === "object"
            && obj["2"]["7"];
    };

    api.tools.get_action = function(obj) {
        return api.tools.get_first_type_action(obj)
            || api.tools.get_second_type_action(obj);
    };

    api.tools.get_first_type_action = function(obj) {
        return obj
            && obj[1]
            && obj[1].join('');
    };

    api.tools.get_second_type_action = function(obj) {
        return obj
            && obj[2]
            && obj[2].join('');
    };

    api.tools.get_message_ids = function(obj) {
        return obj
            && obj["3"]
            && Array.isArray(obj["3"])
            && obj["3"];
    };

    api.tools.extract_from_graph = function(obj, predicate) {
        const result = [];

        const safePredicate = function(item) {
            try {
                return predicate(item);
            }
            catch (err) {
                return false;
            }
        };

        const forEachGraph = function(obj) {
            // check root-node too!
            if (safePredicate(obj)) {
                result.push(obj);
                return;
            }

            for (let key in obj) {
                let item = obj[key];

                if (safePredicate(item)) {
                    result.push(item);
                    continue;
                }

                // special-case digging for arrays!
                if (Array.isArray(item)) {
                    for (let listItem of item) {
                        forEachGraph(listItem, obj);
                    }
                } else if (typeof item === "object") {
                    // keep on digging.
                    forEachGraph(item);
                }
            }
        };

        forEachGraph(obj);
        return result;
    };

    api.tools.check_event_type = function(threadObj) {
        const apply_label = "^x_";
        const action_map = {
            // ""            : "add_to_tasks",
            "^a": "archive",
            "^k": "delete",
            // ""            : "delete_message_in_thread",
            // ""            : "delete_forever",
            // ""            : "delete_label",
            // ""            : "discard_draft",
            // ""            : "expand_categories",
            // ""            : "filter_messages_like_these",
            "^x_"            : "label",
            // "^io_im^imi": "mark_as_important",
            // "^imn": "mark_as_not_important",
            // ""            : "mark_as_not_spam",
            // ""            : "mark_as_spam",
            // ""            : "move_label",
            // ""            : "move_to_inbox",
            // ""            : "mute",
            "^u^us": "read",
            // ""            : "save_draft",
            // ""            : "send_message",
            // ""            : "show_newly_arrived_message",
            // "^t^ss_sy": "star",
            // ""            : "undo_send",
            // ""            : "unmute",
            "^u"            : "unread",
            // "^t^ss_sy^ss_so^ss_sr^ss_sp^ss_sb^ss_sg^ss_cr^ss_co^ss_cy^ss_cg^ss_cb^ss_cp": "unstar",
            "^us"            : "new_email",
            // ""            : "poll",
            // ""            : "refresh",
            // ""            : "restore_message_in_thread",
            "^o": "open_email",
            // ""            : "toggle_threads"
        };
        const threadData = api.tools.get_thread_data(threadObj);

        if (threadData && api.check.data.is_action(threadData)) {
            const action = api.tools.get_action(threadData);

            //Check if label is applied to email / existing email is moved to an label
            if(action.startsWith(apply_label) && api.check.data.is_first_type_action(threadData)) {
                return action_map[apply_label];
            } else {
                return action_map[action];
            }

        } else {
            return null;
        }
    };

    api.tools.parse_fd_bv_contacts = function(json) {
        if (!json || !Array.isArray(json)) {
            return [];
        }

        const res = [];

        for (let item of json) {
            res.push(api.tools.parse_fd_bv_contact(item));
        }

        return res;
    };

    api.tools.parse_fd_bv_is_draft = function(item) {
        try {
            if (!Array.isArray(item)) return false; // warning: case not seen during testing and value is untrustworthy
            return item.includes('^r') && item.includes('^r_bt');
        }
        catch (e) {
            return false;  // warning: case not seen during testing and value is untrustworthy
        }

    };

    api.tools.parse_fd_bv_contact = function(item) {
        try
        {
            return {
                name: item["2"],
                address: item["1"]
            };
        }
        catch (e) {
            return null;
        }
    };

    api.tools.parse_fd_attachments = function(json) {
        let res = [];

        if (Array.isArray(json)) {
            for (let item of json) {
                let data = item["0"]["3"] || "";

                res.push({
                    attachment_id: item["0"]["1"],
                    name: data["2"],
                    type: data["3"],
                    url: api.tools.check_fd_attachment_url(data["1"]),
                    size: Number.parseInt(data["4"])
                });
            }
        }

        return res;
    };

    api.tools.parse_fd_embedded_json_attachments = function(json) {
        let res = [];

        if (Array.isArray(json)) {
            for (let item of json) {
                res.push({
                    attachment_id: item[3],
                    name: item[1],
                    type: item[0],
                    url: api.tools.check_fd_attachment_url(item[5]),
                    size: item[2]
                });
            }
        }

        return res;
    };

    api.tools.check_fd_attachment_url = function(url) {
        var userAccountUrlPart = api.tracker.globals[7];
        if (url && userAccountUrlPart && url.indexOf(userAccountUrlPart) < 0) {
            url = url.replace('/mail/?', userAccountUrlPart + '?');
        }

        return url;
    };

    api.tools.parse_fd_request_html_payload = function(fd_email) {
        let fd_email_content_html = null;
        try {
            const fd_html_containers = fd_email["1"]["5"]["1"];

            for (let fd_html_container of fd_html_containers) {
                fd_email_content_html = (fd_email_content_html || "") + fd_html_container["2"]["1"];
            }
        }
        catch(e) {
            // don't crash gmail when we cant parse email-contents
        }

        return fd_email_content_html;
    };

    api.tools.parse_fd_embedded_json_content_html = function (fd_email) {
        let fd_email_content_html = null;
        try {
            const fd_html_containers = fd_email["8"]["1"];

            for (let fd_html_container of fd_html_containers) {
                fd_email_content_html = (fd_email_content_html || "") + fd_html_container["2"]["1"];
            }
        } catch (e) {
            // don't crash gmail when we cant parse email-contents
        }

        return fd_email_content_html;
    };

    api.tools.parse_fd_request_payload_get_email2 = function(fd_thread_container, fd_email_id) {
        try {
            const fd_emails2 = fd_thread_container["1"]["1"];
            const fd_email2 = fd_emails2.filter(i => i["0"] === fd_email_id);
            return fd_email2[0];
        }
        catch (e) {
            return {};
        }
    };

    api.tools.parse_fd_embedded_json_get_email = function (fd_thread_container, fd_email_id) {
        try {
            const fd_emails2 = fd_thread_container["1"]["4"];
            const fd_email2 = fd_emails2.filter(i => i["0"] === fd_email_id);
            return fd_email2[0];
        } catch (e) {
            return {};
        }
    };

    api.tools.parse_fd_request_payload = function(json) {
        // ensure JSON-format is known and understood?
        let thread_root = json["1"];
        if (!thread_root || !Array.isArray(thread_root)) {
            return null;
        }

        try
        {
            const res = [];

            const fd_threads = thread_root; // array
            for (let fd_thread_container of fd_threads) {
                const fd_thread_id = fd_thread_container["0"];

                let fd_emails = fd_thread_container["2"]; // array
                for (let fd_email of fd_emails) {
                    //console.log(fd_email)
                    const fd_email_id = fd_email["0"];

                    // detailed to/from-fields must be obtained through the -other- email message node.
                    const fd_email2 = api.tools.parse_fd_request_payload_get_email2(fd_thread_container, fd_email_id);

                    const fd_legacy_email_id = fd_email["1"]["34"];
                    const fd_email_smtp_id = fd_email["1"]["7"];

                    const fd_email_subject = fd_email["1"]["4"];
                    const fd_email_timestamp = Number.parseInt(fd_email["1"]["16"]);
                    const fd_email_date = new Date(fd_email_timestamp);

                    const fd_email_is_draft = api.tools.parse_fd_bv_is_draft(fd_email2["3"]);

                    const fd_email_content_html = api.tools.parse_fd_request_html_payload(fd_email);

                    const fd_attachments = api.tools.parse_fd_attachments(fd_email["1"]["13"]);

                    const fd_email_sender_address = fd_email["1"]["10"]["16"];

                    let fd_from = api.tools.parse_fd_bv_contact(fd_email2["1"]);
                    if (!fd_from) {
                        fd_from = { address: fd_email_sender_address, name: "" };
                    }

                    const fd_to = api.tools.parse_fd_bv_contacts(fd_email["1"]["0"]);
                    const fd_cc = api.tools.parse_fd_bv_contacts(fd_email["1"]["1"]);
                    const fd_bcc = api.tools.parse_fd_bv_contacts(fd_email["1"]["2"]);

                    const email = {
                        id: fd_email_id,
                        is_draft: fd_email_is_draft,
                        legacy_email_id: fd_legacy_email_id,
                        thread_id: fd_thread_id,
                        smtp_id: fd_email_smtp_id,
                        subject: fd_email_subject,
                        timestamp: fd_email_timestamp,
                        content_html: fd_email_content_html,
                        date: fd_email_date,
                        from: fd_from,
                        to: fd_to,
                        cc: fd_cc,
                        bcc: fd_bcc,
                        attachments: fd_attachments
                    };
                    if (api.cache.debug_xhr_fetch) {
                        email["$email_node"] = fd_email;
                        email["$thread_node"] = fd_thread_container;
                    }
                    //console.log(email);
                    res.push(email);
                }
            }

            return res;
        }
        catch (error) {
            console.warn("Gmail.js encountered an error trying to parse email-data on fd request!", error);
            return null;
        }
    };

    api.tools.parse_fd_embedded_json = function (json) {
        // ensure JSON-format is known and understood?
        let thread_root = json["1"];

        if (!thread_root || !Array.isArray(thread_root)) {
            return null;
        }

        try {
            const res = [];

            const fd_threads = thread_root; // array
            for (let fd_thread_container of fd_threads) {
                const fd_thread_id = fd_thread_container["1"]["3"];

                let fd_emails = fd_thread_container["1"]["4"]; // array
                for (let fd_email of fd_emails) {
                    //console.log(fd_email)
                    const fd_email_id = fd_email["0"];



                    // detailed to/from-fields must be obtained through the -other- email message node.
                    //TODO : need a refactoring
                    const fd_email2 = api.tools.parse_fd_embedded_json_get_email(fd_thread_container, fd_email_id);


                    //TODO : to check...
                    const fd_legacy_email_id = fd_email["55"];
                    const fd_email_smtp_id = fd_email["13"];
                    const fd_email_subject = fd_email["7"];

                    const fd_email_is_draft = api.tools.parse_fd_bv_is_draft(fd_email["10"]);

                    //TODO : to check...
                    const fd_email_timestamp = Number.parseInt(fd_email["17"]);
                    const fd_email_date = new Date(fd_email_timestamp);

                    //TODO : need a refactoring
                    const fd_email_content_html = api.tools.parse_fd_embedded_json_content_html(fd_email);

                    const fd_attachments = api.tools.parse_fd_embedded_json_attachments(fd_email["11"]);
                    const fd_email_sender_address = fd_email["18"]["16"];

                    //TODO
                    let fd_from = api.tools.parse_fd_bv_contact(fd_email2["1"]);
                    if (!fd_from) {
                        fd_from = {
                            address: fd_email_sender_address,
                            name: ""
                        };
                    }

                    const fd_to = api.tools.parse_fd_bv_contacts(fd_email["2"]);
                    const fd_cc = api.tools.parse_fd_bv_contacts(fd_email["3"]);
                    const fd_bcc = api.tools.parse_fd_bv_contacts(fd_email["4"]);

                    const email = {
                        id: fd_email_id,
                        is_draft: fd_email_is_draft,
                        legacy_email_id: fd_legacy_email_id,
                        thread_id: fd_thread_id,
                        smtp_id: fd_email_smtp_id,
                        subject: fd_email_subject,
                        timestamp: fd_email_timestamp,
                        content_html: fd_email_content_html,
                        date: fd_email_date,
                        from: fd_from,
                        to: fd_to,
                        cc: fd_cc,
                        bcc: fd_bcc,
                        attachments: fd_attachments
                    };
                    if (api.cache.debug_xhr_fetch) {
                        email["$email_node"] = fd_email;
                        email["$thread_node"] = fd_thread_container;
                    }
                    //console.log(email);
                    res.push(email);
                }
            }

            return res;
        } catch (error) {
            console.warn("Gmail.js encountered an error trying to parse email-data on embedded json!", error);
            return null;
        }
    };

    /**
     * Parse xhr response fom bv request like https://mail.google.com/sync/u/0/i/bv?hl=fr&c=0
     */
    api.tools.parse_bv_request_payload = function (json) {
        // ensure JSON-format is known and understood?
        // JSON-format is not simple to understand, code here is bases on hypothesis
        //let label_root = json["2"];
        let thread_root = json["2"];
        if (!thread_root || !Array.isArray(thread_root)) {
            return null;
        }

        try {
            const res = [];

            const bv_threads = thread_root; // array
            for (let bv_thread_container of bv_threads) {
                const bv_thread_subject = bv_thread_container["0"]["0"];
                const bv_thread_id = bv_thread_container["0"]["3"];

                let bv_emails = bv_thread_container["0"]["4"]; // array
                for (let bv_email of bv_emails) {
                    //console.log(bv_email)
                    const bv_email_id = bv_email["0"];
                    const bv_legacy_email_id = bv_email["55"];
                    const bv_email_smtp_id = ""; //bv_email["16"] is smtp_id of previous email in the conversation
                    //const bv_email["16"] !==undefined ? bv_email["16"] : ""; //present only if user is the sender ?
                    const bv_email_subject = bv_thread_subject; //value present on thread but not on email
                    const bv_email_timestamp = Number.parseInt(bv_email["17"]); //another timestamp with same value present on bv_email["31"]
                    const bv_email_date = new Date(bv_email_timestamp);
                    const bv_email_content_html = ""; //Not present in bv request

                    const bv_email_is_draft = api.tools.parse_fd_bv_is_draft(bv_email["10"]);

                    //TODO
                    const bv_attachments = []; //Present but need a new parser (not urgent, present in fd email)

                    //TODO : check if it's OK
                    const bv_from = {
                        address: bv_email["1"]["1"] !== undefined ? bv_email["1"]["1"] : "",
                        name: bv_email["1"]["2"] !== undefined ? bv_email["1"]["2"] : ""
                    };

                    const bv_to = []; //Not present in bv request
                    const bv_cc = []; //Not present in bv request
                    const bv_bcc = []; //Not present in bv request

                    const email = {
                        id: bv_email_id,
                        is_draft: bv_email_is_draft,
                        legacy_email_id: bv_legacy_email_id,
                        thread_id: bv_thread_id,
                        smtp_id: bv_email_smtp_id,
                        subject: bv_email_subject,
                        timestamp: bv_email_timestamp,
                        content_html: bv_email_content_html,
                        date: bv_email_date,
                        from: bv_from,
                        to: bv_to,
                        cc: bv_cc,
                        bcc: bv_bcc,
                        attachments: bv_attachments
                    };
                    if (api.cache.debug_xhr_fetch) {
                        email["$email_node"] = bv_email;
                        email["$thread_node"] = bv_thread_container;
                    }
                    //console.log(email);
                    res.push(email);
                }
            }

            return res;
        } catch (error) {
            console.warn("Gmail.js encountered an error trying to parse email-data on bv request!", error);
            return null;
        }
    };

    api.tools.parse_bv_embedded_json = function (json) {
        // ensure JSON-format is known and understood?
        // JSON-format is not simple to understand, code here is bases on hypothesis
        let thread_root = json["0"]["0"];
        if (!thread_root || !Array.isArray(thread_root)) {
            return null;
        }

        try {
            const res = [];

            const bv_threads = thread_root; // array
            for (let bv_thread_container of bv_threads) {
                const bv_thread_subject = bv_thread_container["4"]["0"];
                const bv_thread_id = bv_thread_container["4"]["3"];

                let bv_emails = bv_thread_container["4"]["4"]; // array
                for (let bv_email of bv_emails) {
                    //console.log(bv_email)
                    const bv_email_id = bv_email["0"];
                    const bv_legacy_email_id = bv_email["55"];
                    const bv_email_smtp_id = ""; //bv_email["16"] is smtp_id of previous email in the conversation
                    //const bv_email["16"] !==undefined ? bv_email["16"] : ""; //present only if user is the sender ?
                    const bv_email_subject = bv_thread_subject; //value present on thread but not on email
                    const bv_email_timestamp = Number.parseInt(bv_email["17"]); //another timestamp with same value present on bv_email["31"]
                    const bv_email_date = new Date(bv_email_timestamp);
                    const bv_email_content_html = ""; //Not present in bv request

                    const bv_email_is_draft = api.tools.parse_fd_bv_is_draft(bv_email["10"]);

                    //TODO
                    const bv_attachments = []; //Present but need a new parser (not urgent, present in fd email)

                    //TODO : check if it's OK
                    const bv_from = {
                        address: bv_email["1"]["1"] !== undefined ? bv_email["1"]["1"] : "",
                        name: bv_email["1"]["2"] !== undefined ? bv_email["1"]["2"] : ""
                    };

                    const bv_to = []; //Not present in bv request
                    const bv_cc = []; //Not present in bv request
                    const bv_bcc = []; //Not present in bv request

                    const email = {
                        id: bv_email_id,
                        is_draft: bv_email_is_draft,
                        legacy_email_id: bv_legacy_email_id,
                        thread_id: bv_thread_id,
                        smtp_id: bv_email_smtp_id,
                        subject: bv_email_subject,
                        timestamp: bv_email_timestamp,
                        content_html: bv_email_content_html,
                        date: bv_email_date,
                        from: bv_from,
                        to: bv_to,
                        cc: bv_cc,
                        bcc: bv_bcc,
                        attachments: bv_attachments
                    };
                    if (api.cache.debug_xhr_fetch) {
                        email["$email_node"] = bv_email;
                        email["$thread_node"] = bv_thread_container;
                    }
                    //console.log(email);
                    res.push(email);
                }
            }

            return res;
        } catch (error) {
            console.warn("Gmail.js encountered an error trying to parse email-data on bv request!", error);
            return null;
        }


    };


    api.tools.parse_sent_message_html_payload = function(sent_email) {
        let sent_email_content_html = null;
        try {
            const sent_html_containers = sent_email["9"]["2"];

            for (let sent_html_container of sent_html_containers) {
                sent_email_content_html = (sent_email_content_html || "") + sent_html_container["2"];
            }
        }
        catch(e) {
            // don't crash gmail when we cant parse email-contents
        }

        return sent_email_content_html;
    };

    api.tools.parse_sent_message_attachments = function(json) {
        let res = [];

        if (Array.isArray(json)) {
            for (let item of json) {

                res.push({
                    id: item["5"],
                    name: item["2"],
                    type: item["1"],
                    url: item["6"],
                    size: Number.parseInt(item["3"])
                });
            }
        }

        return res;
    };

    api.tools.parse_sent_message_payload = function(json) {
        try
        {
            let sent_email = json;
            //console.log(sent_email);

            const sent_email_id = sent_email["0"];

            const sent_email_subject = sent_email["7"];
            const sent_email_timestamp = Number.parseInt(sent_email["6"]);
            const sent_email_date = new Date(sent_email_timestamp);

            const sent_email_content_html = api.tools.parse_sent_message_html_payload(sent_email);
            const sent_email_ishtml = sent_email["8"]["6"];

            const sent_attachments = api.tools.parse_sent_message_attachments(sent_email["11"]);

            const sent_from = api.tools.parse_fd_bv_contact(sent_email["1"]);
            const sent_to = api.tools.parse_fd_bv_contacts(sent_email["2"]);
            const sent_cc = api.tools.parse_fd_bv_contacts(sent_email["3"]);
            const sent_bcc = api.tools.parse_fd_bv_contacts(sent_email["4"]);

            const email = {
                1: sent_email_id,
                id: sent_email_id,
                subject: sent_email_subject,
                timestamp: sent_email_timestamp,
                content_html: sent_email_content_html,
                ishtml: sent_email_ishtml,
                date: sent_email_date,
                from: sent_from,
                to: sent_to,
                cc: sent_cc,
                bcc: sent_bcc,
                attachments: sent_attachments,
                email_node: json
            };

            return email;
        }
        catch (error) {
            console.warn("Gmail.js encountered an error trying to parse sent message!", error);
            return null;
        }
    };

    api.tools.parse_sent_message_payload_new = function(json) {
        try
        {
            const parse_fd_bv_contact_new = (a) => {
                if (a && a[1]) {
                    return { name: a[2] || "", address: a[1] };
                } else {
                    return undefined;
                }
            };

            const parse_fd_bv_contacts_new = (a) => {
                if (Array.isArray(a)) {
                    return a.map(parse_fd_bv_contact_new).filter(a => a);
                } else {
                    return [];
                }
            };

            const parse_sent_message_attachments_new = (json) => {
                if (Array.isArray(json)) {
                    return json.map(item => ({
                        id: item[4],
                        name: item[1],
                        type: item[0],
                        url: item[5],
                        size: Number.parseInt(item[2])
                    }));
                } else {
                    return [];
                }
            };

            const parse_sent_message_html_payload_new = (sent_email) => {
                let sent_email_content_html = null;
                try {
                    const sent_html_containers = sent_email[8][1];
                    for (let sent_html_container of sent_html_containers) {
                        sent_email_content_html = (sent_email_content_html || "") + sent_html_container[1];
                    }
                } catch(err) {
                    // don't crash gmail when we cant parse email-contents
                    api.tools.error("Failed to parse html", err);
                }

                return sent_email_content_html;
            };

            let sent_email = json;
            //console.log(sent_email);

            const sent_email_id = sent_email[0];

            const sent_email_subject = sent_email[7];
            const sent_email_timestamp = sent_email[6];
            const sent_email_date = new Date(sent_email_timestamp);

            const sent_email_content_html = parse_sent_message_html_payload_new(sent_email);
            const sent_email_ishtml = sent_email[8][6];
            const sent_attachments = parse_sent_message_attachments_new(sent_email[11]);

            const sent_from = parse_fd_bv_contact_new(sent_email[1]);
            const sent_to = parse_fd_bv_contacts_new(sent_email[2]);
            const sent_cc = parse_fd_bv_contacts_new(sent_email[3]);
            const sent_bcc = parse_fd_bv_contacts_new(sent_email[4]);

            const email = {
                1: sent_email_id,
                id: sent_email_id,
                subject: sent_email_subject,
                timestamp: sent_email_timestamp,
                content_html: sent_email_content_html,
                ishtml: sent_email_ishtml,
                date: sent_email_date,
                from: sent_from,
                to: sent_to,
                cc: sent_cc,
                bcc: sent_bcc,
                attachments: sent_attachments,
                email_node: json
            };

            return email;
        }
        catch (error) {
            console.warn("Gmail.js encountered an error trying to parse sent message!", error);
            return null;
        }
    };

    api.tools.parse_request_payload = function(params, events, force) {
        const pathname = api.tools.get_pathname_from_url(params.url_raw);
        if (!force && !pathname) {
            return;
        }

        const isSynch = (pathname || "").endsWith("/i/s");
        const isFetch = (pathname || "").endsWith("/i/fd");
        if (!force && !isFetch && !isSynch) {
            return;
        }

        if (isFetch) {
            // register event, so that after triggers (where we parse response-data) gets triggered.
            events.load_email_data = [null];
        }

        const threads = api.tools.extract_from_graph(params, api.check.data.is_thread);
        // console.log("Threads:");
        // console.log(threads);
        const emails = [
            ...api.tools.extract_from_graph(params.body_params, api.check.data.is_email),
            ...api.tools.extract_from_graph(params.body_params, api.check.data.is_email_new),
        ];
        // console.log("Emails:", emails, "url", params.url_raw, "body", params.body_params);

        for (let email of emails) {
            // console.log("Email:");
            // console.log(email);
            for (let key in email) {
                let prop = email[key];
                if (api.check.data.is_smartlabels_array(prop)) {
                    let sent_email = api.check.data.is_email_new(email) ?
                        api.tools.parse_sent_message_payload_new(email) :
                        api.tools.parse_sent_message_payload(email);
                    if (prop.indexOf("^pfg") !== -1) {
                        events.send_message = [params.url, params.body, sent_email];
                    } else if (prop.indexOf("^scheduled") > -1) {
                        events.send_scheduled_message = [params.url, params.body, sent_email];
                    }
                }
            }
        }

        try {
            if (Array.isArray(threads) && api.check.data.is_thread(threads[0])) {
                const actionType = api.tools.check_event_type(threads[0]);

                if (actionType) {
                    // console.log(threads[0]);
                    const threadsData = threads.map(thread => api.tools.get_thread_data(thread));

                    const new_thread_ids = threads.map(thread => api.tools.get_thread_id(thread));
                    const new_email_ids = threadsData.map(threadData => api.tools.get_message_ids(threadData)).reduce((a, b) => a.concat(b), []);
                    events[actionType] = [null, params.url, params.body, new_email_ids, new_thread_ids];
                }
            }
        } catch (e) {
            console.error('Error: ', e);
        }
    };

    api.tools.parse_response = function(response) {
        // first try parse as pure json!
        if (api.check.data.is_json_string(response)) {
            try {
                let json = JSON.parse(response);
                return json;
            } catch(err) {
                // ignore, and fallback to old implementation!
            }
        }

        // early XHR interception also means we intercept HTML, CSS, JS payloads. etc
        // dont crash on those.
        if (response.startsWith("<!DOCTYPE html")
            || response.indexOf("display:inline-block") !== -1
        ) {
            return [];
        }

        let parsedResponse = [];
        let originalResponse = response;
        try {
            // gmail post response structure
            // )}]"\n<datalength><rawData>\n<dataLength><rawData>...

            // prepare response, remove eval protectors
            response = response.replace(/\n/g, " ");
            response = response.substring(response.indexOf("'") + 1, response.length);

            while(response.replace(/\s/g, "").length > 1) {

                // how long is the data to get
                let dataLength = response.substring(0, response.indexOf("[")).replace(/\s/g, "");
                if (!dataLength) {dataLength = response.length;}

                let endIndex = (parseInt(dataLength, 10) - 2) + response.indexOf("[");
                let data = response.substring(response.indexOf("["), endIndex);

                let json = JSON.parse(data);
                parsedResponse.push(json);

                // prepare response for next loop
                response = response.substring(response.indexOf("["), response.length);
                response = response.substring(data.length, response.length);
            }
        } catch (e) {
            // console.log("GmailJS post response-parsing failed.", e, originalResponse);
        }

        return parsedResponse;
    };

    /**
       parses a download_url attribute from the attachments main span-element.
     */
    api.tools.parse_attachment_url = function(url) {
        var parts = url.split(":");
        return {
            type: parts[0],
            url: parts[2] + ":" + parts[4] + ":" + parts[5]
        };
    };

    /**
       Node-friendly function to extend objects without depending on jQuery
       (which requires a browser-context)
       */
    var extend = function(target, extension) {
        for (var key in extension) {
            target[key] = extension[key];
        }
    };

    /**
       Node-friendly function to merge arrays without depending on jQuery
       (which requires a browser-context).

       All subsequent arrays are merged into the first one, to match
       $.merge's behaviour.
    */
    var merge = function(target, mergee) {

        for (var i=0; i < mergee.length; i++) {
            var value = mergee[i];
            target.push(value);
        }

        return target;
    };

    api.tools.parse_requests = function(params, xhr) {
        params.url_raw = params.url;
        params.url = api.tools.parse_url(params.url);
        if(typeof params.body === "object") {
            params.body_params = params.body;
            params.body_is_object = true;
        } else if (api.check.data.is_json_string(params.body)) {
            params.body_params = JSON.parse(params.body);
        } else if (params.body !== undefined) {
            params.body_params = api.tools.deparam(params.body);
        } else {
            params.body_params = {};
        }

        if(typeof api.tracker.events !== "object" && typeof api.tracker.actions !== "object") {
            api.tracker.events  = [];
            api.tracker.actions = [];
        }

        api.tracker.events.unshift(params);
        var events = api.tools.parse_actions(params, xhr);

        if(params.method === "POST" && typeof params.url.act === "string") {
            api.tracker.actions.unshift(params);
        }

        if(api.tracker.events.length > 50) {
            api.tracker.events.pop();
        }

        if(api.tracker.actions.length > 10) {
            api.tracker.actions.pop();
        }
        return events;
    };

    api.tools.patch = function(patchee, patch) {
        patch(patchee);
    };


    api.tools.cache_email_data = function(email_data, data_source) {
        /**
		 * Data source could be
		 * 	- fd_request_payload
		 * 	- bv_request_payload
		 * 	- fd_embedded_json
		 * 	- bv_embedded_json
		 */
        if (email_data === null) {
            return;
        }

        const c = api.cache;

        let isUpdateAuthorized = false;
        if (data_source === "fd_request_payload" || data_source === "fd_embedded_json") {
            isUpdateAuthorized = true;
        }


        for (let email of email_data) {
            // cache email directly on IDs
            if (c.emailIdCache[email.id] === undefined) {
                //console.log("ADD email cache",data_source,email);
                c.emailIdCache[email.id] = email;
                c.emailLegacyIdCache[email.legacy_email_id] = email;
            }
            else if (isUpdateAuthorized) {
                //console.log("UPDATE email cache",data_source,email);
                c.emailIdCache[email.id] = email;
                c.emailLegacyIdCache[email.legacy_email_id] = email;
            }

            // ensure we have a thread-object before appending emails to it!
            let thread = c.threadCache[email.thread_id];
            if (!thread) {
                thread = {
                    thread_id: email.thread_id,
                    emails: []
                };
                c.threadCache[email.thread_id] = thread;
            }

            // only append email to cache if not already there.
            if (thread.emails.filter(i => i.id === email.id).length === 0) {
                //console.log("append email to thread cache",data_source, email) ;
                thread.emails.push(email);
            }
            // Only update cache with data source fd_request_payload and fd_embedded_json
            else if (isUpdateAuthorized) {
                let index = thread.emails.findIndex(i => i.id === email.id);
                //console.log("update email in thread cache",data_source,email);
                thread.emails[index] = email;
            }
        }
    };

    api.tools.xhr_watcher = function () {
        if (api.tracker.xhr_init) {
            return;
        }

        api.instanceId = Symbol('gmail-js-' + (performance ? performance.now() : Date.now()));
        api.tracker.xhr_init = true;

        const win = api.helper.get_xhr_window();

        api.tools.patch(win.XMLHttpRequest.prototype.open, (orig) => {
            win.XMLHttpRequest.prototype.open = function (method, url, async, user, password) {
                var out = orig.apply(this, arguments);
                this.xhrParams = {
                    method: method.toString(),
                    url: url.toString()
                };
                Object.defineProperty(this, api.instanceId, {
                    value: Object.freeze({
                        method: method.toString(),
                        url: url.toString()
                    })
                });
                return out;
            };
        });

        api.tools.patch(win.XMLHttpRequest.prototype.send, (orig) => {
            win.XMLHttpRequest.prototype.send = function (body) {
                // parse the xhr request to determine if any events should be triggered
                var events = false;
                if (this.xhrParams) {
                    this.xhrParams.body = body;

                    // restore original values of xhrParams, if they were altered by upstream instances of gmail.js
                    if (typeof this.xhrParams.url !== 'string') {
                        if (
                            this[api.instanceId]
                            && this[api.instanceId].url
                        ) {
                            this.xhrParams.url = this[api.instanceId].url;
                            delete this.xhrParams.url_raw;
                            delete this.xhrParams.body_params;
                        }
                    }

                    events = api.tools.parse_requests(this.xhrParams, this);
                }

                // fire before events
                if (api.observe.trigger("before", events, this)) {
                    // if before events were fired, rebuild arguments[0]/body strings
                    // TODO: recreate the url if we want to support manipulating url args (is there a use case where this would be needed?)
                    if (api.check.is_new_data_layer()) {
                        body = arguments[0] = this.xhrParams.body_is_object
                            ? this.xhrParams.body_params
                            : JSON.stringify(this.xhrParams.body_params);
                    } else {
                        body = arguments[0] = this.xhrParams.body_is_object
                            ? this.xhrParams.body_params
                            : $.param(this.xhrParams.body_params,true).replace(/\+/g, "%20");
                    }
                }

                // if any matching after events, bind onreadystatechange callback
                // also: on new gmail we want to intercept email-data from /i/fd or /i/bv request responses.
                if (api.observe.bound(events, "after") || api.check.is_new_data_layer()) {
                    var curr_onreadystatechange = this.onreadystatechange;
                    var xhr = this;
                    this.onreadystatechange = function(progress) {
                        if (this.readyState === this.DONE) {
                            if (progress.target.responseType === "" || progress.target.responseType === "text") {
                                xhr.xhrResponse = api.tools.parse_response(progress.target.responseText);
                            } else {
                                xhr.xhrResponse = progress.target.response;
                            }

                            // intercept email-data passively, instead of actively trying to fetch it later!
                            // (which we won't be able to do once 2019 hits anyway...)
                            if (api.check.is_new_data_layer()) {
                                const pathName = api.tools.get_pathname_from_url(xhr.xhrParams.url_raw);
                                if (pathName.endsWith("/i/fd")) {
                                    let parsed_emails = api.tools.parse_fd_request_payload(xhr.xhrResponse);
                                    if (parsed_emails !== undefined && parsed_emails !== null) {
                                        api.tools.cache_email_data(parsed_emails,"fd_request_payload");
                                        events.load_email_data = [parsed_emails];
                                    }
                                }
                                if (pathName.endsWith("/i/bv")) {
                                    let parsed_emails = api.tools.parse_bv_request_payload(xhr.xhrResponse);
                                    if (parsed_emails !== undefined && parsed_emails !== null) {
                                        api.tools.cache_email_data(parsed_emails,"bv_request_payload");
                                        events.load_email_data = [parsed_emails];
                                    }
                                }
                            }
                            api.observe.trigger("after", events, xhr);
                        }
                        if (curr_onreadystatechange) {
                            curr_onreadystatechange.apply(this, arguments);
                        }
                    };
                }

                // send the original request
                var out = orig.apply(this, arguments);

                // fire on events
                api.observe.trigger("on", events, this);
                return out;
            };
        });
    };

    api.tools.embedded_data_watcher = function() {

        if (api.tracker.embedded_data_init) {
            return;
        }

        api.tracker.embedded_data_init = true;

        var original_GM_setData = window._GM_setData;
        window._GM_setData = function(data) {

            if (data !== undefined && data.Cl6csf !== undefined && data.Cl6csf[0] !== undefined && data.Cl6csf[0][2] !== undefined) {
                //console.log('Cl6csf',JSON.parse(data.Cl6csf[0][2]));
                let parsed_emails = api.tools.parse_fd_embedded_json(JSON.parse(data.Cl6csf[0][2]));
                api.tools.cache_email_data(parsed_emails,"fd_embedded_json");
                //TODO : event is not load yet at this time of workflow, addon is necessary to observe load email event for this case
                //events.load_email_data = [parsed_emails];

            }
            if (data !== undefined && data.a6jdv !== undefined && data.a6jdv[0] !== undefined && data.a6jdv[0][2] !== undefined) {
                //console.log('a6jdv',JSON.parse(data.a6jdv[0][2]));
                let parsed_emails = api.tools.parse_bv_embedded_json(JSON.parse(data.a6jdv[0][2]));
                api.tools.cache_email_data(parsed_emails,"bv_embedded_json");
                //TODO : event is not load yet at this time of workflow, addon is necessary to observe load email event for this case
                //events.load_email_data = [parsed_emails];

            }
            if (data !== undefined && data.sBEv4c !== undefined) {
                for (let item of data.sBEv4c) {
                    // the index of the mla is not confirmed to be stable
                    // it was observed to be at position 3, but we should not depend on it
                    if (item[0] === "mla") {
                        api.tracker.mla = item;
                    }
                }
            }

            original_GM_setData(data);
        };
    };

    api.helper.get_xhr_window = function() {
        // in the new gmail UI, in the case of window_opener as xhr window,
        // some events do not work, for example before_send event
        if (api.check.is_new_gui()) {
            return top;
        }

        var js_frame = null;
        if (top.document.getElementById("js_frame")){
            js_frame = top.document.getElementById("js_frame");
        } else if (window_opener) {
            js_frame = window_opener.top.document.getElementById("js_frame");
        }

        if (!js_frame){
            if (window_opener) {
                js_frame = window_opener.top;
            } else {
                js_frame = top;
            }
        }

        var win;
        if (js_frame.contentDocument) {
            win = js_frame.contentDocument.defaultView;
        } else {
            win = js_frame;
        }

        return win;
    };


    api.observe.http_requests = function() {
        return api.tracker.events;
    };


    api.observe.actions = function() {
        return api.tracker.actions;
    };

    /**
       Bind a specified callback to an array of callbacks against a specified type & action
    */
    api.observe.bind = function(type, action, callback) {

        // set up watchdog data structure
        if(typeof api.tracker.watchdog !== "object") {
            api.tracker.watchdog = {
                before: {},
                on: {},
                after: {},
                dom: {}
            };
            api.tracker.bound = {};
        }
        if(typeof api.tracker.watchdog[type] !== "object") {
            api.tools.error("api.observe.bind called with invalid type: " + type);
        }

        // ensure we are watching xhr requests
        if(type !== "dom") {
            api.tools.xhr_watcher();
        }

        // add callback to an array in the watchdog
        if(typeof api.tracker.watchdog[type][action] !== "object") {
            api.tracker.watchdog[type][action] = [];
        }
        api.tracker.watchdog[type][action].push(callback);

        // allow checking for bound events to specific action/type as efficiently as possible (without in looping) - bit dirtier code,
        // but lookups (api.observer.bound) are executed by the hundreds & I think the extra efficiency is worth the tradeoff
        api.tracker.bound[action] = typeof api.tracker.bound[action] === "undefined" ? 1 : api.tracker.bound[action]+1;
        api.tracker.bound[type] = typeof api.tracker.bound[type] === "undefined" ? 1 : api.tracker.bound[type]+1;
        //api.tracker.watchdog[action] = callback;
    };

    /**
       an on event is observed just after gmail sends an xhr request
    */
    api.observe.on = function(action, callback, response_callback) {

        // check for DOM observer actions, and if none found, the assume an XHR observer
        if(api.observe.on_dom(action, callback)) return true;

        // bind xhr observers
        api.observe.bind("on", action, callback);
        if (response_callback) {
            api.observe.after(action, callback);
        }
    };

    /**
       an before event is observed just prior to the gmail xhr request being sent
       before events have the ability to modify the xhr request before it is sent
    */
    api.observe.before = function(action, callback) {
        api.observe.bind("before", action, callback);
    };

    /**
       an after event is observed when the gmail xhr request returns from the server
       with the server response
    */
    api.observe.after = function(action, callback) {
        api.observe.bind("after", action, callback);
    };

    /**
       Checks if a specified action & type has anything bound to it
       If type is null, will check for this action bound on any type
       If action is null, will check for any actions bound to a type
    */
    api.observe.bound = function(action, type) {
        if (typeof api.tracker.watchdog !== "object") return false;
        if (action) {

            // if an object of actions (triggered events of format { event: [response] }) is passed, check if any of these are bound
            if(typeof action === "object") {
                var match = false;
                for (let key of Object.keys(action)) {
                    if(typeof api.tracker.watchdog[type][key] === "object") match = true;
                }
                return match;
            }
            if(type) return typeof api.tracker.watchdog[type][action] === "object";
            return api.tracker.bound[action] > 0;
        } else {
            if(type) return api.tracker.bound[type] > 0;
            api.tools.error("api.observe.bound called with invalid args");
        }
    };

    /**
       Clear all callbacks for a specific type (before, on, after, dom) and action
       If action is null, all actions will be cleared
       If type is null, all types will be cleared
    */
    api.observe.off = function(action, type) {

        // if watchdog is not set, bind has not yet been called so nothing to turn off
        if(typeof api.tracker.watchdog !== "object") return true;

        // loop through applicable types
        var types = type ? [ type ] : [ "before", "on", "after", "dom" ];
        for (let type of types) {
            if(typeof api.tracker.watchdog[type] !== "object") continue; // no callbacks for this type

            // if action specified, remove any callbacks for this action, otherwise remove all callbacks for all actions
            if(action) {
                if(typeof api.tracker.watchdog[type][action] === "object") {
                    api.tracker.bound[action] -= api.tracker.watchdog[type][action].length;
                    api.tracker.bound[type] -= api.tracker.watchdog[type][action].length;
                    delete api.tracker.watchdog[type][action];
                }
            } else {
                for (let act of Object.keys(api.tracker.watchdog[type])) {
                    if(typeof api.tracker.watchdog[type][act] === "object") {
                        api.tracker.bound[act] -= api.tracker.watchdog[type][act].length;
                        api.tracker.bound[type] -= api.tracker.watchdog[type][act].length;
                        delete api.tracker.watchdog[type][act];
                    }
                }
            }
        }
    };

    /**
       Trigger any specified events bound to the passed type
       Returns true or false depending if any events were fired
    */
    api.observe.trigger = function(type, events, xhr) {
        if(!events) return false;
        var fired = false;
        for (let [action, response] of Object.entries(events)) {

            // we have to do this here each time to keep backwards compatibility with old response_callback implementation
            response = [...response]; // break the reference so it doesn"t keep growing each trigger
            if(type === "after") response.push(xhr.xhrResponse); // backwards compat for after events requires we push onreadystatechange parsed response first
            response.push(xhr);
            if(api.observe.bound(action, type)) {
                fired = true;
                for (let callback of api.tracker.watchdog[type][action]) {
                    callback.apply(undefined, response);
                }
            }
        }
        return fired;
    };

    /**
       Trigger any specified DOM events passing a specified element & optional handler
    */
    api.observe.trigger_dom = function(observer, element, handler) {

        // if no defined handler, just call the callback
        if (!handler) {
            handler = function(match, callback) {
                callback(match);
            };
        }
        if (!api.tracker.watchdog.dom[observer]) {
            return;
        }
        for (let callback of api.tracker.watchdog.dom[observer]) {
            handler(element, callback);
        }
    };

    // pre-configured DOM observers
    // map observers to DOM class names
    // as elements are inserted into the DOM, these classes will be checked for and mapped events triggered,
    // receiving "e" event object, and a jquery bound inserted DOM element
    // NOTE: supported observers must be registered in the supported_observers array as well as the dom_observers config
    // Config example: event_name: {
    //                   class: "className", // required - check for this className in the inserted DOM element
    //                   selector: "div.className#myId", // if you need to match more than just the className of a specific element to indicate a match, you can use this selector for further checking (uses element.is(selector) on matched element). E.g. if there are multiple elements with a class indicating an observer should fire, but you only want it to fire on a specific id, then you would use this
    //                   sub_selector: "div.className", // if specified, we do a jquery element.find for the passed selector on the inserted element and ensure we can find a match
    //                   handler: function( matchElement, callback ) {} // if specified this handler is called if a match is found. Otherwise default calls the callback & passes the jQuery matchElement
    //                 },
    // TODO: current limitation allows only 1 action per watched className (i.e. each watched class must be
    //       unique). If this functionality is needed this can be worked around by pushing actions to an array
    //       in api.tracker.dom_observer_map below
    // console.log( "Observer set for", action, callback);
    api.observe.initialize_dom_observers = function() {
        api.tracker.dom_observer_init = true;
        api.tracker.supported_observers = ["view_thread", "view_email", "load_email_menu", "recipient_change", "compose"];
        api.tracker.dom_observers = {

            // when a thread is clicked on in a mailbox for viewing - note: this should fire at a similar time (directly after) as the open_email XHR observer
            // which is triggered by the XHR request rather than nodes being inserted into the DOM (and thus returns different information)
            "view_thread": {
                class: ["Bu", "nH"], // class depends if is_preview_pane - Bu for preview pane, nH for standard view
                sub_selector: "div.if,div.iY",
                handler: function(match, callback) {
                    match = new api.dom.thread(match);
                    callback(match);
                }
            },

            // when an individual email is loaded within a thread (also fires when thread loads displaying the latest email)
            "view_email": {
                // class depends if is_preview_pane - Bu for preview pane, nH for standard view,
                // FIXME: the empty class ("") is for emails opened after thread is rendered (causes a storm of updates)
                class: ["Bu", "nH", ""],
                handler: function(match, callback) {
                    setTimeout(() => {
                        match = match.find("div.adn.ads");
                        if (match.length) {
                            match = new api.dom.email(match);
                            callback(match);
                        }
                    }, 0);
                }
            },

            // when the dropdown menu next to the reply button is inserted into the DOM when viewing an email
            "load_email_menu": {
                class: "J-N",
                selector: "div[role=menu] div[role=menuitem]:first-child", // use the first menu item in the popoup as the indicator to trigger this observer
                handler: function(match, callback) {
                    match = match.closest("div[role=menu]");
                    callback(match);
                }
            },

            // a new email address is added to any of the to,cc,bcc fields when composing a new email or replying/forwarding
            "recipient_change": {
                class: ["vR", "afV"],
                handler: function(match, callback) {
                    // console.log("compose:recipient handler called",match,callback);

                    // we need to small delay on the execution of the handler as when the recipients field initialises on a reply (or reinstated compose/draft)
                    // then multiple DOM elements will be inserted for each recipient causing this handler to execute multiple times
                    // in reality we only want a single callback, so give other nodes time to be inserted & then only execute the callback once
                    if(typeof api.tracker.recipient_matches !== "object") {
                        api.tracker.recipient_matches = [];
                    }
                    api.tracker.recipient_matches.push(match);
                    setTimeout(function(){
                        // console.log("recipient timeout handler", api.tracker.recipient_matches.length);
                        if(!api.tracker.recipient_matches.length) return;

                        let composeRoot = [];
                        // sometimes (on copy-paste of contact in peoplekit mode) element disappears so iterate for all matches
                        api.tracker.recipient_matches.forEach(match => {
                            if (composeRoot.length === 0) {
                                composeRoot = match.closest("div.M9");
                            }
                        });

                        if (composeRoot.length === 0) {
                            api.tools.error("Can't find composeRoot for " + match);
                        }
                        var compose = new api.dom.compose(composeRoot);
                        // determine an array of all emails specified for To, CC and BCC and extract addresses into an object for the callback
                        var recipients = compose.recipients();
                        callback(compose, recipients, api.tracker.recipient_matches);

                        // reset matches so no future delayed instances of this function execute
                        api.tracker.recipient_matches = [];
                    },100);
                }
            },

            // this will fire if a new compose, reply or forward is created. it won"t fire if a reply changes to a forward & vice versa
            // passes a type of compose, reply, or forward to the callback
            "compose": {
                class: "An", // M9 would be better but this isn"t set at the point of insertion
                handler: function(match, callback) {
                    // console.log("reply_forward handler called", match, callback);

                    var originalMatch = match;
                    // look back up the DOM tree for M9 (the main reply/forward node)
                    match = match.closest("div.M9");
                    if (!match.length) return;
                    match = new api.dom.compose(match);
                    if (!match.is_inline()) {
                        //Find the close button and set an event listener so we can forward the compose_cancelled event.
                        var composeWindow = originalMatch.closest("div.AD");
                        composeWindow.find(".Ha").mouseup(function() {
                            if(api.tracker.composeCancelledCallback) {
                                api.tracker.composeCancelledCallback(match);
                            }
                            return true;
                        });
                    }
                    callback(match, match.type());
                }
            }
        };

        // support extending with custom observers
        if (api.tracker.custom_supported_observers) {
            $.merge(api.tracker.supported_observers, api.tracker.custom_supported_observers);
            $.extend(true, api.tracker.dom_observers, api.tracker.custom_dom_observers); // deep copy to copy in sub_observers where relevant
        }

        // map observed classNames to actions
        api.tracker.dom_observer_map = {};
        for (let [act, config] of Object.entries(api.tracker.dom_observers)) {
            if (!Array.isArray(config.class)) config.class = [config.class];
            for (let className of config.class) {
                if (!api.tracker.dom_observer_map[className]) {
                    api.tracker.dom_observer_map[className] = [];
                }
                api.tracker.dom_observer_map[className].push(act);
            }
        }
        //console.log( "observer_config", api.tracker.dom_observers, "dom_observer_map", api.tracker.dom_observer_map);
    };

    /**
       Allow an application to register a custom DOM observer specific to their app.
       Adds it to the configured DOM observers and is supported by the dom insertion observer
       This method can be called two different ways:
       Args:
       action - the name of the new DOM observer
       className / args - for a simple observer, this arg can simply be the class on an inserted DOM element that identifies this event should be
       triggered. For a more complicated observer, this can be an object containing properties for each of the supported DOM observer config arguments
    */
    api.observe.register = function(action, args) {

        // check observers configured
        if (api.tracker.dom_observer_init) {
            api.tools.error("Error: Please register all custom DOM observers before binding handlers using gmail.observe.on etc");
        }
        if (!api.tracker.custom_supported_observers) {
            api.tracker.custom_supported_observers = [];
            api.tracker.custom_dom_observers = {};
        }

        // was an object of arguments passed, or just a className
        var config = {};
        if (typeof args === "object" && !Array.isArray(args)) {

            // copy over supported config
            for (let arg of ["class", "selector", "sub_selector", "handler"]) {
                if(args[arg]) {
                    config[arg] = args[arg];
                }
            }
        } else {
            config["class"] = args;
        }
        api.tracker.custom_supported_observers.push(action);
        api.tracker.custom_dom_observers[action] = config;
    };

    var getTarget = function(e) {
        // firefox does not support e.path
        if (e.path) {
            return e.path[0];
        } else {
            return e.target;
        }
    };

    // prevent gmail jacking our click-events!
    var preventGmailJacking = function() {
        // install event-handler only once!
        if (!api.tracker.jackPreventionInstalled) {
            window.addEventListener("click", (e) => {
                const target = getTarget(e);
                if (target && target !== document.body) {
                    const gmailJsButton = target.querySelector(":scope > .gmailjs");
                    if (gmailJsButton) {
                        gmailJsButton.click();
                        e.preventDefault();
                    }
                }
            });
            api.tracker.jackPreventionInstalled = true;
        }
    };


    /**
       Observe DOM nodes being inserted. When a node with a class defined in api.tracker.dom_observers is inserted,
       trigger the related event and fire off any relevant bound callbacks
       This function should return true if a dom observer is found for the specified action
    */
    api.observe.on_dom = function(action, callback) {

        // check observers configured
        if(!api.tracker.dom_observer_init) {
            api.observe.initialize_dom_observers();
        }

        // support for DOM observers
        if (api.tracker.supported_observers.includes(action)) {

            //console.log("observer found",api.tracker.dom_observers[action]);

            // if we haven"t yet bound the DOM insertion observer, do it now
            if(!api.tracker.observing_dom) {
                api.tracker.observing_dom = true;
                //api.tracker.dom_watchdog = {}; // store passed observer callbacks for different DOM events

                // recipient_change also needs to listen to removals
                var mutationObserver = new MutationObserver(function(mutations) {
                    for (var i = 0; i < mutations.length; i++) {
                        var mutation = mutations[i];
                        var removedNodes = mutation.removedNodes;
                        for (var j = 0; j < removedNodes.length; j++) {
                            var removedNode = removedNodes[j];
                            if (removedNode.className === "agh" && removedNode.querySelector("div[data-hovercard-id]")) { // contains recipient in peoplekit
                                let observer = api.tracker.dom_observer_map["afV"];
                                let handler = api.tracker.dom_observers.recipient_change.handler;
                                api.observe.trigger_dom(observer, $(mutation.target), handler);
                            } else
                            if (removedNode.className === "vR") {
                                let observer = api.tracker.dom_observer_map["vR"];
                                let handler = api.tracker.dom_observers.recipient_change.handler;
                                api.observe.trigger_dom(observer, $(mutation.target), handler);
                            }
                        }

                        // this listener will check every element inserted into the DOM
                        // for specified classes (as defined in api.tracker.dom_observers above) which indicate
                        // related actions which need triggering
                        var addedNodes = mutation.addedNodes;
                        for (var k = 0; k < addedNodes.length; k++) {
                            var addedNode = addedNodes[k];
                            api.tools.insertion_observer(addedNode, api.tracker.dom_observers, api.tracker.dom_observer_map);
                        }
                    }
                });
                mutationObserver.observe(document.body, {subtree: true, childList: true});

            }
            api.observe.bind("dom",action,callback);
            // console.log(api.tracker.observing_dom,"dom_watchdog is now:",api.tracker.dom_watchdog);
            return true;

            // support for gmail interface load event
        }
        else if(action === "compose_cancelled") {
            //console.log("set compose cancelled callback");
            api.tracker.composeCancelledCallback = callback;
            return true;
        }
        else if(action === "load") {

            // wait until the gmail interface has finished loading and then
            // execute the passed handler. If interface is already loaded,
            // then will just execute callback
            if(api.dom.inbox_content().length) {
                preventGmailJacking();
                return callback();
            }
            var load_count = 0;
            var delay = 200; // 200ms per check
            var attempts = 50; // try 50 times before giving up & assuming an error
            var timer = setInterval(function() {
                var test = api.dom.inbox_content().length;
                if(test > 0) {
                    clearInterval(timer);
                    preventGmailJacking();
                    return callback();
                } else if(++load_count > attempts) {
                    clearInterval(timer);
                    //console.log("Failed to detect interface load in " + (delay*attempts/1000) + " seconds. Will automatically fire event in 5 further seconds.");
                    setTimeout(callback, 5000);
                }
            }, delay);
            return true;
        }
        return false;
    };

    // observes every element inserted into the DOM by Gmail and looks at the classes on those elements,
    // checking for any configured observers related to those classes
    api.tools.insertion_observer = function(target, dom_observers, dom_observer_map, sub) {
        //console.log("insertion", target, target.className);
        if(!dom_observer_map) return;

        // loop through each of the inserted elements classes & check for a defined observer on that class
        var cn = target.className || "";
        var classes = cn.trim ? cn.trim().split(/\s+/) : [];
        if(!classes.length) classes.push(""); // if no class, then check for anything observing nodes with no class
        for (let className of classes) {
            var observers = dom_observer_map[className];
            if (!observers) {
                continue;
            }

            for (var observer of observers) {

                // check if this is a defined observer, and callbacks are bound to that observer
                if(observer && api.tracker.watchdog && api.tracker.watchdog.dom[observer]) {
                    var element = $(target);
                    var config = dom_observers[observer];

                    // if a config id specified for this observer, ensure it matches for this element
                    if(config.selector && !element.is(config.selector)) {
                        break;
                    }

                    // check for any defined sub_selector match - if not found, then this is not a match for this observer
                    // if found, then set the matching element to be the one that matches the sub_selector
                    if(config.sub_selector) {
                        element = element.find(config.sub_selector);
                        // console.log("checking for subselector", config.sub_selector, element);
                    }

                    // if an element has been found, execute the observer handler (or if none defined, execute the callback)
                    if(element.length) {

                        var handler = config.handler ? config.handler : function(match, callback) { callback(match); };
                        // console.log( "inserted DOM: class match in watchdog",observer,api.tracker.watchdog.dom[observer] );
                        api.observe.trigger_dom(observer, element, handler);
                    }
                }
            }
        }
    };


    api.tools.make_request = function (_link, method, disable_cache) {
        var link = decodeURIComponent(_link.replace(/%23/g, "#-#-#"));
        method  = method || "GET";

        link = encodeURI(link).replace(/#-#-#/gi, "%23");
        var config = {type: method, url: link, async: false, dataType:"text"};
        if (disable_cache) {
            config.cache = false;
        }
        var request = $.ajax(config);
        return request.responseText;
    };


    api.tools.make_request_async = function (_link, method, callback, error_callback, disable_cache) {
        var link = decodeURIComponent(_link.replace(/%23/g, "#-#-#"));
        method  = method || "GET";

        link = encodeURI(link).replace(/#-#-#/gi, "%23");
        var config = {type: method, url: link, async: true, dataType: "text"};
        if (disable_cache){
            config.cache = false;
        }
        $.ajax(config)
            .done(function(data, textStatus, jqxhr) {
                callback(jqxhr.responseText);
            })
            .fail(function(jqxhr, textStatus, errorThrown) {
                console.error("Request Failed", errorThrown);
                if (typeof error_callback === 'function'){
                    error_callback(jqxhr, textStatus, errorThrown);
                }
            });
    };

    /**
       Creates a request to download user-content from Gmail.
       This can be used to download email_source or attachments.

       Set `preferBinary` to receive data as an Uint8Array which is unaffected
       by string-parsing or resolving of text-encoding.

       This is required in order to correctly download attachments!
    */
    api.tools.make_request_download_promise = function (url, preferBinary) {
        // if we try to download the same email/url several times,
        // something weird happens with our cookies, causing the 302
        // redirect to mail-attachment.googleusercontent.com (MAGUC)
        // to redirect back to mail.google.com.
        //
        // mail.google.com does NOT have CORS-headers for MAGUC, so
        // this redirect (and thus our request) fails.
        //
        // Adding a random variable with a constantly changing value defeats
        // any cache, and seems to solve our problem.
        const timeStamp = Date.now();
        url += "&cacheCounter=" + timeStamp;

        let responseType = "text";
        if (preferBinary) {
            responseType = "arraybuffer";
        }

        // now go download!
        return new Promise((resolve, reject) => {
            const request = new XMLHttpRequest();
            request.open("GET", url, true);
            request.responseType = responseType;

            request.onreadystatechange = () => {
                if (request.readyState !== XMLHttpRequest.DONE) {
                    return;
                }

                if (request.status >= 200 && request.status <= 302) {
                    const result = request.response;
                    if (result) {
                        if (preferBinary) {
                            const byteArray = new Uint8Array(result);
                            resolve(byteArray);
                        } else {
                            // result is regular text!
                            resolve(result);
                        }
                    }
                }
            };
            request.onerror = (ev) => {
                reject(ev);
            };

            request.send();
        });
    };


    api.tools.parse_view_data = function(view_data) {
        var parsed = [];
        var data = [];

        for(var j=0; j < view_data.length; j++) {
            if(view_data[j][0] === "tb") {
                for(var k=0; k < view_data[j][2].length; k++) {
                    data.push(view_data[j][2][k]);
                }
            }
        }

        for(var i=0; i < data.length; i++) {
            var x = data[i];

            parsed.push({
                id: x[0],
                title : x[9],
                excerpt : x[10],
                time : x[15],
                sender : x[28],
                attachment : x[13],
                labels: x[5]
            });
        }

        return parsed;
    };


    /**
     * Checks if Gmail is opened for a delegated account.
     *
     * @returns {boolean}
     */
    api.helper.get.is_delegated_inbox = function() {
        return $(".gb_Ba a.gb_f svg").length === 1;
    };


    api.helper.get.visible_emails_pre = function(customInboxQuery) {
        var page = api.get.current_page();
        var url = window.location.origin + window.location.pathname + "?ui=2&ik=" + api.tracker.ik+"&rid=" + api.tracker.rid + "&view=tl&num=120&rt=1";
        var start = $(".aqK:visible .Dj").find("span:first").text().replace(",", "").replace(".", "").split('–')[0];
        if (start) {
            start = parseInt(start - 1);
            url += "&start=" + start +
                "&sstart=" + start;
        } else {
            url += "&start=0";
        }

        var cat_label = "";

        if(page.indexOf("label/") === 0) {
            url += "&cat=" + page.split("/")[1] +"&search=cat";
        } else if(page.indexOf("category/") === 0) {
            if(page.indexOf("forums") !== -1) {
                cat_label = "group";
            } else if(page.indexOf("updates") !== -1) {
                cat_label = "notification";
            } else if(page.indexOf("promotion") !== -1) {
                cat_label = "promo";
            } else if(page.indexOf("social") !== -1) {
                cat_label = "social";
            }
            url += "&cat=^smartlabel_" + cat_label +"&search=category";
        } else if(page.indexOf("search/") === 0) {
            var at = $("input[name=at]").val();
            url += "&qs=true&q=" + page.split("/")[1] +"&at=" + at + "&search=query";
        } else if(page === "inbox"){
            if ($("div[aria-label='Social']").attr("aria-selected") === "true") {
                cat_label = "social";
                url += "&cat=^smartlabel_" + cat_label + "&search=category";
            } else if ($("div[aria-label='Promotions']").attr("aria-selected") === "true") {
                cat_label = "promo";
                url += "&cat=^smartlabel_" + cat_label + "&search=category";
            } else if ($("div[aria-label='Updates']").attr("aria-selected") === "true") {
                cat_label = "notification";
                url += "&cat=^smartlabel_" + cat_label + "&search=category";
            } else if ($("div[aria-label='Forums']").attr("aria-selected") === "true") {
                cat_label = "group";
                url += "&cat=^smartlabel_" + cat_label + "&search=category";
            } else {
                // control the behaviour with a given parameter
                if (customInboxQuery) {
                    url += "&search=" + customInboxQuery;
                }
                // tentative fix for https://github.com/KartikTalwar/gmail.js/issues/417
                else if (api.check.is_google_apps_user()) {
                    url += "&search=" + "inbox";
                } else {
                    url += "&search=" + "mbox";
                }
            }
        }else {
            url += "&search=" + page;
        }
        return url;
    };


    api.helper.get.visible_emails_post = function(get_data) {
        var emails = [];

        if (!get_data) {
            return emails;
        }

        var data = get_data.substring(get_data.indexOf("["), get_data.length);
        var json = JSON.parse(data);
        api.tracker.view_data = json;

        for(var i in api.tracker.view_data) {
            if (typeof(api.tracker.view_data[i]) === "function") {
                continue;
            }

            var cdata = api.tools.parse_view_data(api.tracker.view_data[i]);
            if(cdata.length > 0) {
                merge(emails, cdata);
            }
        }
        return emails;
    };

    api.get.visible_emails = function(customInboxQuery) {
        var url = api.helper.get.visible_emails_pre(customInboxQuery);
        var get_data = api.tools.make_request(url);
        var emails = api.helper.get.visible_emails_post(get_data);

        return emails;
    };


    api.get.visible_emails_async = function(callback, customInboxQuery) {
        var url = api.helper.get.visible_emails_pre(customInboxQuery);
        api.tools.make_request_async(url, "GET", function(get_data) {
            var emails = api.helper.get.visible_emails_post(get_data);
            callback(emails);
        });
    };


    api.get.selected_emails_data = function(customInboxQuery) {
        var selected_emails = [];
        if(!api.check.is_inside_email()){
            if($("[gh='tl'] div[role='checkbox'][aria-checked='true']").length){
                var email = null;
                var emails = api.get.visible_emails(customInboxQuery);
                $("[gh='tl'] div[role='checkbox']").each(function(index){
                    if($(this).attr("aria-checked") === "true"){
                        email = api.get.email_data(emails[index].id);
                        selected_emails.push(email);
                    }
                });
            }
        }else {
            selected_emails.push(api.get.email_data());
        }
        return selected_emails;
    };


    api.get.current_page = function(hash) {
        hash = hash || window.location.hash;

        var hashPart  = hash.split("#").pop().split("?").shift() || "inbox";

        if(hashPart.match(/\/[0-9a-zA-Z]{16,}$/gi)) {
            return "email";
        }

        var isTwopart = (hashPart.indexOf("search/") === 0
                         || hashPart.indexOf("category/") === 0
                         || hashPart.indexOf("label/") === 0);

        var result = null;
        if (!isTwopart) {
            result = hashPart.split("/").shift();
            return result;
        } else {
            var parts = hashPart.split("/");
            result = parts[0] + "/" + parts[1];
            return result;
        }
    };


    api.tools.infobox = function(message, time, html){
        var top = $(".b8.UC");

        // initial Gmail style I noticed on 26 / 05 / 2014 for $(".b8.UC") :
        // style="position: relative; top: -10000px;"
        // Seems that when Gmail shows infobox, the style is simply removed
        // - from what I can see in DevTools Elements Panel

        if(top.length > 0){
            top.stop(false, true); // cancel any existing fade so we can start again
            var info = top.find(".vh");
            if (!html) {
                info.text(message);
            } else {
                info.html(message);
            }
            if(typeof time !== "undefined"){
                var initialInfoboxStyle = top.attr("style");            // backup initial style
                top.removeAttr("style").fadeTo(time, 0, function(){     // simply remove then restore
                    $(this).attr("style", initialInfoboxStyle);           // style attribute insteed of playing
                });                             // on visibility property
            }
            else{
                top.removeAttr("style");                    // dito
            }
        }
    };

    /**
     * Re-renders the UI using the available data.
     *
     * This method does _not_ cause Gmail to fetch new data. This method is useful
     * in circumstances where Gmail has data available but does not immediately
     * render it. `observe.after` may be used to detect when Gmail has fetched the
     * relevant data. For instance, to refresh a conversation after Gmail fetches
     * its data:
     *
     *     gmail.observe.after("refresh", function(url, body, data, xhr) {
     *       if (url.view === "cv") {
     *         gmail.tools.rerender();
     *       }
     *     });
     *
     * If a callback is passed, it will be invoked after re-rendering is complete.
     */
    api.tools.rerender = function(callback) {
        var url = window.location.href;
        var hash = window.location.hash;

        // Get Gmail to re-render by navigating away and then back to the current URL. We keep the
        // UI from changing as we navigate away by visiting an equivalent URL: the current URL with the
        // first parameter of the hash stripped ("#inbox/14a16fab4adc1456" -> "#/14a16fab4adc1456" or
        // "#inbox" -> "#").
        var tempUrl;
        if (hash.indexOf("/") !== -1) {
            tempUrl = url.replace(/#.*?\//, "#/");
        } else {
            tempUrl = url.replace(/#.*/, "#");
        }
        window.location.replace(tempUrl);

        // Return to the original URL after a 0-timeout to force Gmail to navigate to the temp URL.
        setTimeout(function() {
            window.location.replace(url);

            // For some reason, the two replace operations above create a history entry (tested in
            // Chrome 39.0.2171.71). Pop it to hide our URL manipulation.
            window.history.back();

            if (callback) callback();
        }, 0);
    };

    api.tools.get_reply_to = function(ms13) {
        // reply to is an array if exists
        var reply_to = ms13 ? ms13[4] : [];

        // if reply to set get email from it and return it
        if (reply_to.length !== 0) {
            return api.tools.extract_email_address(reply_to[0]);
        }

        // otherwise return null
        return null;
    };

    api.tools.parse_attachment_data = function(x) {
        if (!x[7] || ! x[7][0])
        {
            return null;
        }

        var baseUrl = "";
        if (typeof(window) !== "undefined") {
            baseUrl =  window.location.origin + window.location.pathname;
        }

        var ad = x[7][0];
        api.tracker.attachment_data = ad;

        var attachments = [];
        for (var i = 0; i < ad.length; i++)
        {
            var a = ad[i];
            attachments.push({
                attachment_id: a[0],
                name: a[1],
                type: a[2],
                size: a[3],
                url: baseUrl + a[9]
            });
        }
        return attachments;
    };

    api.tools.parse_email_data = function(email_data) {
        var data = {};

        for(var i in email_data) {
            var x = email_data[i];
            if(x[0] === "cs") {
                data.thread_id = x[1];
                data.first_email= x[8][0];
                data.last_email = x[2];
                data.total_emails = x[3];
                data.total_threads = x[8];
                data.people_involved = x[15];
                data.subject = x[23];
            }

            if(x[0] === "ms") {
                if(data.threads === undefined) {
                    data.threads = {};
                }

                data.threads[x[1]] = {};
                data.threads[x[1]].is_deleted = (x[9] && x[9].indexOf("^k") > -1);
                data.threads[x[1]].reply_to_id = x[2];
                data.threads[x[1]].from = x[5];
                data.threads[x[1]].from_email = x[6];
                data.threads[x[1]].timestamp = x[7];
                data.threads[x[1]].datetime = x[24];
                data.threads[x[1]].attachments = x[21].split(",");
                data.threads[x[1]].attachments_details = x[13] ? api.tools.parse_attachment_data(x[13]) : null;
                data.threads[x[1]].subject = x[12];
                data.threads[x[1]].content_html = x[13] ? x[13][6] : x[8];
                data.threads[x[1]].to = x[13] ? x[13][1] : ((x[37] !== undefined) ? x[37][1]:[]);
                data.threads[x[1]].cc = x[13] ? x[13][2] : [];
                data.threads[x[1]].bcc = x[13] ? x[13][3] : [];
                data.threads[x[1]].reply_to = api.tools.get_reply_to(x[13]);
                data.threads[x[1]].labels = x[9];

                try { // jQuery will sometime fail to parse x[13][6], if so, putting the raw HTML
                    data.threads[x[1]].content_plain = x[13] ? $(x[13][6]).text() : x[8];
                }
                catch(e) {
                    data.threads[x[1]].content_plain = x[13] ? x[13][6] : x[8];
                }
            }
        }

        return data;
    };


    api.helper.get.email_data_pre = function(thread_id) {
        oldGmailApiDeprecated("Migrate code to use gmail.new.get.email_data() to fix this problem.");

        if(api.check.is_inside_email() && thread_id === undefined) {
            thread_id = api.get.thread_id();
        }

        var url = null;
        if(thread_id !== undefined) {
            url = window.location.origin + window.location.pathname + "?ui=2&ik=" + api.tracker.ik + "&rid=" + api.tracker.rid + "&view=cv&th=" + thread_id + "&msgs=&mb=0&rt=1&search=inbox";
        }
        return url;
    };


    api.helper.get.email_data_post = function(get_data) {
        if (!get_data) {
            return {};
        }
        var data = get_data.substring(get_data.indexOf("["), get_data.length);
        var json = JSON.parse(data);

        api.tracker.email_data = json[0];
        return api.tools.parse_email_data(api.tracker.email_data);
    };


    api.get.email_data = function(thread_id) {
        var url = api.helper.get.email_data_pre(thread_id);

        if (url !== null) {
            var get_data = api.tools.make_request(url);
            var email_data = api.helper.get.email_data_post(get_data);
            return email_data;
        }

        return {};
    };


    api.get.email_data_async = function(email_id, callback) {
        var url = api.helper.get.email_data_pre(email_id);
        if (url !== null) {
            api.tools.make_request_async(url, "GET", function (get_data) {
                var email_data = api.helper.get.email_data_post(get_data);
                callback(email_data);
            });
        } else {
            callback({});
        }
    };


    api.helper.get.legacy_email_id = function(identifier) {
        if (!identifier) {
            return null;
        } else if (api.check.data.is_legacy_email_id(identifier)) {
            return identifier;
        } else if (identifier.legacy_email_id) {
            return identifier.legacy_email_id;
        } else if (api.check.data.is_email_id(identifier)) {
            console.warn("GmailJS: Warning! Using new-style ID in method expecting legacy-style IDs! Attempting to resolve via cache, but there's no guarantee this will work!");
            const emailData = api.cache.emailIdCache[identifier];
            return emailData && emailData.legacy_email_id;
        }

        // DOMEmail
        if (identifier.$el && identifier.$el[0]) {
            identifier = identifier.$el[0]; // fallback to element-lookup.
        }

        // HTML Element
        if (identifier.dataset && identifier.dataset.legacyMessageId) {
            return identifier.dataset.legacyMessageId;
        }

        return null;
    };

    api.helper.get.new_email_id = function(identifier) {
        if (!identifier) {
            return null;
        } else if (api.check.data.is_email_id(identifier)) {
            return identifier;
        } else if (identifier.id && !identifier.$el) { // ensure to only email_data, not DomEmail!
            return identifier.id;
        } else if (api.check.data.is_legacy_email_id(identifier)) {
            console.warn("GmailJS: Warning! Using legacy-style ID in method expecting new-style IDs! Attempting to resolve via cache, but there's no guarantee this will work!");
            const emailData = api.cache.emailLegacyIdCache[identifier];
            return emailData && emailData.id;
        }

        // DOMEmail
        if (identifier.$el && identifier.$el[0]) {
            identifier = identifier.$el[0]; // fallback to element-lookup.
        }

        // HTML Element
        if (identifier.dataset && identifier.dataset.messageId) {
            let id = identifier.dataset.messageId;
            if (id.indexOf("#") === 0) {
                id = id.substring(1);
            }

            return id;
        }

        return null;
    };

    api.helper.get.thread_id = function(identifier) {
        if (!identifier) {
            return null;
        } else if (api.check.data.is_thread_id(identifier)) {
            return identifier;
        } else if (identifier.thread_id) { // NewEmailData
            return identifier.thread_id;
        } else if (api.check.data.is_email_id(identifier)) {
            console.warn("GmailJS: Warning! Using email-ID in method expecting thread-ID! Attempting to resolve via cache, but there's no guarantee this will work!");
            const emailData = api.cache.emailIdCache[identifier];
            return emailData && emailData.thread_id;
        } else if (api.check.data.is_legacy_email_id(identifier)) {
            console.warn("GmailJS: Warning! Using legacy-style ID in method expecting thread-ID! Attempting to resolve via cache, but there's no guarantee this will work!");
            const emailData = api.cache.emailLegacyIdCache[identifier];
            return emailData && emailData.thread_id;
        }

        // DOMEmail or DOMThread
        if (identifier.$el && identifier.$el[0]) {
            identifier = identifier.$el[0]; // fallback to element-lookup.
        }

        // HTML Element - Thread
        if (identifier.dataset && identifier.dataset.threadPermId) {
            let id = identifier.dataset.threadPermId;
            if (id.indexOf("#") === 0) {
                id = id.substring(1);
            }

            return id;
        }

        // HTML Element - Email
        if (identifier.dataset && identifier.dataset.messageId) {
            let id = identifier.dataset.messageId;
            if (id.indexOf("#") === 0) {
                id = id.substring(1);
            }

            console.warn("GmailJS: Warning! Using DomEmail instance to lookup thread-ID. Attempting to resolve via cache, but there's no guarantee this will work!");
            const emailData = api.cache.emailIdCache[id];
            return emailData && emailData.thread_id;
        }

        return null;
    };

    api.helper.clean_thread_id = function(thread_id) {
        // handle new gmail style email-ids
        if (thread_id.startsWith("#")) {
            thread_id = thread_id.substring(1);
        }

        return thread_id;
    };

    api.helper.get.email_source_pre = function(identifier) {
        if(!identifier && api.check.is_inside_email()) {
            identifier = api.get.email_id();
        }

        // if we have an old-style ID, construct URL based on that
        if (api.check.data.is_legacy_email_id(identifier)) {
            return window.location.origin + window.location.pathname + "?view=att&th=" + identifier + "&attid=0&disp=comp&safe=1&zw";
        }

        // otherwise default to new-style ID interface
        const email_id = api.helper.get.new_email_id(identifier);
        if(email_id) {
            return window.location.origin + window.location.pathname + "?view=att&permmsgid=" + email_id + "&attid=0&disp=comp&safe=1&zw";
        } else {
            return null;
        }
    };


    api.get.email_source = function(identifier) {
        console.warn("Gmail.js: This function has been deprecated and will be removed in an upcoming release! Please migrate to email_source_async or email_source_promise!");
        var url = api.helper.get.email_source_pre(identifier);
        if (url !== null) {
            return api.tools.make_request(url, "GET", true);
        }
        return "";
    };


    api.get.email_source_async = function(identifier, callback, error_callback, preferBinary) {
        api.get.email_source_promise(identifier, preferBinary)
            .then(callback)
            .catch(error_callback);
    };

    api.get.email_source_promise = function(identifier, preferBinary) {
        const url = api.helper.get.email_source_pre(identifier);
        if (url !== null) {
            return api.tools.make_request_download_promise(url, preferBinary);
        } else {
            return new Promise((resolve, reject) => {
                reject("Unable to resolve URL for email source!");
            });
        }
    };

    api.get.displayed_email_data = function() {
        var email_data = api.get.email_data();

        if (api.check.is_conversation_view()) {
            return get_displayed_email_data_for_thread(email_data);
        }
        else { // Supposing only one displayed email.
            return get_displayed_email_data_for_single_email(email_data);
        }
    };

    api.get.displayed_email_data_async = function (callback) {
        api.get.email_data_async(undefined, function (email_data) {
            if (api.check.is_conversation_view()) {
                callback(get_displayed_email_data_for_thread(email_data));
            }
            else { // Supposing only one displayed email.
                callback(get_displayed_email_data_for_single_email(email_data));
            }
        });
    };

    var get_displayed_email_data_for_thread = function(email_data) {
        var displayed_email_data = email_data;

        var threads = displayed_email_data.threads;
        var total_threads = displayed_email_data.total_threads;

        var hash = window.location.hash.split("#")[1] || "";
        var is_in_trash = (hash.indexOf("trash") === 0);

        for (var id in threads) {
            var email = threads[id];
            var keep_email = (is_in_trash) ? email.is_deleted : !email.is_deleted;

            if (!keep_email) {
                delete threads[id];
                total_threads.splice(total_threads.indexOf(id), 1);
                displayed_email_data.total_emails--;
                // TODO: remove people involved only in this email.
            }
        }
        return displayed_email_data;
    };

    var get_displayed_email_data_for_single_email = function(email_data) {
        var displayed_email_data = {};
        for (var id in email_data.threads) {
            var displayed_email_element = document.querySelector("div[data-legacy-message-id='" + id + "']");

            if (displayed_email_element) {
                var email = email_data.threads[id];

                displayed_email_data.first_email = id;
                displayed_email_data.last_email = id;
                displayed_email_data.subject = email_data.subject;

                displayed_email_data.threads = {};
                displayed_email_data.threads[id] = email;
                displayed_email_data.total_emails = 1;
                displayed_email_data.total_threads = [id];

                displayed_email_data.people_involved = [];

                displayed_email_data.people_involved.push(
                    [email.from, email.from_email]
                );

                email.to.forEach(function(recipient) {
                    var address = api.tools.extract_email_address(recipient);
                    var name = api.tools.extract_name(recipient.replace(address, "")) || "";

                    displayed_email_data.people_involved.push(
                        [name, address]
                    );
                });

                break;
            }
        }
        return displayed_email_data;
    };


    api.check.is_conversation_view = function() {
        if( api.check.is_new_data_layer() ) {
            var conversation_flag = undefined;
            conversation_flag = api.tracker.globals[24].indexOf(7164);
            return conversation_flag !== -1;
        } else {	//To handle classic gmail UI
            var flag_name = "bx_vmb";
            var flag_value = undefined;
            var array_with_flag = api.tracker.globals[17][4][1];
            for (var i = 0; i < array_with_flag.length; i++) {
                var current = array_with_flag[i];
                if (current[0] === flag_name) {
                    flag_value = current[1];
                    break;
                }
            }
            return flag_value === "0" || flag_value === undefined;
        }
    };

    api.tools.extract_email_address = function(str) {
        var regex = /[\+a-z0-9._-]+@[a-z0-9._-]+\.[a-z0-9._-]+/gi;
        var matches = (str) ? str.match(regex) : undefined;

        return (matches) ? matches[0] : undefined;
    };


    api.tools.extract_name = function(str) {
        var regex = /[a-z\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF"._\s-]+/gi;
        var matches = (str) ? str.match(regex) : undefined;

        return (matches && matches[0]) ? matches[0].trim() : undefined;
    };


    api.tools.i18n = function(label) {
        var locale = api.get.localization();
        var dictionary;

        switch (locale) {
        case "fr":
            dictionary = {
                "inbox": "Boîte de réception",
                "drafts": "Brouillons",
                "spam": "Spam",
                "forums": "Forums",
                "updates": "Mises à jour",
                "promotions": "Promotions",
                "social_updates": "Réseaux sociaux"
            };
            break;

        case "no":
            dictionary = {
                "inbox": "Innboks",
                "drafts": "Utkast",
                "spam": "Søppelpost",
                "forums": "Forumer",
                "updates": "Oppdateringer",
                "promotions": "Reklame",
                "social_updates": "Sosialt"
            };
            break;

        case "nl":
            dictionary = {
                "inbox": "Postvak IN",
                "drafts": "Concepten",
                "spam": "Spam",
                "forums": "Forums",
                "updates": "Updates",
                "promotions": "Reclame",
                "social_updates": "Sociaal"
            };
            break;

        case "it":
            dictionary = {
                "inbox": "Posta in arrivo",
                "drafts": "Bozza",
                "spam": "Spam",
                "forums": "Forum",
                "updates": "Aggiornamenti",
                "promotions": "Promozioni",
                "social_updates": "Social"
            };
            break;

        case "en":
        default:
            dictionary = {
                "inbox": "Inbox",
                "drafts": "Drafts",
                "spam": "Spam",
                "forums": "Forums",
                "updates": "Updates",
                "promotions": "Promotions",
                "social_updates": "Social Updates"
            };
            break;
        }

        return dictionary[label];
    };

    var create_generic_toolbar_button = function(content_html, onClickFunction, basicStyle, defaultStyle, styleClass, selector) {
        var container = $(document.createElement("div"));
        container.attr("class","G-Ni J-J5-Ji");

        var button = $(document.createElement("div"));
        var buttonClasses = "T-I J-J5-Ji gmailjs ";
        if(styleClass !== undefined &&
            styleClass !== null &&
            styleClass !== ""){
            buttonClasses += basicStyle+styleClass;
        }else{
            buttonClasses += basicStyle+defaultStyle;
        }
        button.attr("class", buttonClasses);

        button.html(content_html);
        button.click(onClickFunction);

        var content = $(document.createElement("div"));
        content.attr("class","asa");

        container.html(button);

        selector.append(container);

        return container;
    };

    api.tools.add_toolbar_button = function(content_html, onClickFunction, styleClass) {
        var basicLeftStyle = "lS ";
        var defaultLeftStyle = "T-I-ax7 ar7";

        return create_generic_toolbar_button(content_html, onClickFunction, basicLeftStyle, defaultLeftStyle, styleClass, api.dom.toolbar());
    };

    api.tools.add_right_toolbar_button = function(content_html, onClickFunction, styleClass) {
        var basicRightStyle = "ash ";
        var defaultRightStyle = "T-I-ax7 L3";

        return create_generic_toolbar_button(content_html, onClickFunction, basicRightStyle, defaultRightStyle, styleClass, api.dom.right_toolbar());
    };

    api.tools.add_compose_button = function(composeWindow, content_html, onClickFunction, styleClass) {
        var div = $(document.createElement("div"));
        div.attr("class", "gU Up");
        div.attr("style", "cursor: pointer !important; transform: translateY(1px);");

        var button = $(document.createElement("div"));
        var buttonClasses = "T-I J-J5-Ji aoO T-I-atl L3 gmailjs gmailjscomposebutton ";
        if(styleClass !== undefined){
            buttonClasses += styleClass;
        }
        button.attr("class", buttonClasses);
        button.attr("style", "margin-left: 8px; max-width: 500px;");
        button.html(content_html);
        button.click(onClickFunction);

        div.append(button);

        var sendButton = composeWindow.find(".gU.Up").last();
        div.insertAfter(sendButton);

        return button;
    };

    api.tools.add_more_send_option = function(composeWindow, buttonText, onClickFunction, styleClass, imgClass) {
        var div = $(document.createElement("div"));
        div.attr("class", "J-N yr");
        div.attr("style", "user-select: none;");
        div.attr("role", "menuitem");

        var button = $(document.createElement("div"));
        var buttonClasses = "J-N-Jz ";
        if (styleClass !== undefined) {
            buttonClasses += styleClass;
        }
        button.attr("class", buttonClasses);
        button.attr("style", "user-select: none;");

        var img = $(document.createElement("img"));
        var imgClassFull = "J-N-JX";
        if (imgClass !== undefined){
            imgClassFull = imgClass + " " + imgClassFull;
        }
        img.attr("class", imgClassFull);
        img.attr("style", "user-select: none;");
        img.attr("role", "menuitem");
        img.attr("src", "images/cleardot.gif");
        button.append(img);

        button.append(buttonText);
        button.click(onClickFunction);

        div.append(button);

        var scheduledSend = composeWindow.find(".J-N.yr").last();
        div.insertAfter(scheduledSend);

        return button;
    };

    /**
       adds a button to an email attachment.

       'attachment'-parameter must be the object returned from api.dom.email().attachments().
       'contentHtml' should represent a 21x21 image of some kind. optional.
       'customCssClass' styling used on the buttons central area. optional.
       'tooltip' will be shown on hover.

       return-value is jQuery-instance representing the created button.
       */
    api.tools.add_attachment_button = function(attachment, contentHtml, customCssClass, tooltip, onClickFunction) {
        var button = $(document.createElement("div"));
        button.attr("class", "T-I J-J5-Ji aQv T-I-ax7 L3");
        button.attr("style", "user-select: none;");
        button.attr("aria-label", tooltip);
        button.attr("data-tooltip", tooltip);

        // make hover-state match existing buttons
        var hoverClass = "T-I-JW";
        button.mouseover(function() { this.classList.add(hoverClass); });
        button.mouseout(function() { this.classList.remove(hoverClass); });

        var div = $(document.createElement("div"));
        var divClass = "wtScjd J-J5-Ji aYr";
        if (customCssClass) {
            divClass += " " + customCssClass;
        }
        div.attr("class", divClass);
        if (contentHtml) {
            div.html(contentHtml);
        }

        button.append(div);
        button.click(onClickFunction);
        attachment.$el.find("div.aQw").append(button);

        return button;
    };

    api.tools.remove_modal_window = function() {
        $("#gmailJsModalBackground").remove();
        $("#gmailJsModalWindow").remove();
    };

    api.tools.add_modal_window = function(title, content_html, onClickOk, onClickCancel, onClickClose, okText, cancelText) {
        // By default, clicking on cancel or close should clean up the modal window
        onClickClose = onClickClose || api.tools.remove_modal_window;
        onClickCancel = onClickCancel || api.tools.remove_modal_window;

        okText = okText || "OK";
        cancelText = cancelText || "Cancel";

        var background = $(document.createElement("div"));
        background.attr("id","gmailJsModalBackground");
        background.attr("class","Kj-JD-Jh");
        background.attr("aria-hidden","true");
        background.attr("style","opacity:0.75;width:100%;height:100%;");

        // Modal window wrapper
        var container = $(document.createElement("div"));
        container.attr("id","gmailJsModalWindow");
        container.attr("class", "Kj-JD");
        container.attr("tabindex", "0");
        container.attr("role", "alertdialog");
        container.attr("aria-labelledby", "gmailJsModalWindowTitle");
        container.attr("style", "left:50%;top:50%;opacity:1;");

        // Modal window header contents
        var header = $(document.createElement("div"));
        header.attr("class", "Kj-JD-K7 Kj-JD-K7-GIHV4");

        var heading = $(document.createElement("span"));
        heading.attr("id", "gmailJsModalWindowTitle");
        heading.attr("class", "Kj-JD-K7-K0");
        heading.attr("role", "heading");
        heading.html(title);

        var closeButton = $(document.createElement("span"));
        closeButton.attr("id", "gmailJsModalWindowClose");
        closeButton.attr("class", "Kj-JD-K7-Jq");
        closeButton.attr("role", "button");
        closeButton.attr("tabindex", "0");
        closeButton.attr("aria-label", "Close");
        closeButton.click(onClickClose);

        header.append(heading);
        header.append(closeButton);

        // Modal window contents
        var contents = $(document.createElement("div"));
        contents.attr("id", "gmailJsModalWindowContent");
        contents.attr("class", "Kj-JD-Jz");
        contents.html(content_html);

        // Modal window controls
        var controls = $(document.createElement("div"));
        controls.attr("class", "Kj-JD-Jl");

        var okButton = $(document.createElement("button"));
        okButton.attr("id", "gmailJsModalWindowOk");
        okButton.attr("class", "J-at1-auR J-at1-atl");
        okButton.attr("name", "ok");
        okButton.text(okText);
        okButton.click(onClickOk);

        var cancelButton = $(document.createElement("button"));
        cancelButton.attr("id", "gmailJsModalWindowCancel");
        cancelButton.attr("name", "cancel");
        cancelButton.text(cancelText);
        cancelButton.click(onClickCancel);

        controls.append(okButton);
        controls.append(cancelButton);

        container.append(header);
        container.append(contents);
        container.append(controls);

        $(document.body).append(background);
        $(document.body).append(container);

        var center = function() {
            container.css({
                top: ($(window).height() - container.outerHeight()) / 2,
                left: ($(window).width() - container.outerWidth()) / 2
            });
        };

        center();

        container.on("DOMSubtreeModified", center);
        $(window).resize(center);
    };

    api.tools.toggle_minimize = function (){
        //The minimize button
        var minimizeButton = $("[alt='Minimize']")[0];

        if(minimizeButton) {
            minimizeButton.click();

            return true;
        }
        return false;
    };

    api.chat.is_hangouts = function() {
        if(api.tracker.hangouts !== undefined) {
            return api.tracker.hangouts;
        }

        // Returns true if the user is using hangouts instead of the classic chat
        var dwClasses = $(".dw");
        if(dwClasses.length > 1) {
            throw "Figuring out is hangouts - more than one dw classes found";
        }
        if(dwClasses.length === 0) {
            throw "Figuring out is hangouts - no dw classes found";
        }

        var dw = dwClasses[0];

        var chatWindows = $(".nH.aJl.nn", dw);
        if(chatWindows.length > 0) {
            // hangouts
            api.tracker.hangouts = true;
            return true;
        }

        chatWindows = $(".nH.nn", dw);

        if(chatWindows.length > 2) {
            // classic
            api.tracker.hangouts = false;
            return false;
        }
        return undefined;
    };

    /**
     * Returns data about the currently visible messages available in the DOM:
     * {
     *    from: {
     *      name: string,
     *      email: string,
     *    },
     *    summary: string, // subject and email summary
     *    thread_id: string,
     *    legacy_email_id: string,
     *    $el: HTMLElement,
     * }
     */
    api.dom.visible_messages = function() {
        const ret = [];
        // [draggable="true"] is not always on the rows for some unknown reason
        $('tbody>tr.zA[role="row"]:visible', api.dom.inbox_content())
            .each((index, msgEle) => {
                const nameAndEmail = $('*[email][name]', msgEle);
                const linkAndSubject = $('*[role=link]', msgEle);
                // example value: #thread-f:1638756560099919527|msg-f:1638756560099919527"
                const idNode = msgEle.querySelector("span[data-thread-id]");
                ret.push({
                    from: {
                        name: nameAndEmail.attr('name'),
                        email: nameAndEmail.attr('email'),
                    },
                    summary: linkAndSubject[0].innerText,
                    thread_id: api.helper.clean_thread_id(idNode && idNode.dataset && idNode.dataset.threadId || ""),
                    legacy_email_id: (idNode && idNode.dataset && idNode.dataset.legacyMessageId || ""),
                    $el: $(msgEle),
                });
            });
        return ret;
    };

    // retrieve queue of compose window dom objects
    // latest compose at the start of the queue (index 0)
    api.dom.composes = function() {
        var objs = [];
        $("div.M9").each(function(idx, el) {
            objs.push( new api.dom.compose(el));
        });
        return objs;
    };

    api.dom.helper = {
    };
    /**
      * triggers a keyboard event inside a textarea, to ensure Gmail updates
      * the underlying data-model to use the email injected into the textarea.
      */
    api.dom.helper.trigger_address = function($el) {
        // actual DOM element, no jQuery.
        let el = $el[0];
        let event = new KeyboardEvent("keydown", {
            bubbles : true,
            cancelable : true,
            key : "Tab",
            shiftKey : true,
            keyCode : 9
        });

        el.focus();
        el.dispatchEvent(event);
    };

    /**
       A compose object. Represents a compose window in the DOM and provides a bunch of methods and properties to access & interact with the window
       Expects a jQuery DOM element for the compose div
    */
    api.dom.compose = function(element) {
        if (this.constructor !== api.dom.compose) {
            // if not invoked through new(), nothing works as expected!
            return new api.dom.compose(element);
        }

        element = $(element);
        if(!element || (!element.hasClass("M9") && !element.hasClass("AD"))) api.tools.error("api.dom.compose called with invalid element");
        this.$el = element;
        return this;
    };

    extend(api.dom.compose.prototype, {
        /**
           Retrieve the compose id
        */
        id: function() {
            return this.dom("id").val();
        },

        /**
           Retrieve the draft email id
        */
        email_id: function() {
            let email_id = this.dom("draft").val();
            // handle new gmail style email-ids
            if (email_id && email_id.startsWith("#")) {
                return email_id.substring(1);
            } else {
                return email_id;
            }
        },

        /**
           Retrieve the draft thread id
        */
        thread_id: function() {
            let thread_id = this.dom("thread").val() || "";

            return api.helper.clean_thread_id(thread_id);
        },

        /**
           Is this compose instance inline (as with reply & forwards) or a popup (as with a new compose)
        */
        is_inline: function() {
            return this.$el.closest(".AO").length > 0;
        },

        /**
            Compose type - reply / forward / compose (new)
         */
        type: function() {
            return this.is_inline()
                ? this.find("input[name=subject]").val().indexOf("Fw") === 0
                    ? "forward"
                    : "reply"
                : "compose";
        },

        /**
           Retrieves to, cc, bcc and returns them in a hash of arrays
           Parameters:
           options.type  string  to, cc, or bcc to check a specific one
           options.flat  boolean if true will just return an array of all recipients instead of splitting out into to, cc, and bcc
        */
        recipients: function(options) {
            if (typeof options !== "object") options = {};
            const peopleKit = api.check.is_peoplekit_compose(this.$el);

            const type_selector = options.type ? "[name=" + options.type + "]" : "";

            const found = peopleKit ?
                this.$el.find("tr.bzf " + (type_selector || "div[name]") + " div[data-hovercard-id]").map((_, el) => ({
                    type: options.type || el.closest("div[name]").getAttribute("name"),
                    email: el.getAttribute("data-hovercard-id")
                })) :
                this.$el.find(".GS input[type=hidden]" + type_selector).map((_, el) => ({
                    type: el.name,
                    email: el.value
                }));

            if (options.flat) {
                return found.toArray().map(r => r.email);
            } else {
                let result = { to: [], cc: [], bcc: [] };
                if (options.type) {
                    result[options.type] = found.toArray()
                        .filter(r => r.type === options.type)
                        .map(r => r.email);
                } else {
                    ["to", "cc", "bcc"].forEach(type => {
                        result[type] = found.toArray()
                            .filter(r => r.type === type)
                            .map(r => r.email);
                    });
                }
                return result;
            }
        },

        /**
           Retrieve the typing area for "to" recipients, not recipients.
           Either textarea or input, which can be empty if last recipient are typed and selected (by pressing ENTER)
        */
        to: function(to) {
            const $el = this.dom("to").val(to);
            api.dom.helper.trigger_address($el);
            return $el;
        },

        /**
           Retrieve the typing area for "cc" recipients, not recipients.
           Either textarea or input, which can be empty if last recipient are typed and selected (by pressing ENTER)
        */
        cc: function(cc) {
            // ensure cc is visible before setting!
            if (cc) {
                const showCc = this.dom("show_cc");
                showCc.click();
            }

            const $el = this.dom("cc").val(cc);
            api.dom.helper.trigger_address($el);
            return $el;
        },

        /**
           Retrieve the typing area for "bcc" recipients, not recipients.
           Either textarea or input, which can be empty if last recipient are typed and selected (by pressing ENTER)
        */
        bcc: function(bcc) {
            // ensure bcc is visible before setting!
            if (bcc) {
                const showBcc = this.dom("show_bcc");
                showBcc.click();
            }

            const $el = this.dom("bcc").val(bcc);
            api.dom.helper.trigger_address($el);
            return $el;
        },

        /**
           Get/Set the current subject
           Parameters:
           subject   string  set as new subject
        */
        subject: function(subject) {
            if(subject) this.dom("all_subjects").val(subject);
            subject = this.dom("subjectbox").val();
            return subject ? subject : this.dom("subject").val();
        },

        /**
           Get the from email
           if user only has one email account they can send from, returns that email address
        */
        from: function() {
            var el = this.dom("from");
            if (el.length) {
                var fromNameAndEmail = el.val();
                if (fromNameAndEmail) {
                    return api.tools.extract_email_address(fromNameAndEmail);
                }
            }
            return api.get.user_email();
        },

        /**
           Get/Set the email body
        */
        body: function(body) {
            var el = this.dom("body");
            if(body) el.html(body);
            return el.html();
        },

        /**
            Get the email attachments
        */
        attachments: function() {
            var out = [];
            var failed = false;

            this.dom("attachments").each(function() {
                var el = $(this);

                var result = {};
                result.$el = el;
                result.name = el.find("div.vI").html();
                result.size = el.find("div.vJ").html();
                result.url = el.find("a.dO").attr("href");
                result.type = "https";

                out.push(result);
            });

            if (failed) {
                return undefined;
            } else {
                return out;
            }
        },

        /**
          Triggers the same action as clicking the "send" button would do.
          */
        send: function() {
            return this.dom("send_button").click();
        },

        /**
           Map find through to jquery element
        */
        find: function(selector) {
            return this.$el.find(selector);
        },

        /**
           Close compose window
        */
        close: function() {
            const e = document.createEvent('Events');
            e.initEvent('keydown', true, true);
            e.which = 27;
            e.keyCode = 27;

            var $body = this.dom('body');
            $body.focus();
            $body[0].dispatchEvent(e);
        },

        /**
           Retrieve preconfigured dom elements for this compose window
        */
        dom: function(lookup) {
            if (!lookup) return this.$el;
            var config = {
                to:"textarea[name=to]",
                cc:"textarea[name=cc]",
                bcc:"textarea[name=bcc]",
                id: "input[name=composeid]",
                draft: "input[name=draft]",
                thread: "input[name=rt]",
                subject: "input[name=subject]",
                subjectbox: "input[name=subjectbox]",
                all_subjects: "input[name=subjectbox], input[name=subject]",
                body: "div[contenteditable=true]:not([id=subject])",
                quoted_reply: "input[name=uet]",
                reply: "M9",
                forward: "M9",
                from: "input[name=from]",
                attachments: "div.dL",
                send_button: "div.T-I.T-I-atl:not(.gmailjscomposebutton)",
                show_cc: "span.aB.gQ.pE",
                show_bcc: "span.aB.gQ.pB"
            };

            if (api.check.is_peoplekit_compose(this.$el)) {
                config = Object.assign(config, {
                    to: "div[name=to] input",
                    cc: "div[name=cc] input",
                    bcc: "div[name=bcc] input"
                });
            }

            if(!config[lookup]) api.tools.error("Dom lookup failed. Unable to find config for \"" + lookup + "\"",config,lookup,config[lookup]);
            return this.$el.find(config[lookup]);
        }

    });

    /**
       An object for interacting with an email currently present in the DOM. Represents an individual email message within a thread
       Provides a number of methods and properties to access & interact with it
       Expects a jQuery DOM element for the email div (div.adn as returned by the "view_email" observer), or an email_id
    */
    api.dom.email = function(element) {
        if (this.constructor !== api.dom.email) {
            // if not invoked through new(), nothing works as expected!
            return new api.dom.email(element);
        }

        if (typeof element === "string" && api.check.data.is_legacy_email_id(element)) {
            this.id = element;
            this.$el = $("div.adn[data-legacy-message-id='" + this.id + "']");
        } else if (typeof element === "string" && api.check.data.is_email_id(element)) {
            const elem = document.querySelector("div.adn[data-message-id='" + element.replace("msg-f:", "\\#msg-f\\:") + "']");
            this.id = elem.dataset.legacyMessageId;
            this.$el = $(elem);
        } else if (element &&
                   ((element.classList && element.classList.contains("adn")) // DOM
                    || (element.hasClass && element.hasClass("adn"))))       // jQuery
        {
            this.$el = $(element);
            this.id = this.$el.data("legacyMessageId");
        } else {
            api.tools.error("api.dom.email called with invalid element/id");
        }

        // silence linter!
        return this;
    };

    extend(api.dom.email.prototype, {

        /**
           Get/Set the full email body as it sits in the DOM
           If you want the actual DOM element use .dom("body");
           Note: This gets & sets the body html after it has been parsed & marked up by GMAIL. To retrieve it as it exists in the email message source, use a call to .data();
        */
        body: function(body) {
            var el = this.dom("body");
            if (body) {
                el.html(body);
            }
            return el.html();
        },

        /**
           Get/Set the sender
           Optionally receives email and name properties. If received updates the values in the DOM
           Returns an object containing email & name of the sender and dom element
        */
        from: function(email, name) {
            var el = this.dom("from");
            if (email) {
                el.attr("email",email);
            }
            if (name) {
                el.attr("name",name);
                el.html(name);
            }
            return {
                email: el.attr("email"),
                name: el.attr("name"),
                el: el
            };
        },

        /**
           Get/Set who the email is showing as To
           Optionally receives an object containing email and/or name properties. If received updates the values in the DOM.
           Optionally receives an array of these objects if multiple recipients
           Returns an array of objects containing email & name of who is showing in the DOM as the email is to
        */
        to: function(to_array) {

            // if update data has been passeed, loop through & create a new to_wrapper contents
            if (to_array) {
                if (!Array.isArray(to_array)) {
                    to_array = [to_array];
                }
                var html = [];
                for (let obj in to_array) {
                    html.push( $("<span />").attr({
                        dir: "ltr",
                        email: obj.email,
                        name: obj.name
                    }).addClass("g2").html(obj.name).wrap("<p/>").parent().html());
                }
                this.dom("to_wrapper").html("to " + html.join(", "));
            }


            // loop through any matching to elements & prepare for output
            var out = [];

            this.dom("to").each(function() {
                var el = $(this);
                out.push({
                    email:  el.attr("email"),
                    name: el.attr("name"),
                    el: el
                });
            });
            return out;
        },

        /**
           Retries the DOM elements which represents the emails attachments.
           Returns undefined if UI-elements are not yet ready for parsing.
        */
        attachments: function() {
            var out = [];
            var failed = false;

            this.dom("attachments").each(function() {
                var el = $(this);

                var result = {};
                result.$el = el;
                result.name = el.find(".aV3").html();
                result.size = el.find(".SaH2Ve").html();

                // Gmail only emits the following attribute for Chrome!
                // use email_data.threads[].attachments_details in other browsers!
                var url = el.attr("download_url");
                if (url) {
                    var url_type = api.tools.parse_attachment_url(url);
                    result.url = url_type.url;
                    result.type = url_type.type;
                }

                out.push(result);
            });

            if (failed) {
                return undefined;
            } else {
                return out;
            }
        },

        /**
           Retrieve relevant email from the Gmail servers for this email
           Makes use of the gmail.get.email_data() method
           Returns an object
        */
        data: function() {
            if (typeof api.dom.email_cache !== "object") {
                api.dom.email_cache = {};
            }
            if (!api.dom.email_cache[this.id]) {

                // retrieve & cache the data for this whole thread of emails
                var data = api.get.email_data(this.id);
                for (let [email_id, email_data] of Object.entries(data.threads)) {
                    api.dom.email_cache[email_id] = email_data;
                }
            }
            return api.dom.email_cache[this.id];
        },

        /**
           Retrieve email source for this email from the Gmail servers
           Makes use of the gmail.get.email_source() method
           Returns string of email raw source
        */
        source: function() {
            return api.get.email_source(this.id);
        },

        /**
           Retrieve preconfigured dom elements for this email
        */
        dom: function(lookup) {
            if (!lookup) return this.$el;
            var config = {
                body: "div.a3s",
                from: "span[email].gD",
                to: "span[email].g2",
                to_wrapper: "span.hb",
                timestamp: "span.g3",
                star: "div.zd",
                attachments: "div.hq.gt div.aQH span.aZo",

                // buttons
                reply_button: "div[role=button].aaq, div[role=button].bsQ",
                menu_button: "div[role=button].aap",
                details_button: "div[role=button].ajz"
            };
            if(!config[lookup]) api.tools.error("Dom lookup failed. Unable to find config for \"" + lookup + "\"");
            return this.$el.find(config[lookup]);
        }

    });

    /**
       An object for interacting with an email currently present in the DOM. Represents a conversation thread
       Provides a number of methods and properties to access & interact with it
       Expects a jQuery DOM element for the thread wrapper div (div.if as returned by the "view_thread" observer)
    */
    api.dom.thread = function(element) {
        if (this.constructor !== api.dom.thread) {
            // if not invoked through new(), nothing works as expected!
            return new api.dom.thread(element);
        }

        // this should match the sub_selector
        if (!element || (!element.hasClass("if") && !element.hasClass("iY"))) api.tools.error("api.dom.thread called with invalid element/id");
        this.$el = element;
        return this;
    };

    extend(api.dom.thread.prototype, {

        /**
           Retrieve preconfigured dom elements for this email
        */
        dom: function(lookup) {
            if (!lookup) return this.$el;
            var config = {
                opened_email: "div.adn",
                subject: "h2.hP",
                labels: "div.hN"
            };
            if(!config[lookup]) api.tools.error("Dom lookup failed. Unable to find config for \"" + lookup + "\"");
            return this.$el.find(config[lookup]);
        }

    });

    /**
     *  Show a compose window
     * @returns {boolean}
     */
    api.compose.start_compose = function() {

        //The compose button
        var composeEl = document.getElementsByClassName("T-I T-I-KE L3")[0];
        if(composeEl) {
            composeEl.click();

            return true;
        }
        return false;
    };

    /**
     * Shadow API commands specifically made to interact with old gmail.
     * (And in the future we can either remove "regular"  api.get or replace it with something else)
     */

    api.old = {};
    api.old.get = api.get;


    /**
     * API commands specifically made to interact with new gmail.
     */
    api.new = {};
    api.new.get = {};

    /**
     * Returns the new-style email_id of the latest email visible in the DOM,
     * or for the provided email-node if provided.
     *
     * @param emailElem: Node to extract email-id from. Optional.
     */
    api.new.get.email_id = function(emailElem) {
        // ensure we have an email-element to work with
        if (!emailElem) {
            const emailElems = document.querySelectorAll(".adn[data-message-id]");
            if (!emailElems || emailElems.length === 0) {
                return null;
            }
            emailElem = emailElems[emailElems.length - 1];
        }

        return api.helper.get.new_email_id(emailElem);
    };

    /**
     * Returns the new-style thread_id of the current thread visible in the DOM.
     */
    api.new.get.thread_id = function() {
        const threadElem = document.querySelector("[data-thread-perm-id]");
        if (!threadElem) {
            return null;
        }

        return threadElem.dataset["threadPermId"];
    };

    /**
     * Returns available information about a specific email.
     *
     * @param email_id: new style email id. Legacy IDs not supported. If empty, default to latest in view.
     */
    api.new.get.email_data = function(identifier) {
        identifier = identifier || api.new.get.email_id();
        const email_id = api.helper.get.new_email_id(identifier);

        if (!email_id) {
            return null;
        } else {
            return api.cache.emailIdCache[email_id];
        }
    };

    /**
     * Returns available information about a specific thread.
     *
     * @param thread_id: new style thread id. Legacy IDs not supported. If empty, default to current.
     */
    api.new.get.thread_data = function(identifier) {
        identifier = identifier || api.new.get.thread_id();
        const thread_id = api.helper.get.thread_id(identifier);

        if (!thread_id) {
            return null;
        } else {
            return api.cache.threadCache[thread_id];
        }
    };

    // setup XHR interception as early as possible, to ensure we get all relevant email-data!
    if (typeof(document) !== "undefined") {
        api.tools.xhr_watcher();
    }

    // set up embedded data watcher as early as possible, to ensure we get all relevant email-data!
    // do not wait for document load event, embedded data are loaded before...
    // content-script must be configured with "run_at": "document_start" to be able to watch embedded data
    if (typeof(document) !== "undefined") {
        api.tools.embedded_data_watcher();
    }

    return api;
};

// make class accessible to require()-users.
if (typeof(exports) !== "undefined") {
    exports.Gmail = Gmail;
}

},{}],3:[function(require,module,exports){
/*!
 * jQuery JavaScript Library v4.0.0-beta.2
 * https://jquery.com/
 *
 * Copyright OpenJS Foundation and other contributors
 * Released under the MIT license
 * https://jquery.org/license
 *
 * Date: 2024-07-17T13:32Z
 */
( function( global, factory ) {

	"use strict";

	if ( typeof module === "object" && typeof module.exports === "object" ) {

		// For CommonJS and CommonJS-like environments where a proper `window`
		// is present, execute the factory and get jQuery.
		module.exports = factory( global, true );
	} else {
		factory( global );
	}

// Pass this if window is not defined yet
} )( typeof window !== "undefined" ? window : this, function( window, noGlobal ) {

"use strict";

if ( !window.document ) {
	throw new Error( "jQuery requires a window with a document" );
}

var arr = [];

var getProto = Object.getPrototypeOf;

var slice = arr.slice;

// Support: IE 11+
// IE doesn't have Array#flat; provide a fallback.
var flat = arr.flat ? function( array ) {
	return arr.flat.call( array );
} : function( array ) {
	return arr.concat.apply( [], array );
};

var push = arr.push;

var indexOf = arr.indexOf;

// [[Class]] -> type pairs
var class2type = {};

var toString = class2type.toString;

var hasOwn = class2type.hasOwnProperty;

var fnToString = hasOwn.toString;

var ObjectFunctionString = fnToString.call( Object );

// All support tests are defined in their respective modules.
var support = {};

function toType( obj ) {
	if ( obj == null ) {
		return obj + "";
	}

	return typeof obj === "object" ?
		class2type[ toString.call( obj ) ] || "object" :
		typeof obj;
}

function isWindow( obj ) {
	return obj != null && obj === obj.window;
}

function isArrayLike( obj ) {

	var length = !!obj && obj.length,
		type = toType( obj );

	if ( typeof obj === "function" || isWindow( obj ) ) {
		return false;
	}

	return type === "array" || length === 0 ||
		typeof length === "number" && length > 0 && ( length - 1 ) in obj;
}

var document$1 = window.document;

var preservedScriptAttributes = {
	type: true,
	src: true,
	nonce: true,
	noModule: true
};

function DOMEval( code, node, doc ) {
	doc = doc || document$1;

	var i,
		script = doc.createElement( "script" );

	script.text = code;
	for ( i in preservedScriptAttributes ) {
		if ( node && node[ i ] ) {
			script[ i ] = node[ i ];
		}
	}

	if ( doc.head.appendChild( script ).parentNode ) {
		script.parentNode.removeChild( script );
	}
}

var version = "4.0.0-beta.2",

	rhtmlSuffix = /HTML$/i,

	// Define a local copy of jQuery
	jQuery = function( selector, context ) {

		// The jQuery object is actually just the init constructor 'enhanced'
		// Need init if jQuery is called (just allow error to be thrown if not included)
		return new jQuery.fn.init( selector, context );
	};

jQuery.fn = jQuery.prototype = {

	// The current version of jQuery being used
	jquery: version,

	constructor: jQuery,

	// The default length of a jQuery object is 0
	length: 0,

	toArray: function() {
		return slice.call( this );
	},

	// Get the Nth element in the matched element set OR
	// Get the whole matched element set as a clean array
	get: function( num ) {

		// Return all the elements in a clean array
		if ( num == null ) {
			return slice.call( this );
		}

		// Return just the one element from the set
		return num < 0 ? this[ num + this.length ] : this[ num ];
	},

	// Take an array of elements and push it onto the stack
	// (returning the new matched element set)
	pushStack: function( elems ) {

		// Build a new jQuery matched element set
		var ret = jQuery.merge( this.constructor(), elems );

		// Add the old object onto the stack (as a reference)
		ret.prevObject = this;

		// Return the newly-formed element set
		return ret;
	},

	// Execute a callback for every element in the matched set.
	each: function( callback ) {
		return jQuery.each( this, callback );
	},

	map: function( callback ) {
		return this.pushStack( jQuery.map( this, function( elem, i ) {
			return callback.call( elem, i, elem );
		} ) );
	},

	slice: function() {
		return this.pushStack( slice.apply( this, arguments ) );
	},

	first: function() {
		return this.eq( 0 );
	},

	last: function() {
		return this.eq( -1 );
	},

	even: function() {
		return this.pushStack( jQuery.grep( this, function( _elem, i ) {
			return ( i + 1 ) % 2;
		} ) );
	},

	odd: function() {
		return this.pushStack( jQuery.grep( this, function( _elem, i ) {
			return i % 2;
		} ) );
	},

	eq: function( i ) {
		var len = this.length,
			j = +i + ( i < 0 ? len : 0 );
		return this.pushStack( j >= 0 && j < len ? [ this[ j ] ] : [] );
	},

	end: function() {
		return this.prevObject || this.constructor();
	}
};

jQuery.extend = jQuery.fn.extend = function() {
	var options, name, src, copy, copyIsArray, clone,
		target = arguments[ 0 ] || {},
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if ( typeof target === "boolean" ) {
		deep = target;

		// Skip the boolean and the target
		target = arguments[ i ] || {};
		i++;
	}

	// Handle case when target is a string or something (possible in deep copy)
	if ( typeof target !== "object" && typeof target !== "function" ) {
		target = {};
	}

	// Extend jQuery itself if only one argument is passed
	if ( i === length ) {
		target = this;
		i--;
	}

	for ( ; i < length; i++ ) {

		// Only deal with non-null/undefined values
		if ( ( options = arguments[ i ] ) != null ) {

			// Extend the base object
			for ( name in options ) {
				copy = options[ name ];

				// Prevent Object.prototype pollution
				// Prevent never-ending loop
				if ( name === "__proto__" || target === copy ) {
					continue;
				}

				// Recurse if we're merging plain objects or arrays
				if ( deep && copy && ( jQuery.isPlainObject( copy ) ||
					( copyIsArray = Array.isArray( copy ) ) ) ) {
					src = target[ name ];

					// Ensure proper type for the source value
					if ( copyIsArray && !Array.isArray( src ) ) {
						clone = [];
					} else if ( !copyIsArray && !jQuery.isPlainObject( src ) ) {
						clone = {};
					} else {
						clone = src;
					}
					copyIsArray = false;

					// Never move original objects, clone them
					target[ name ] = jQuery.extend( deep, clone, copy );

				// Don't bring in undefined values
				} else if ( copy !== undefined ) {
					target[ name ] = copy;
				}
			}
		}
	}

	// Return the modified object
	return target;
};

jQuery.extend( {

	// Unique for each copy of jQuery on the page
	expando: "jQuery" + ( version + Math.random() ).replace( /\D/g, "" ),

	// Assume jQuery is ready without the ready module
	isReady: true,

	error: function( msg ) {
		throw new Error( msg );
	},

	noop: function() {},

	isPlainObject: function( obj ) {
		var proto, Ctor;

		// Detect obvious negatives
		// Use toString instead of jQuery.type to catch host objects
		if ( !obj || toString.call( obj ) !== "[object Object]" ) {
			return false;
		}

		proto = getProto( obj );

		// Objects with no prototype (e.g., `Object.create( null )`) are plain
		if ( !proto ) {
			return true;
		}

		// Objects with prototype are plain iff they were constructed by a global Object function
		Ctor = hasOwn.call( proto, "constructor" ) && proto.constructor;
		return typeof Ctor === "function" && fnToString.call( Ctor ) === ObjectFunctionString;
	},

	isEmptyObject: function( obj ) {
		var name;

		for ( name in obj ) {
			return false;
		}
		return true;
	},

	// Evaluates a script in a provided context; falls back to the global one
	// if not specified.
	globalEval: function( code, options, doc ) {
		DOMEval( code, { nonce: options && options.nonce }, doc );
	},

	each: function( obj, callback ) {
		var length, i = 0;

		if ( isArrayLike( obj ) ) {
			length = obj.length;
			for ( ; i < length; i++ ) {
				if ( callback.call( obj[ i ], i, obj[ i ] ) === false ) {
					break;
				}
			}
		} else {
			for ( i in obj ) {
				if ( callback.call( obj[ i ], i, obj[ i ] ) === false ) {
					break;
				}
			}
		}

		return obj;
	},


	// Retrieve the text value of an array of DOM nodes
	text: function( elem ) {
		var node,
			ret = "",
			i = 0,
			nodeType = elem.nodeType;

		if ( !nodeType ) {

			// If no nodeType, this is expected to be an array
			while ( ( node = elem[ i++ ] ) ) {

				// Do not traverse comment nodes
				ret += jQuery.text( node );
			}
		}
		if ( nodeType === 1 || nodeType === 11 ) {
			return elem.textContent;
		}
		if ( nodeType === 9 ) {
			return elem.documentElement.textContent;
		}
		if ( nodeType === 3 || nodeType === 4 ) {
			return elem.nodeValue;
		}

		// Do not include comment or processing instruction nodes

		return ret;
	},


	// results is for internal usage only
	makeArray: function( arr, results ) {
		var ret = results || [];

		if ( arr != null ) {
			if ( isArrayLike( Object( arr ) ) ) {
				jQuery.merge( ret,
					typeof arr === "string" ?
						[ arr ] : arr
				);
			} else {
				push.call( ret, arr );
			}
		}

		return ret;
	},

	inArray: function( elem, arr, i ) {
		return arr == null ? -1 : indexOf.call( arr, elem, i );
	},

	isXMLDoc: function( elem ) {
		var namespace = elem && elem.namespaceURI,
			docElem = elem && ( elem.ownerDocument || elem ).documentElement;

		// Assume HTML when documentElement doesn't yet exist, such as inside
		// document fragments.
		return !rhtmlSuffix.test( namespace || docElem && docElem.nodeName || "HTML" );
	},

	// Note: an element does not contain itself
	contains: function( a, b ) {
		var bup = b && b.parentNode;

		return a === bup || !!( bup && bup.nodeType === 1 && (

			// Support: IE 9 - 11+
			// IE doesn't have `contains` on SVG.
			a.contains ?
				a.contains( bup ) :
				a.compareDocumentPosition && a.compareDocumentPosition( bup ) & 16
		) );
	},

	merge: function( first, second ) {
		var len = +second.length,
			j = 0,
			i = first.length;

		for ( ; j < len; j++ ) {
			first[ i++ ] = second[ j ];
		}

		first.length = i;

		return first;
	},

	grep: function( elems, callback, invert ) {
		var callbackInverse,
			matches = [],
			i = 0,
			length = elems.length,
			callbackExpect = !invert;

		// Go through the array, only saving the items
		// that pass the validator function
		for ( ; i < length; i++ ) {
			callbackInverse = !callback( elems[ i ], i );
			if ( callbackInverse !== callbackExpect ) {
				matches.push( elems[ i ] );
			}
		}

		return matches;
	},

	// arg is for internal usage only
	map: function( elems, callback, arg ) {
		var length, value,
			i = 0,
			ret = [];

		// Go through the array, translating each of the items to their new values
		if ( isArrayLike( elems ) ) {
			length = elems.length;
			for ( ; i < length; i++ ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}

		// Go through every key on the object,
		} else {
			for ( i in elems ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}
		}

		// Flatten any nested arrays
		return flat( ret );
	},

	// A global GUID counter for objects
	guid: 1,

	// jQuery.support is not used in Core but other projects attach their
	// properties to it so it needs to exist.
	support: support
} );

if ( typeof Symbol === "function" ) {
	jQuery.fn[ Symbol.iterator ] = arr[ Symbol.iterator ];
}

// Populate the class2type map
jQuery.each( "Boolean Number String Function Array Date RegExp Object Error Symbol".split( " " ),
	function( _i, name ) {
		class2type[ "[object " + name + "]" ] = name.toLowerCase();
	} );

function nodeName( elem, name ) {
	return elem.nodeName && elem.nodeName.toLowerCase() === name.toLowerCase();
}

var pop = arr.pop;

// https://www.w3.org/TR/css3-selectors/#whitespace
var whitespace = "[\\x20\\t\\r\\n\\f]";

var isIE = document$1.documentMode;

// Support: Chrome 105 - 111 only, Safari 15.4 - 16.3 only
// Make sure the `:has()` argument is parsed unforgivingly.
// We include `*` in the test to detect buggy implementations that are
// _selectively_ forgiving (specifically when the list includes at least
// one valid selector).
// Note that we treat complete lack of support for `:has()` as if it were
// spec-compliant support, which is fine because use of `:has()` in such
// environments will fail in the qSA path and fall back to jQuery traversal
// anyway.
try {
	document$1.querySelector( ":has(*,:jqfake)" );
	support.cssHas = false;
} catch ( e ) {
	support.cssHas = true;
}

// Build QSA regex.
// Regex strategy adopted from Diego Perini.
var rbuggyQSA = [];

if ( isIE ) {
	rbuggyQSA.push(

		// Support: IE 9 - 11+
		// IE's :disabled selector does not pick up the children of disabled fieldsets
		":enabled",
		":disabled",

		// Support: IE 11+
		// IE 11 doesn't find elements on a `[name='']` query in some cases.
		// Adding a temporary attribute to the document before the selection works
		// around the issue.
		"\\[" + whitespace + "*name" + whitespace + "*=" +
			whitespace + "*(?:''|\"\")"
	);
}

if ( !support.cssHas ) {

	// Support: Chrome 105 - 110+, Safari 15.4 - 16.3+
	// Our regular `try-catch` mechanism fails to detect natively-unsupported
	// pseudo-classes inside `:has()` (such as `:has(:contains("Foo"))`)
	// in browsers that parse the `:has()` argument as a forgiving selector list.
	// https://drafts.csswg.org/selectors/#relational now requires the argument
	// to be parsed unforgivingly, but browsers have not yet fully adjusted.
	rbuggyQSA.push( ":has" );
}

rbuggyQSA = rbuggyQSA.length && new RegExp( rbuggyQSA.join( "|" ) );

var rtrimCSS = new RegExp(
	"^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$",
	"g"
);

// https://www.w3.org/TR/css-syntax-3/#ident-token-diagram
var identifier = "(?:\\\\[\\da-fA-F]{1,6}" + whitespace +
	"?|\\\\[^\\r\\n\\f]|[\\w-]|[^\0-\\x7f])+";

var rleadingCombinator = new RegExp( "^" + whitespace + "*([>+~]|" +
	whitespace + ")" + whitespace + "*" );

var rdescend = new RegExp( whitespace + "|>" );

var rsibling = /[+~]/;

var documentElement$1 = document$1.documentElement;

// Support: IE 9 - 11+
// IE requires a prefix.
var matches = documentElement$1.matches || documentElement$1.msMatchesSelector;

/**
 * Create key-value caches of limited size
 * @returns {function(string, object)} Returns the Object data after storing it on itself with
 *	property name the (space-suffixed) string and (if the cache is larger than Expr.cacheLength)
 *	deleting the oldest entry
 */
function createCache() {
	var keys = [];

	function cache( key, value ) {

		// Use (key + " ") to avoid collision with native prototype properties
		// (see https://github.com/jquery/sizzle/issues/157)
		if ( keys.push( key + " " ) > jQuery.expr.cacheLength ) {

			// Only keep the most recent entries
			delete cache[ keys.shift() ];
		}
		return ( cache[ key + " " ] = value );
	}
	return cache;
}

/**
 * Checks a node for validity as a jQuery selector context
 * @param {Element|Object=} context
 * @returns {Element|Object|Boolean} The input node if acceptable, otherwise a falsy value
 */
function testContext( context ) {
	return context && typeof context.getElementsByTagName !== "undefined" && context;
}

// Attribute selectors: https://www.w3.org/TR/selectors/#attribute-selectors
var attributes = "\\[" + whitespace + "*(" + identifier + ")(?:" + whitespace +

	// Operator (capture 2)
	"*([*^$|!~]?=)" + whitespace +

	// "Attribute values must be CSS identifiers [capture 5] or strings [capture 3 or capture 4]"
	"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|(" + identifier + "))|)" +
	whitespace + "*\\]";

var pseudos = ":(" + identifier + ")(?:\\((" +

	// To reduce the number of selectors needing tokenize in the preFilter, prefer arguments:
	// 1. quoted (capture 3; capture 4 or capture 5)
	"('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|" +

	// 2. simple (capture 6)
	"((?:\\\\.|[^\\\\()[\\]]|" + attributes + ")*)|" +

	// 3. anything else (capture 2)
	".*" +
	")\\)|)";

var filterMatchExpr = {
	ID: new RegExp( "^#(" + identifier + ")" ),
	CLASS: new RegExp( "^\\.(" + identifier + ")" ),
	TAG: new RegExp( "^(" + identifier + "|[*])" ),
	ATTR: new RegExp( "^" + attributes ),
	PSEUDO: new RegExp( "^" + pseudos ),
	CHILD: new RegExp(
		"^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" +
		whitespace + "*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" +
		whitespace + "*(\\d+)|))" + whitespace + "*\\)|)", "i" )
};

var rpseudo = new RegExp( pseudos );

// CSS escapes
// https://www.w3.org/TR/CSS21/syndata.html#escaped-characters

var runescape = new RegExp( "\\\\[\\da-fA-F]{1,6}" + whitespace +
	"?|\\\\([^\\r\\n\\f])", "g" ),
	funescape = function( escape, nonHex ) {
		var high = "0x" + escape.slice( 1 ) - 0x10000;

		if ( nonHex ) {

			// Strip the backslash prefix from a non-hex escape sequence
			return nonHex;
		}

		// Replace a hexadecimal escape sequence with the encoded Unicode code point
		// Support: IE <=11+
		// For values outside the Basic Multilingual Plane (BMP), manually construct a
		// surrogate pair
		return high < 0 ?
			String.fromCharCode( high + 0x10000 ) :
			String.fromCharCode( high >> 10 | 0xD800, high & 0x3FF | 0xDC00 );
	};

function unescapeSelector( sel ) {
	return sel.replace( runescape, funescape );
}

function selectorError( msg ) {
	jQuery.error( "Syntax error, unrecognized expression: " + msg );
}

var rcomma = new RegExp( "^" + whitespace + "*," + whitespace + "*" );

var tokenCache = createCache();

function tokenize( selector, parseOnly ) {
	var matched, match, tokens, type,
		soFar, groups, preFilters,
		cached = tokenCache[ selector + " " ];

	if ( cached ) {
		return parseOnly ? 0 : cached.slice( 0 );
	}

	soFar = selector;
	groups = [];
	preFilters = jQuery.expr.preFilter;

	while ( soFar ) {

		// Comma and first run
		if ( !matched || ( match = rcomma.exec( soFar ) ) ) {
			if ( match ) {

				// Don't consume trailing commas as valid
				soFar = soFar.slice( match[ 0 ].length ) || soFar;
			}
			groups.push( ( tokens = [] ) );
		}

		matched = false;

		// Combinators
		if ( ( match = rleadingCombinator.exec( soFar ) ) ) {
			matched = match.shift();
			tokens.push( {
				value: matched,

				// Cast descendant combinators to space
				type: match[ 0 ].replace( rtrimCSS, " " )
			} );
			soFar = soFar.slice( matched.length );
		}

		// Filters
		for ( type in filterMatchExpr ) {
			if ( ( match = jQuery.expr.match[ type ].exec( soFar ) ) && ( !preFilters[ type ] ||
				( match = preFilters[ type ]( match ) ) ) ) {
				matched = match.shift();
				tokens.push( {
					value: matched,
					type: type,
					matches: match
				} );
				soFar = soFar.slice( matched.length );
			}
		}

		if ( !matched ) {
			break;
		}
	}

	// Return the length of the invalid excess
	// if we're just parsing
	// Otherwise, throw an error or return tokens
	if ( parseOnly ) {
		return soFar.length;
	}

	return soFar ?
		selectorError( selector ) :

		// Cache the tokens
		tokenCache( selector, groups ).slice( 0 );
}

var preFilter = {
	ATTR: function( match ) {
		match[ 1 ] = unescapeSelector( match[ 1 ] );

		// Move the given value to match[3] whether quoted or unquoted
		match[ 3 ] = unescapeSelector( match[ 3 ] || match[ 4 ] || match[ 5 ] || "" );

		if ( match[ 2 ] === "~=" ) {
			match[ 3 ] = " " + match[ 3 ] + " ";
		}

		return match.slice( 0, 4 );
	},

	CHILD: function( match ) {

		/* matches from filterMatchExpr["CHILD"]
			1 type (only|nth|...)
			2 what (child|of-type)
			3 argument (even|odd|\d*|\d*n([+-]\d+)?|...)
			4 xn-component of xn+y argument ([+-]?\d*n|)
			5 sign of xn-component
			6 x of xn-component
			7 sign of y-component
			8 y of y-component
		*/
		match[ 1 ] = match[ 1 ].toLowerCase();

		if ( match[ 1 ].slice( 0, 3 ) === "nth" ) {

			// nth-* requires argument
			if ( !match[ 3 ] ) {
				selectorError( match[ 0 ] );
			}

			// numeric x and y parameters for jQuery.expr.filter.CHILD
			// remember that false/true cast respectively to 0/1
			match[ 4 ] = +( match[ 4 ] ?
				match[ 5 ] + ( match[ 6 ] || 1 ) :
				2 * ( match[ 3 ] === "even" || match[ 3 ] === "odd" )
			);
			match[ 5 ] = +( ( match[ 7 ] + match[ 8 ] ) || match[ 3 ] === "odd" );

		// other types prohibit arguments
		} else if ( match[ 3 ] ) {
			selectorError( match[ 0 ] );
		}

		return match;
	},

	PSEUDO: function( match ) {
		var excess,
			unquoted = !match[ 6 ] && match[ 2 ];

		if ( filterMatchExpr.CHILD.test( match[ 0 ] ) ) {
			return null;
		}

		// Accept quoted arguments as-is
		if ( match[ 3 ] ) {
			match[ 2 ] = match[ 4 ] || match[ 5 ] || "";

		// Strip excess characters from unquoted arguments
		} else if ( unquoted && rpseudo.test( unquoted ) &&

			// Get excess from tokenize (recursively)
			( excess = tokenize( unquoted, true ) ) &&

			// advance to the next closing parenthesis
			( excess = unquoted.indexOf( ")", unquoted.length - excess ) -
				unquoted.length ) ) {

			// excess is a negative index
			match[ 0 ] = match[ 0 ].slice( 0, excess );
			match[ 2 ] = unquoted.slice( 0, excess );
		}

		// Return only captures needed by the pseudo filter method (type and argument)
		return match.slice( 0, 3 );
	}
};

function toSelector( tokens ) {
	var i = 0,
		len = tokens.length,
		selector = "";
	for ( ; i < len; i++ ) {
		selector += tokens[ i ].value;
	}
	return selector;
}

// Multifunctional method to get and set values of a collection
// The value/s can optionally be executed if it's a function
function access( elems, fn, key, value, chainable, emptyGet, raw ) {
	var i = 0,
		len = elems.length,
		bulk = key == null;

	// Sets many values
	if ( toType( key ) === "object" ) {
		chainable = true;
		for ( i in key ) {
			access( elems, fn, i, key[ i ], true, emptyGet, raw );
		}

	// Sets one value
	} else if ( value !== undefined ) {
		chainable = true;

		if ( typeof value !== "function" ) {
			raw = true;
		}

		if ( bulk ) {

			// Bulk operations run against the entire set
			if ( raw ) {
				fn.call( elems, value );
				fn = null;

			// ...except when executing function values
			} else {
				bulk = fn;
				fn = function( elem, _key, value ) {
					return bulk.call( jQuery( elem ), value );
				};
			}
		}

		if ( fn ) {
			for ( ; i < len; i++ ) {
				fn(
					elems[ i ], key, raw ?
						value :
						value.call( elems[ i ], i, fn( elems[ i ], key ) )
				);
			}
		}
	}

	if ( chainable ) {
		return elems;
	}

	// Gets
	if ( bulk ) {
		return fn.call( elems );
	}

	return len ? fn( elems[ 0 ], key ) : emptyGet;
}

// Only count HTML whitespace
// Other whitespace should count in values
// https://infra.spec.whatwg.org/#ascii-whitespace
var rnothtmlwhite = /[^\x20\t\r\n\f]+/g;

jQuery.fn.extend( {
	attr: function( name, value ) {
		return access( this, jQuery.attr, name, value, arguments.length > 1 );
	},

	removeAttr: function( name ) {
		return this.each( function() {
			jQuery.removeAttr( this, name );
		} );
	}
} );

jQuery.extend( {
	attr: function( elem, name, value ) {
		var ret, hooks,
			nType = elem.nodeType;

		// Don't get/set attributes on text, comment and attribute nodes
		if ( nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		// Fallback to prop when attributes are not supported
		if ( typeof elem.getAttribute === "undefined" ) {
			return jQuery.prop( elem, name, value );
		}

		// Attribute hooks are determined by the lowercase version
		// Grab necessary hook if one is defined
		if ( nType !== 1 || !jQuery.isXMLDoc( elem ) ) {
			hooks = jQuery.attrHooks[ name.toLowerCase() ];
		}

		if ( value !== undefined ) {
			if ( value === null ||

				// For compat with previous handling of boolean attributes,
				// remove when `false` passed. For ARIA attributes -
				// many of which recognize a `"false"` value - continue to
				// set the `"false"` value as jQuery <4 did.
				( value === false && name.toLowerCase().indexOf( "aria-" ) !== 0 ) ) {

				jQuery.removeAttr( elem, name );
				return;
			}

			if ( hooks && "set" in hooks &&
				( ret = hooks.set( elem, value, name ) ) !== undefined ) {
				return ret;
			}

			elem.setAttribute( name, value );
			return value;
		}

		if ( hooks && "get" in hooks && ( ret = hooks.get( elem, name ) ) !== null ) {
			return ret;
		}

		ret = elem.getAttribute( name );

		// Non-existent attributes return null, we normalize to undefined
		return ret == null ? undefined : ret;
	},

	attrHooks: {},

	removeAttr: function( elem, value ) {
		var name,
			i = 0,

			// Attribute names can contain non-HTML whitespace characters
			// https://html.spec.whatwg.org/multipage/syntax.html#attributes-2
			attrNames = value && value.match( rnothtmlwhite );

		if ( attrNames && elem.nodeType === 1 ) {
			while ( ( name = attrNames[ i++ ] ) ) {
				elem.removeAttribute( name );
			}
		}
	}
} );

// Support: IE <=11+
// An input loses its value after becoming a radio
if ( isIE ) {
	jQuery.attrHooks.type = {
		set: function( elem, value ) {
			if ( value === "radio" && nodeName( elem, "input" ) ) {
				var val = elem.value;
				elem.setAttribute( "type", value );
				if ( val ) {
					elem.value = val;
				}
				return value;
			}
		}
	};
}

// CSS string/identifier serialization
// https://drafts.csswg.org/cssom/#common-serializing-idioms
var rcssescape = /([\0-\x1f\x7f]|^-?\d)|^-$|[^\x80-\uFFFF\w-]/g;

function fcssescape( ch, asCodePoint ) {
	if ( asCodePoint ) {

		// U+0000 NULL becomes U+FFFD REPLACEMENT CHARACTER
		if ( ch === "\0" ) {
			return "\uFFFD";
		}

		// Control characters and (dependent upon position) numbers get escaped as code points
		return ch.slice( 0, -1 ) + "\\" + ch.charCodeAt( ch.length - 1 ).toString( 16 ) + " ";
	}

	// Other potentially-special ASCII characters get backslash-escaped
	return "\\" + ch;
}

jQuery.escapeSelector = function( sel ) {
	return ( sel + "" ).replace( rcssescape, fcssescape );
};

var sort = arr.sort;

var splice = arr.splice;

var hasDuplicate;

// Document order sorting
function sortOrder( a, b ) {

	// Flag for duplicate removal
	if ( a === b ) {
		hasDuplicate = true;
		return 0;
	}

	// Sort on method existence if only one input has compareDocumentPosition
	var compare = !a.compareDocumentPosition - !b.compareDocumentPosition;
	if ( compare ) {
		return compare;
	}

	// Calculate position if both inputs belong to the same document
	// Support: IE 11+
	// IE sometimes throws a "Permission denied" error when strict-comparing
	// two documents; shallow comparisons work.
	// eslint-disable-next-line eqeqeq
	compare = ( a.ownerDocument || a ) == ( b.ownerDocument || b ) ?
		a.compareDocumentPosition( b ) :

		// Otherwise we know they are disconnected
		1;

	// Disconnected nodes
	if ( compare & 1 ) {

		// Choose the first element that is related to the document
		// Support: IE 11+
		// IE sometimes throws a "Permission denied" error when strict-comparing
		// two documents; shallow comparisons work.
		// eslint-disable-next-line eqeqeq
		if ( a == document$1 || a.ownerDocument == document$1 &&
			jQuery.contains( document$1, a ) ) {
			return -1;
		}

		// Support: IE 11+
		// IE sometimes throws a "Permission denied" error when strict-comparing
		// two documents; shallow comparisons work.
		// eslint-disable-next-line eqeqeq
		if ( b == document$1 || b.ownerDocument == document$1 &&
			jQuery.contains( document$1, b ) ) {
			return 1;
		}

		// Maintain original order
		return 0;
	}

	return compare & 4 ? -1 : 1;
}

/**
 * Document sorting and removing duplicates
 * @param {ArrayLike} results
 */
jQuery.uniqueSort = function( results ) {
	var elem,
		duplicates = [],
		j = 0,
		i = 0;

	hasDuplicate = false;

	sort.call( results, sortOrder );

	if ( hasDuplicate ) {
		while ( ( elem = results[ i++ ] ) ) {
			if ( elem === results[ i ] ) {
				j = duplicates.push( i );
			}
		}
		while ( j-- ) {
			splice.call( results, duplicates[ j ], 1 );
		}
	}

	return results;
};

jQuery.fn.uniqueSort = function() {
	return this.pushStack( jQuery.uniqueSort( slice.apply( this ) ) );
};

var i,
	outermostContext,

	// Local document vars
	document,
	documentElement,
	documentIsHTML,

	// Instance-specific data
	dirruns = 0,
	done = 0,
	classCache = createCache(),
	compilerCache = createCache(),
	nonnativeSelectorCache = createCache(),

	// Regular expressions

	// Leading and non-escaped trailing whitespace, capturing some non-whitespace characters preceding the latter
	rwhitespace = new RegExp( whitespace + "+", "g" ),

	ridentifier = new RegExp( "^" + identifier + "$" ),

	matchExpr = jQuery.extend( {

		// For use in libraries implementing .is()
		// We use this for POS matching in `select`
		needsContext: new RegExp( "^" + whitespace +
			"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" + whitespace +
			"*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)", "i" )
	}, filterMatchExpr ),

	rinputs = /^(?:input|select|textarea|button)$/i,
	rheader = /^h\d$/i,

	// Easily-parseable/retrievable ID or TAG or CLASS selectors
	rquickExpr$1 = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,

	// Used for iframes; see `setDocument`.
	// Support: IE 9 - 11+
	// Removing the function wrapper causes a "Permission Denied"
	// error in IE.
	unloadHandler = function() {
		setDocument();
	},

	inDisabledFieldset = addCombinator(
		function( elem ) {
			return elem.disabled === true && nodeName( elem, "fieldset" );
		},
		{ dir: "parentNode", next: "legend" }
	);

function find( selector, context, results, seed ) {
	var m, i, elem, nid, match, groups, newSelector,
		newContext = context && context.ownerDocument,

		// nodeType defaults to 9, since context defaults to document
		nodeType = context ? context.nodeType : 9;

	results = results || [];

	// Return early from calls with invalid selector or context
	if ( typeof selector !== "string" || !selector ||
		nodeType !== 1 && nodeType !== 9 && nodeType !== 11 ) {

		return results;
	}

	// Try to shortcut find operations (as opposed to filters) in HTML documents
	if ( !seed ) {
		setDocument( context );
		context = context || document;

		if ( documentIsHTML ) {

			// If the selector is sufficiently simple, try using a "get*By*" DOM method
			// (excepting DocumentFragment context, where the methods don't exist)
			if ( nodeType !== 11 && ( match = rquickExpr$1.exec( selector ) ) ) {

				// ID selector
				if ( ( m = match[ 1 ] ) ) {

					// Document context
					if ( nodeType === 9 ) {
						if ( ( elem = context.getElementById( m ) ) ) {
							push.call( results, elem );
						}
						return results;

					// Element context
					} else {
						if ( newContext && ( elem = newContext.getElementById( m ) ) &&
							jQuery.contains( context, elem ) ) {

							push.call( results, elem );
							return results;
						}
					}

				// Type selector
				} else if ( match[ 2 ] ) {
					push.apply( results, context.getElementsByTagName( selector ) );
					return results;

				// Class selector
				} else if ( ( m = match[ 3 ] ) && context.getElementsByClassName ) {
					push.apply( results, context.getElementsByClassName( m ) );
					return results;
				}
			}

			// Take advantage of querySelectorAll
			if ( !nonnativeSelectorCache[ selector + " " ] &&
				( !rbuggyQSA || !rbuggyQSA.test( selector ) ) ) {

				newSelector = selector;
				newContext = context;

				// qSA considers elements outside a scoping root when evaluating child or
				// descendant combinators, which is not what we want.
				// In such cases, we work around the behavior by prefixing every selector in the
				// list with an ID selector referencing the scope context.
				// The technique has to be used as well when a leading combinator is used
				// as such selectors are not recognized by querySelectorAll.
				// Thanks to Andrew Dupont for this technique.
				if ( nodeType === 1 &&
					( rdescend.test( selector ) || rleadingCombinator.test( selector ) ) ) {

					// Expand context for sibling selectors
					newContext = rsibling.test( selector ) &&
						testContext( context.parentNode ) ||
						context;

					// Outside of IE, if we're not changing the context we can
					// use :scope instead of an ID.
					// Support: IE 11+
					// IE sometimes throws a "Permission denied" error when strict-comparing
					// two documents; shallow comparisons work.
					// eslint-disable-next-line eqeqeq
					if ( newContext != context || isIE ) {

						// Capture the context ID, setting it first if necessary
						if ( ( nid = context.getAttribute( "id" ) ) ) {
							nid = jQuery.escapeSelector( nid );
						} else {
							context.setAttribute( "id", ( nid = jQuery.expando ) );
						}
					}

					// Prefix every selector in the list
					groups = tokenize( selector );
					i = groups.length;
					while ( i-- ) {
						groups[ i ] = ( nid ? "#" + nid : ":scope" ) + " " +
							toSelector( groups[ i ] );
					}
					newSelector = groups.join( "," );
				}

				try {
					push.apply( results,
						newContext.querySelectorAll( newSelector )
					);
					return results;
				} catch ( qsaError ) {
					nonnativeSelectorCache( selector, true );
				} finally {
					if ( nid === jQuery.expando ) {
						context.removeAttribute( "id" );
					}
				}
			}
		}
	}

	// All others
	return select( selector.replace( rtrimCSS, "$1" ), context, results, seed );
}

/**
 * Mark a function for special use by jQuery selector module
 * @param {Function} fn The function to mark
 */
function markFunction( fn ) {
	fn[ jQuery.expando ] = true;
	return fn;
}

/**
 * Returns a function to use in pseudos for input types
 * @param {String} type
 */
function createInputPseudo( type ) {
	return function( elem ) {
		return nodeName( elem, "input" ) && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for buttons
 * @param {String} type
 */
function createButtonPseudo( type ) {
	return function( elem ) {
		return ( nodeName( elem, "input" ) || nodeName( elem, "button" ) ) &&
			elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for :enabled/:disabled
 * @param {Boolean} disabled true for :disabled; false for :enabled
 */
function createDisabledPseudo( disabled ) {

	// Known :disabled false positives: fieldset[disabled] > legend:nth-of-type(n+2) :can-disable
	return function( elem ) {

		// Only certain elements can match :enabled or :disabled
		// https://html.spec.whatwg.org/multipage/scripting.html#selector-enabled
		// https://html.spec.whatwg.org/multipage/scripting.html#selector-disabled
		if ( "form" in elem ) {

			// Check for inherited disabledness on relevant non-disabled elements:
			// * listed form-associated elements in a disabled fieldset
			//   https://html.spec.whatwg.org/multipage/forms.html#category-listed
			//   https://html.spec.whatwg.org/multipage/forms.html#concept-fe-disabled
			// * option elements in a disabled optgroup
			//   https://html.spec.whatwg.org/multipage/forms.html#concept-option-disabled
			// All such elements have a "form" property.
			if ( elem.parentNode && elem.disabled === false ) {

				// Option elements defer to a parent optgroup if present
				if ( "label" in elem ) {
					if ( "label" in elem.parentNode ) {
						return elem.parentNode.disabled === disabled;
					} else {
						return elem.disabled === disabled;
					}
				}

				// Support: IE 6 - 11+
				// Use the isDisabled shortcut property to check for disabled fieldset ancestors
				return elem.isDisabled === disabled ||

					// Where there is no isDisabled, check manually
					elem.isDisabled !== !disabled &&
						inDisabledFieldset( elem ) === disabled;
			}

			return elem.disabled === disabled;

		// Try to winnow out elements that can't be disabled before trusting the disabled property.
		// Some victims get caught in our net (label, legend, menu, track), but it shouldn't
		// even exist on them, let alone have a boolean value.
		} else if ( "label" in elem ) {
			return elem.disabled === disabled;
		}

		// Remaining elements are neither :enabled nor :disabled
		return false;
	};
}

/**
 * Returns a function to use in pseudos for positionals
 * @param {Function} fn
 */
function createPositionalPseudo( fn ) {
	return markFunction( function( argument ) {
		argument = +argument;
		return markFunction( function( seed, matches ) {
			var j,
				matchIndexes = fn( [], seed.length, argument ),
				i = matchIndexes.length;

			// Match elements found at the specified indexes
			while ( i-- ) {
				if ( seed[ ( j = matchIndexes[ i ] ) ] ) {
					seed[ j ] = !( matches[ j ] = seed[ j ] );
				}
			}
		} );
	} );
}

/**
 * Sets document-related variables once based on the current document
 * @param {Element|Object} [node] An element or document object to use to set the document
 */
function setDocument( node ) {
	var subWindow,
		doc = node ? node.ownerDocument || node : document$1;

	// Return early if doc is invalid or already selected
	// Support: IE 11+
	// IE sometimes throws a "Permission denied" error when strict-comparing
	// two documents; shallow comparisons work.
	// eslint-disable-next-line eqeqeq
	if ( doc == document || doc.nodeType !== 9 ) {
		return;
	}

	// Update global variables
	document = doc;
	documentElement = document.documentElement;
	documentIsHTML = !jQuery.isXMLDoc( document );

	// Support: IE 9 - 11+
	// Accessing iframe documents after unload throws "permission denied" errors (see trac-13936)
	// Support: IE 11+
	// IE sometimes throws a "Permission denied" error when strict-comparing
	// two documents; shallow comparisons work.
	// eslint-disable-next-line eqeqeq
	if ( isIE && document$1 != document &&
		( subWindow = document.defaultView ) && subWindow.top !== subWindow ) {
		subWindow.addEventListener( "unload", unloadHandler );
	}
}

find.matches = function( expr, elements ) {
	return find( expr, null, null, elements );
};

find.matchesSelector = function( elem, expr ) {
	setDocument( elem );

	if ( documentIsHTML &&
		!nonnativeSelectorCache[ expr + " " ] &&
		( !rbuggyQSA || !rbuggyQSA.test( expr ) ) ) {

		try {
			return matches.call( elem, expr );
		} catch ( e ) {
			nonnativeSelectorCache( expr, true );
		}
	}

	return find( expr, document, null, [ elem ] ).length > 0;
};

jQuery.expr = {

	// Can be adjusted by the user
	cacheLength: 50,

	createPseudo: markFunction,

	match: matchExpr,

	find: {
		ID: function( id, context ) {
			if ( typeof context.getElementById !== "undefined" && documentIsHTML ) {
				var elem = context.getElementById( id );
				return elem ? [ elem ] : [];
			}
		},

		TAG: function( tag, context ) {
			if ( typeof context.getElementsByTagName !== "undefined" ) {
				return context.getElementsByTagName( tag );

				// DocumentFragment nodes don't have gEBTN
			} else {
				return context.querySelectorAll( tag );
			}
		},

		CLASS: function( className, context ) {
			if ( typeof context.getElementsByClassName !== "undefined" && documentIsHTML ) {
				return context.getElementsByClassName( className );
			}
		}
	},

	relative: {
		">": { dir: "parentNode", first: true },
		" ": { dir: "parentNode" },
		"+": { dir: "previousSibling", first: true },
		"~": { dir: "previousSibling" }
	},

	preFilter: preFilter,

	filter: {
		ID: function( id ) {
			var attrId = unescapeSelector( id );
			return function( elem ) {
				return elem.getAttribute( "id" ) === attrId;
			};
		},

		TAG: function( nodeNameSelector ) {
			var expectedNodeName = unescapeSelector( nodeNameSelector ).toLowerCase();
			return nodeNameSelector === "*" ?

				function() {
					return true;
				} :

				function( elem ) {
					return nodeName( elem, expectedNodeName );
				};
		},

		CLASS: function( className ) {
			var pattern = classCache[ className + " " ];

			return pattern ||
				( pattern = new RegExp( "(^|" + whitespace + ")" + className +
					"(" + whitespace + "|$)" ) ) &&
				classCache( className, function( elem ) {
					return pattern.test(
						typeof elem.className === "string" && elem.className ||
							typeof elem.getAttribute !== "undefined" &&
								elem.getAttribute( "class" ) ||
							""
					);
				} );
		},

		ATTR: function( name, operator, check ) {
			return function( elem ) {
				var result = jQuery.attr( elem, name );

				if ( result == null ) {
					return operator === "!=";
				}
				if ( !operator ) {
					return true;
				}

				result += "";

				if ( operator === "=" ) {
					return result === check;
				}
				if ( operator === "!=" ) {
					return result !== check;
				}
				if ( operator === "^=" ) {
					return check && result.indexOf( check ) === 0;
				}
				if ( operator === "*=" ) {
					return check && result.indexOf( check ) > -1;
				}
				if ( operator === "$=" ) {
					return check && result.slice( -check.length ) === check;
				}
				if ( operator === "~=" ) {
					return ( " " + result.replace( rwhitespace, " " ) + " " )
						.indexOf( check ) > -1;
				}
				if ( operator === "|=" ) {
					return result === check || result.slice( 0, check.length + 1 ) === check + "-";
				}

				return false;
			};
		},

		CHILD: function( type, what, _argument, first, last ) {
			var simple = type.slice( 0, 3 ) !== "nth",
				forward = type.slice( -4 ) !== "last",
				ofType = what === "of-type";

			return first === 1 && last === 0 ?

				// Shortcut for :nth-*(n)
				function( elem ) {
					return !!elem.parentNode;
				} :

				function( elem, _context, xml ) {
					var cache, outerCache, node, nodeIndex, start,
						dir = simple !== forward ? "nextSibling" : "previousSibling",
						parent = elem.parentNode,
						name = ofType && elem.nodeName.toLowerCase(),
						useCache = !xml && !ofType,
						diff = false;

					if ( parent ) {

						// :(first|last|only)-(child|of-type)
						if ( simple ) {
							while ( dir ) {
								node = elem;
								while ( ( node = node[ dir ] ) ) {
									if ( ofType ?
										nodeName( node, name ) :
										node.nodeType === 1 ) {

										return false;
									}
								}

								// Reverse direction for :only-* (if we haven't yet done so)
								start = dir = type === "only" && !start && "nextSibling";
							}
							return true;
						}

						start = [ forward ? parent.firstChild : parent.lastChild ];

						// non-xml :nth-child(...) stores cache data on `parent`
						if ( forward && useCache ) {

							// Seek `elem` from a previously-cached index
							outerCache = parent[ jQuery.expando ] ||
								( parent[ jQuery.expando ] = {} );
							cache = outerCache[ type ] || [];
							nodeIndex = cache[ 0 ] === dirruns && cache[ 1 ];
							diff = nodeIndex && cache[ 2 ];
							node = nodeIndex && parent.childNodes[ nodeIndex ];

							while ( ( node = ++nodeIndex && node && node[ dir ] ||

								// Fallback to seeking `elem` from the start
								( diff = nodeIndex = 0 ) || start.pop() ) ) {

								// When found, cache indexes on `parent` and break
								if ( node.nodeType === 1 && ++diff && node === elem ) {
									outerCache[ type ] = [ dirruns, nodeIndex, diff ];
									break;
								}
							}

						} else {

							// Use previously-cached element index if available
							if ( useCache ) {
								outerCache = elem[ jQuery.expando ] ||
									( elem[ jQuery.expando ] = {} );
								cache = outerCache[ type ] || [];
								nodeIndex = cache[ 0 ] === dirruns && cache[ 1 ];
								diff = nodeIndex;
							}

							// xml :nth-child(...)
							// or :nth-last-child(...) or :nth(-last)?-of-type(...)
							if ( diff === false ) {

								// Use the same loop as above to seek `elem` from the start
								while ( ( node = ++nodeIndex && node && node[ dir ] ||
									( diff = nodeIndex = 0 ) || start.pop() ) ) {

									if ( ( ofType ?
										nodeName( node, name ) :
										node.nodeType === 1 ) &&
										++diff ) {

										// Cache the index of each encountered element
										if ( useCache ) {
											outerCache = node[ jQuery.expando ] ||
												( node[ jQuery.expando ] = {} );
											outerCache[ type ] = [ dirruns, diff ];
										}

										if ( node === elem ) {
											break;
										}
									}
								}
							}
						}

						// Incorporate the offset, then check against cycle size
						diff -= last;
						return diff === first || ( diff % first === 0 && diff / first >= 0 );
					}
				};
		},

		PSEUDO: function( pseudo, argument ) {

			// pseudo-class names are case-insensitive
			// https://www.w3.org/TR/selectors/#pseudo-classes
			// Prioritize by case sensitivity in case custom pseudos are added with uppercase letters
			// Remember that setFilters inherits from pseudos
			var fn = jQuery.expr.pseudos[ pseudo ] ||
				jQuery.expr.setFilters[ pseudo.toLowerCase() ] ||
				selectorError( "unsupported pseudo: " + pseudo );

			// The user may use createPseudo to indicate that
			// arguments are needed to create the filter function
			// just as jQuery does
			if ( fn[ jQuery.expando ] ) {
				return fn( argument );
			}

			return fn;
		}
	},

	pseudos: {

		// Potentially complex pseudos
		not: markFunction( function( selector ) {

			// Trim the selector passed to compile
			// to avoid treating leading and trailing
			// spaces as combinators
			var input = [],
				results = [],
				matcher = compile( selector.replace( rtrimCSS, "$1" ) );

			return matcher[ jQuery.expando ] ?
				markFunction( function( seed, matches, _context, xml ) {
					var elem,
						unmatched = matcher( seed, null, xml, [] ),
						i = seed.length;

					// Match elements unmatched by `matcher`
					while ( i-- ) {
						if ( ( elem = unmatched[ i ] ) ) {
							seed[ i ] = !( matches[ i ] = elem );
						}
					}
				} ) :
				function( elem, _context, xml ) {
					input[ 0 ] = elem;
					matcher( input, null, xml, results );

					// Don't keep the element
					// (see https://github.com/jquery/sizzle/issues/299)
					input[ 0 ] = null;
					return !results.pop();
				};
		} ),

		has: markFunction( function( selector ) {
			return function( elem ) {
				return find( selector, elem ).length > 0;
			};
		} ),

		contains: markFunction( function( text ) {
			text = unescapeSelector( text );
			return function( elem ) {
				return ( elem.textContent || jQuery.text( elem ) ).indexOf( text ) > -1;
			};
		} ),

		// "Whether an element is represented by a :lang() selector
		// is based solely on the element's language value
		// being equal to the identifier C,
		// or beginning with the identifier C immediately followed by "-".
		// The matching of C against the element's language value is performed case-insensitively.
		// The identifier C does not have to be a valid language name."
		// https://www.w3.org/TR/selectors/#lang-pseudo
		lang: markFunction( function( lang ) {

			// lang value must be a valid identifier
			if ( !ridentifier.test( lang || "" ) ) {
				selectorError( "unsupported lang: " + lang );
			}
			lang = unescapeSelector( lang ).toLowerCase();
			return function( elem ) {
				var elemLang;
				do {
					if ( ( elemLang = documentIsHTML ?
						elem.lang :
						elem.getAttribute( "xml:lang" ) || elem.getAttribute( "lang" ) ) ) {

						elemLang = elemLang.toLowerCase();
						return elemLang === lang || elemLang.indexOf( lang + "-" ) === 0;
					}
				} while ( ( elem = elem.parentNode ) && elem.nodeType === 1 );
				return false;
			};
		} ),

		// Miscellaneous
		target: function( elem ) {
			var hash = window.location && window.location.hash;
			return hash && hash.slice( 1 ) === elem.id;
		},

		root: function( elem ) {
			return elem === documentElement;
		},

		focus: function( elem ) {
			return elem === document.activeElement &&
				document.hasFocus() &&
				!!( elem.type || elem.href || ~elem.tabIndex );
		},

		// Boolean properties
		enabled: createDisabledPseudo( false ),
		disabled: createDisabledPseudo( true ),

		checked: function( elem ) {

			// In CSS3, :checked should return both checked and selected elements
			// https://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			return ( nodeName( elem, "input" ) && !!elem.checked ) ||
				( nodeName( elem, "option" ) && !!elem.selected );
		},

		selected: function( elem ) {

			// Support: IE <=11+
			// Accessing the selectedIndex property
			// forces the browser to treat the default option as
			// selected when in an optgroup.
			if ( isIE && elem.parentNode ) {
				// eslint-disable-next-line no-unused-expressions
				elem.parentNode.selectedIndex;
			}

			return elem.selected === true;
		},

		// Contents
		empty: function( elem ) {

			// https://www.w3.org/TR/selectors/#empty-pseudo
			// :empty is negated by element (1) or content nodes (text: 3; cdata: 4; entity ref: 5),
			//   but not by others (comment: 8; processing instruction: 7; etc.)
			// nodeType < 6 works because attributes (2) do not appear as children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				if ( elem.nodeType < 6 ) {
					return false;
				}
			}
			return true;
		},

		parent: function( elem ) {
			return !jQuery.expr.pseudos.empty( elem );
		},

		// Element/input types
		header: function( elem ) {
			return rheader.test( elem.nodeName );
		},

		input: function( elem ) {
			return rinputs.test( elem.nodeName );
		},

		button: function( elem ) {
			return nodeName( elem, "input" ) && elem.type === "button" ||
				nodeName( elem, "button" );
		},

		text: function( elem ) {
			return nodeName( elem, "input" ) && elem.type === "text";
		},

		// Position-in-collection
		first: createPositionalPseudo( function() {
			return [ 0 ];
		} ),

		last: createPositionalPseudo( function( _matchIndexes, length ) {
			return [ length - 1 ];
		} ),

		eq: createPositionalPseudo( function( _matchIndexes, length, argument ) {
			return [ argument < 0 ? argument + length : argument ];
		} ),

		even: createPositionalPseudo( function( matchIndexes, length ) {
			var i = 0;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		} ),

		odd: createPositionalPseudo( function( matchIndexes, length ) {
			var i = 1;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		} ),

		lt: createPositionalPseudo( function( matchIndexes, length, argument ) {
			var i;

			if ( argument < 0 ) {
				i = argument + length;
			} else if ( argument > length ) {
				i = length;
			} else {
				i = argument;
			}

			for ( ; --i >= 0; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		} ),

		gt: createPositionalPseudo( function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; ++i < length; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		} )
	}
};

jQuery.expr.pseudos.nth = jQuery.expr.pseudos.eq;

// Add button/input type pseudos
for ( i in { radio: true, checkbox: true, file: true, password: true, image: true } ) {
	jQuery.expr.pseudos[ i ] = createInputPseudo( i );
}
for ( i in { submit: true, reset: true } ) {
	jQuery.expr.pseudos[ i ] = createButtonPseudo( i );
}

// Easy API for creating new setFilters
function setFilters() {}
setFilters.prototype = jQuery.expr.filters = jQuery.expr.pseudos;
jQuery.expr.setFilters = new setFilters();

function addCombinator( matcher, combinator, base ) {
	var dir = combinator.dir,
		skip = combinator.next,
		key = skip || dir,
		checkNonElements = base && key === "parentNode",
		doneName = done++;

	return combinator.first ?

		// Check against closest ancestor/preceding element
		function( elem, context, xml ) {
			while ( ( elem = elem[ dir ] ) ) {
				if ( elem.nodeType === 1 || checkNonElements ) {
					return matcher( elem, context, xml );
				}
			}
			return false;
		} :

		// Check against all ancestor/preceding elements
		function( elem, context, xml ) {
			var oldCache, outerCache,
				newCache = [ dirruns, doneName ];

			// We can't set arbitrary data on XML nodes, so they don't benefit from combinator caching
			if ( xml ) {
				while ( ( elem = elem[ dir ] ) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						if ( matcher( elem, context, xml ) ) {
							return true;
						}
					}
				}
			} else {
				while ( ( elem = elem[ dir ] ) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						outerCache = elem[ jQuery.expando ] || ( elem[ jQuery.expando ] = {} );

						if ( skip && nodeName( elem, skip ) ) {
							elem = elem[ dir ] || elem;
						} else if ( ( oldCache = outerCache[ key ] ) &&
							oldCache[ 0 ] === dirruns && oldCache[ 1 ] === doneName ) {

							// Assign to newCache so results back-propagate to previous elements
							return ( newCache[ 2 ] = oldCache[ 2 ] );
						} else {

							// Reuse newcache so results back-propagate to previous elements
							outerCache[ key ] = newCache;

							// A match means we're done; a fail means we have to keep checking
							if ( ( newCache[ 2 ] = matcher( elem, context, xml ) ) ) {
								return true;
							}
						}
					}
				}
			}
			return false;
		};
}

function elementMatcher( matchers ) {
	return matchers.length > 1 ?
		function( elem, context, xml ) {
			var i = matchers.length;
			while ( i-- ) {
				if ( !matchers[ i ]( elem, context, xml ) ) {
					return false;
				}
			}
			return true;
		} :
		matchers[ 0 ];
}

function multipleContexts( selector, contexts, results ) {
	var i = 0,
		len = contexts.length;
	for ( ; i < len; i++ ) {
		find( selector, contexts[ i ], results );
	}
	return results;
}

function condense( unmatched, map, filter, context, xml ) {
	var elem,
		newUnmatched = [],
		i = 0,
		len = unmatched.length,
		mapped = map != null;

	for ( ; i < len; i++ ) {
		if ( ( elem = unmatched[ i ] ) ) {
			if ( !filter || filter( elem, context, xml ) ) {
				newUnmatched.push( elem );
				if ( mapped ) {
					map.push( i );
				}
			}
		}
	}

	return newUnmatched;
}

function setMatcher( preFilter, selector, matcher, postFilter, postFinder, postSelector ) {
	if ( postFilter && !postFilter[ jQuery.expando ] ) {
		postFilter = setMatcher( postFilter );
	}
	if ( postFinder && !postFinder[ jQuery.expando ] ) {
		postFinder = setMatcher( postFinder, postSelector );
	}
	return markFunction( function( seed, results, context, xml ) {
		var temp, i, elem, matcherOut,
			preMap = [],
			postMap = [],
			preexisting = results.length,

			// Get initial elements from seed or context
			elems = seed ||
				multipleContexts( selector || "*",
					context.nodeType ? [ context ] : context, [] ),

			// Prefilter to get matcher input, preserving a map for seed-results synchronization
			matcherIn = preFilter && ( seed || !selector ) ?
				condense( elems, preMap, preFilter, context, xml ) :
				elems;

		if ( matcher ) {

			// If we have a postFinder, or filtered seed, or non-seed postFilter
			// or preexisting results,
			matcherOut = postFinder || ( seed ? preFilter : preexisting || postFilter ) ?

				// ...intermediate processing is necessary
				[] :

				// ...otherwise use results directly
				results;

			// Find primary matches
			matcher( matcherIn, matcherOut, context, xml );
		} else {
			matcherOut = matcherIn;
		}

		// Apply postFilter
		if ( postFilter ) {
			temp = condense( matcherOut, postMap );
			postFilter( temp, [], context, xml );

			// Un-match failing elements by moving them back to matcherIn
			i = temp.length;
			while ( i-- ) {
				if ( ( elem = temp[ i ] ) ) {
					matcherOut[ postMap[ i ] ] = !( matcherIn[ postMap[ i ] ] = elem );
				}
			}
		}

		if ( seed ) {
			if ( postFinder || preFilter ) {
				if ( postFinder ) {

					// Get the final matcherOut by condensing this intermediate into postFinder contexts
					temp = [];
					i = matcherOut.length;
					while ( i-- ) {
						if ( ( elem = matcherOut[ i ] ) ) {

							// Restore matcherIn since elem is not yet a final match
							temp.push( ( matcherIn[ i ] = elem ) );
						}
					}
					postFinder( null, ( matcherOut = [] ), temp, xml );
				}

				// Move matched elements from seed to results to keep them synchronized
				i = matcherOut.length;
				while ( i-- ) {
					if ( ( elem = matcherOut[ i ] ) &&
						( temp = postFinder ? indexOf.call( seed, elem ) : preMap[ i ] ) > -1 ) {

						seed[ temp ] = !( results[ temp ] = elem );
					}
				}
			}

		// Add elements to results, through postFinder if defined
		} else {
			matcherOut = condense(
				matcherOut === results ?
					matcherOut.splice( preexisting, matcherOut.length ) :
					matcherOut
			);
			if ( postFinder ) {
				postFinder( null, results, matcherOut, xml );
			} else {
				push.apply( results, matcherOut );
			}
		}
	} );
}

function matcherFromTokens( tokens ) {
	var checkContext, matcher, j,
		len = tokens.length,
		leadingRelative = jQuery.expr.relative[ tokens[ 0 ].type ],
		implicitRelative = leadingRelative || jQuery.expr.relative[ " " ],
		i = leadingRelative ? 1 : 0,

		// The foundational matcher ensures that elements are reachable from top-level context(s)
		matchContext = addCombinator( function( elem ) {
			return elem === checkContext;
		}, implicitRelative, true ),
		matchAnyContext = addCombinator( function( elem ) {
			return indexOf.call( checkContext, elem ) > -1;
		}, implicitRelative, true ),
		matchers = [ function( elem, context, xml ) {

			// Support: IE 11+
			// IE sometimes throws a "Permission denied" error when strict-comparing
			// two documents; shallow comparisons work.
			// eslint-disable-next-line eqeqeq
			var ret = ( !leadingRelative && ( xml || context != outermostContext ) ) || (
				( checkContext = context ).nodeType ?
					matchContext( elem, context, xml ) :
					matchAnyContext( elem, context, xml ) );

			// Avoid hanging onto element
			// (see https://github.com/jquery/sizzle/issues/299)
			checkContext = null;
			return ret;
		} ];

	for ( ; i < len; i++ ) {
		if ( ( matcher = jQuery.expr.relative[ tokens[ i ].type ] ) ) {
			matchers = [ addCombinator( elementMatcher( matchers ), matcher ) ];
		} else {
			matcher = jQuery.expr.filter[ tokens[ i ].type ].apply( null, tokens[ i ].matches );

			// Return special upon seeing a positional matcher
			if ( matcher[ jQuery.expando ] ) {

				// Find the next relative operator (if any) for proper handling
				j = ++i;
				for ( ; j < len; j++ ) {
					if ( jQuery.expr.relative[ tokens[ j ].type ] ) {
						break;
					}
				}
				return setMatcher(
					i > 1 && elementMatcher( matchers ),
					i > 1 && toSelector(

						// If the preceding token was a descendant combinator, insert an implicit any-element `*`
						tokens.slice( 0, i - 1 )
							.concat( { value: tokens[ i - 2 ].type === " " ? "*" : "" } )
					).replace( rtrimCSS, "$1" ),
					matcher,
					i < j && matcherFromTokens( tokens.slice( i, j ) ),
					j < len && matcherFromTokens( ( tokens = tokens.slice( j ) ) ),
					j < len && toSelector( tokens )
				);
			}
			matchers.push( matcher );
		}
	}

	return elementMatcher( matchers );
}

function matcherFromGroupMatchers( elementMatchers, setMatchers ) {
	var bySet = setMatchers.length > 0,
		byElement = elementMatchers.length > 0,
		superMatcher = function( seed, context, xml, results, outermost ) {
			var elem, j, matcher,
				matchedCount = 0,
				i = "0",
				unmatched = seed && [],
				setMatched = [],
				contextBackup = outermostContext,

				// We must always have either seed elements or outermost context
				elems = seed || byElement && jQuery.expr.find.TAG( "*", outermost ),

				// Use integer dirruns iff this is the outermost matcher
				dirrunsUnique = ( dirruns += contextBackup == null ? 1 : Math.random() || 0.1 );

			if ( outermost ) {

				// Support: IE 11+
				// IE sometimes throws a "Permission denied" error when strict-comparing
				// two documents; shallow comparisons work.
				// eslint-disable-next-line eqeqeq
				outermostContext = context == document || context || outermost;
			}

			// Add elements passing elementMatchers directly to results
			for ( ; ( elem = elems[ i ] ) != null; i++ ) {
				if ( byElement && elem ) {
					j = 0;

					// Support: IE 11+
					// IE sometimes throws a "Permission denied" error when strict-comparing
					// two documents; shallow comparisons work.
					// eslint-disable-next-line eqeqeq
					if ( !context && elem.ownerDocument != document ) {
						setDocument( elem );
						xml = !documentIsHTML;
					}
					while ( ( matcher = elementMatchers[ j++ ] ) ) {
						if ( matcher( elem, context || document, xml ) ) {
							push.call( results, elem );
							break;
						}
					}
					if ( outermost ) {
						dirruns = dirrunsUnique;
					}
				}

				// Track unmatched elements for set filters
				if ( bySet ) {

					// They will have gone through all possible matchers
					if ( ( elem = !matcher && elem ) ) {
						matchedCount--;
					}

					// Lengthen the array for every element, matched or not
					if ( seed ) {
						unmatched.push( elem );
					}
				}
			}

			// `i` is now the count of elements visited above, and adding it to `matchedCount`
			// makes the latter nonnegative.
			matchedCount += i;

			// Apply set filters to unmatched elements
			// NOTE: This can be skipped if there are no unmatched elements (i.e., `matchedCount`
			// equals `i`), unless we didn't visit _any_ elements in the above loop because we have
			// no element matchers and no seed.
			// Incrementing an initially-string "0" `i` allows `i` to remain a string only in that
			// case, which will result in a "00" `matchedCount` that differs from `i` but is also
			// numerically zero.
			if ( bySet && i !== matchedCount ) {
				j = 0;
				while ( ( matcher = setMatchers[ j++ ] ) ) {
					matcher( unmatched, setMatched, context, xml );
				}

				if ( seed ) {

					// Reintegrate element matches to eliminate the need for sorting
					if ( matchedCount > 0 ) {
						while ( i-- ) {
							if ( !( unmatched[ i ] || setMatched[ i ] ) ) {
								setMatched[ i ] = pop.call( results );
							}
						}
					}

					// Discard index placeholder values to get only actual matches
					setMatched = condense( setMatched );
				}

				// Add matches to results
				push.apply( results, setMatched );

				// Seedless set matches succeeding multiple successful matchers stipulate sorting
				if ( outermost && !seed && setMatched.length > 0 &&
					( matchedCount + setMatchers.length ) > 1 ) {

					jQuery.uniqueSort( results );
				}
			}

			// Override manipulation of globals by nested matchers
			if ( outermost ) {
				dirruns = dirrunsUnique;
				outermostContext = contextBackup;
			}

			return unmatched;
		};

	return bySet ?
		markFunction( superMatcher ) :
		superMatcher;
}

function compile( selector, match /* Internal Use Only */ ) {
	var i,
		setMatchers = [],
		elementMatchers = [],
		cached = compilerCache[ selector + " " ];

	if ( !cached ) {

		// Generate a function of recursive functions that can be used to check each element
		if ( !match ) {
			match = tokenize( selector );
		}
		i = match.length;
		while ( i-- ) {
			cached = matcherFromTokens( match[ i ] );
			if ( cached[ jQuery.expando ] ) {
				setMatchers.push( cached );
			} else {
				elementMatchers.push( cached );
			}
		}

		// Cache the compiled function
		cached = compilerCache( selector,
			matcherFromGroupMatchers( elementMatchers, setMatchers ) );

		// Save selector and tokenization
		cached.selector = selector;
	}
	return cached;
}

/**
 * A low-level selection function that works with jQuery's compiled
 *  selector functions
 * @param {String|Function} selector A selector or a pre-compiled
 *  selector function built with jQuery selector compile
 * @param {Element} context
 * @param {Array} [results]
 * @param {Array} [seed] A set of elements to match against
 */
function select( selector, context, results, seed ) {
	var i, tokens, token, type, find,
		compiled = typeof selector === "function" && selector,
		match = !seed && tokenize( ( selector = compiled.selector || selector ) );

	results = results || [];

	// Try to minimize operations if there is only one selector in the list and no seed
	// (the latter of which guarantees us context)
	if ( match.length === 1 ) {

		// Reduce context if the leading compound selector is an ID
		tokens = match[ 0 ] = match[ 0 ].slice( 0 );
		if ( tokens.length > 2 && ( token = tokens[ 0 ] ).type === "ID" &&
				context.nodeType === 9 && documentIsHTML &&
				jQuery.expr.relative[ tokens[ 1 ].type ] ) {

			context = ( jQuery.expr.find.ID(
				unescapeSelector( token.matches[ 0 ] ),
				context
			) || [] )[ 0 ];
			if ( !context ) {
				return results;

			// Precompiled matchers will still verify ancestry, so step up a level
			} else if ( compiled ) {
				context = context.parentNode;
			}

			selector = selector.slice( tokens.shift().value.length );
		}

		// Fetch a seed set for right-to-left matching
		i = matchExpr.needsContext.test( selector ) ? 0 : tokens.length;
		while ( i-- ) {
			token = tokens[ i ];

			// Abort if we hit a combinator
			if ( jQuery.expr.relative[ ( type = token.type ) ] ) {
				break;
			}
			if ( ( find = jQuery.expr.find[ type ] ) ) {

				// Search, expanding context for leading sibling combinators
				if ( ( seed = find(
					unescapeSelector( token.matches[ 0 ] ),
					rsibling.test( tokens[ 0 ].type ) &&
						testContext( context.parentNode ) || context
				) ) ) {

					// If seed is empty or no tokens remain, we can return early
					tokens.splice( i, 1 );
					selector = seed.length && toSelector( tokens );
					if ( !selector ) {
						push.apply( results, seed );
						return results;
					}

					break;
				}
			}
		}
	}

	// Compile and execute a filtering function if one is not provided
	// Provide `match` to avoid retokenization if we modified the selector above
	( compiled || compile( selector, match ) )(
		seed,
		context,
		!documentIsHTML,
		results,
		!context || rsibling.test( selector ) && testContext( context.parentNode ) || context
	);
	return results;
}

// Initialize against the default document
setDocument();

jQuery.find = find;

// These have always been private, but they used to be documented as part of
// Sizzle so let's maintain them for now for backwards compatibility purposes.
find.compile = compile;
find.select = select;
find.setDocument = setDocument;
find.tokenize = tokenize;

function dir( elem, dir, until ) {
	var matched = [],
		truncate = until !== undefined;

	while ( ( elem = elem[ dir ] ) && elem.nodeType !== 9 ) {
		if ( elem.nodeType === 1 ) {
			if ( truncate && jQuery( elem ).is( until ) ) {
				break;
			}
			matched.push( elem );
		}
	}
	return matched;
}

function siblings( n, elem ) {
	var matched = [];

	for ( ; n; n = n.nextSibling ) {
		if ( n.nodeType === 1 && n !== elem ) {
			matched.push( n );
		}
	}

	return matched;
}

var rneedsContext = jQuery.expr.match.needsContext;

// rsingleTag matches a string consisting of a single HTML element with no attributes
// and captures the element's name
var rsingleTag = /^<([a-z][^\/\0>:\x20\t\r\n\f]*)[\x20\t\r\n\f]*\/?>(?:<\/\1>|)$/i;

function isObviousHtml( input ) {
	return input[ 0 ] === "<" &&
		input[ input.length - 1 ] === ">" &&
		input.length >= 3;
}

// Implement the identical functionality for filter and not
function winnow( elements, qualifier, not ) {
	if ( typeof qualifier === "function" ) {
		return jQuery.grep( elements, function( elem, i ) {
			return !!qualifier.call( elem, i, elem ) !== not;
		} );
	}

	// Single element
	if ( qualifier.nodeType ) {
		return jQuery.grep( elements, function( elem ) {
			return ( elem === qualifier ) !== not;
		} );
	}

	// Arraylike of elements (jQuery, arguments, Array)
	if ( typeof qualifier !== "string" ) {
		return jQuery.grep( elements, function( elem ) {
			return ( indexOf.call( qualifier, elem ) > -1 ) !== not;
		} );
	}

	// Filtered directly for both simple and complex selectors
	return jQuery.filter( qualifier, elements, not );
}

jQuery.filter = function( expr, elems, not ) {
	var elem = elems[ 0 ];

	if ( not ) {
		expr = ":not(" + expr + ")";
	}

	if ( elems.length === 1 && elem.nodeType === 1 ) {
		return jQuery.find.matchesSelector( elem, expr ) ? [ elem ] : [];
	}

	return jQuery.find.matches( expr, jQuery.grep( elems, function( elem ) {
		return elem.nodeType === 1;
	} ) );
};

jQuery.fn.extend( {
	find: function( selector ) {
		var i, ret,
			len = this.length,
			self = this;

		if ( typeof selector !== "string" ) {
			return this.pushStack( jQuery( selector ).filter( function() {
				for ( i = 0; i < len; i++ ) {
					if ( jQuery.contains( self[ i ], this ) ) {
						return true;
					}
				}
			} ) );
		}

		ret = this.pushStack( [] );

		for ( i = 0; i < len; i++ ) {
			jQuery.find( selector, self[ i ], ret );
		}

		return len > 1 ? jQuery.uniqueSort( ret ) : ret;
	},
	filter: function( selector ) {
		return this.pushStack( winnow( this, selector || [], false ) );
	},
	not: function( selector ) {
		return this.pushStack( winnow( this, selector || [], true ) );
	},
	is: function( selector ) {
		return !!winnow(
			this,

			// If this is a positional/relative selector, check membership in the returned set
			// so $("p:first").is("p:last") won't return true for a doc with two "p".
			typeof selector === "string" && rneedsContext.test( selector ) ?
				jQuery( selector ) :
				selector || [],
			false
		).length;
	}
} );

// Initialize a jQuery object

// A central reference to the root jQuery(document)
var rootjQuery,

	// A simple way to check for HTML strings
	// Prioritize #id over <tag> to avoid XSS via location.hash (trac-9521)
	// Strict HTML recognition (trac-11290: must start with <)
	// Shortcut simple #id case for speed
	rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+))$/,

	init = jQuery.fn.init = function( selector, context ) {
		var match, elem;

		// HANDLE: $(""), $(null), $(undefined), $(false)
		if ( !selector ) {
			return this;
		}

		// HANDLE: $(DOMElement)
		if ( selector.nodeType ) {
			this[ 0 ] = selector;
			this.length = 1;
			return this;

		// HANDLE: $(function)
		// Shortcut for document ready
		} else if ( typeof selector === "function" ) {
			return rootjQuery.ready !== undefined ?
				rootjQuery.ready( selector ) :

				// Execute immediately if ready is not present
				selector( jQuery );

		} else {

			// Handle obvious HTML strings
			match = selector + "";
			if ( isObviousHtml( match ) ) {

				// Assume that strings that start and end with <> are HTML and skip
				// the regex check. This also handles browser-supported HTML wrappers
				// like TrustedHTML.
				match = [ null, selector, null ];

			// Handle HTML strings or selectors
			} else if ( typeof selector === "string" ) {
				match = rquickExpr.exec( selector );
			} else {
				return jQuery.makeArray( selector, this );
			}

			// Match html or make sure no context is specified for #id
			// Note: match[1] may be a string or a TrustedHTML wrapper
			if ( match && ( match[ 1 ] || !context ) ) {

				// HANDLE: $(html) -> $(array)
				if ( match[ 1 ] ) {
					context = context instanceof jQuery ? context[ 0 ] : context;

					// Option to run scripts is true for back-compat
					// Intentionally let the error be thrown if parseHTML is not present
					jQuery.merge( this, jQuery.parseHTML(
						match[ 1 ],
						context && context.nodeType ? context.ownerDocument || context : document$1,
						true
					) );

					// HANDLE: $(html, props)
					if ( rsingleTag.test( match[ 1 ] ) && jQuery.isPlainObject( context ) ) {
						for ( match in context ) {

							// Properties of context are called as methods if possible
							if ( typeof this[ match ] === "function" ) {
								this[ match ]( context[ match ] );

							// ...and otherwise set as attributes
							} else {
								this.attr( match, context[ match ] );
							}
						}
					}

					return this;

				// HANDLE: $(#id)
				} else {
					elem = document$1.getElementById( match[ 2 ] );

					if ( elem ) {

						// Inject the element directly into the jQuery object
						this[ 0 ] = elem;
						this.length = 1;
					}
					return this;
				}

			// HANDLE: $(expr) & $(expr, $(...))
			} else if ( !context || context.jquery ) {
				return ( context || rootjQuery ).find( selector );

			// HANDLE: $(expr, context)
			// (which is just equivalent to: $(context).find(expr)
			} else {
				return this.constructor( context ).find( selector );
			}
		}

	};

// Give the init function the jQuery prototype for later instantiation
init.prototype = jQuery.fn;

// Initialize central reference
rootjQuery = jQuery( document$1 );

var rparentsprev = /^(?:parents|prev(?:Until|All))/,

	// Methods guaranteed to produce a unique set when starting from a unique set
	guaranteedUnique = {
		children: true,
		contents: true,
		next: true,
		prev: true
	};

jQuery.fn.extend( {
	has: function( target ) {
		var targets = jQuery( target, this ),
			l = targets.length;

		return this.filter( function() {
			var i = 0;
			for ( ; i < l; i++ ) {
				if ( jQuery.contains( this, targets[ i ] ) ) {
					return true;
				}
			}
		} );
	},

	closest: function( selectors, context ) {
		var cur,
			i = 0,
			l = this.length,
			matched = [],
			targets = typeof selectors !== "string" && jQuery( selectors );

		// Positional selectors never match, since there's no _selection_ context
		if ( !rneedsContext.test( selectors ) ) {
			for ( ; i < l; i++ ) {
				for ( cur = this[ i ]; cur && cur !== context; cur = cur.parentNode ) {

					// Always skip document fragments
					if ( cur.nodeType < 11 && ( targets ?
						targets.index( cur ) > -1 :

						// Don't pass non-elements to jQuery#find
						cur.nodeType === 1 &&
							jQuery.find.matchesSelector( cur, selectors ) ) ) {

						matched.push( cur );
						break;
					}
				}
			}
		}

		return this.pushStack( matched.length > 1 ? jQuery.uniqueSort( matched ) : matched );
	},

	// Determine the position of an element within the set
	index: function( elem ) {

		// No argument, return index in parent
		if ( !elem ) {
			return ( this[ 0 ] && this[ 0 ].parentNode ) ? this.first().prevAll().length : -1;
		}

		// Index in selector
		if ( typeof elem === "string" ) {
			return indexOf.call( jQuery( elem ), this[ 0 ] );
		}

		// Locate the position of the desired element
		return indexOf.call( this,

			// If it receives a jQuery object, the first element is used
			elem.jquery ? elem[ 0 ] : elem
		);
	},

	add: function( selector, context ) {
		return this.pushStack(
			jQuery.uniqueSort(
				jQuery.merge( this.get(), jQuery( selector, context ) )
			)
		);
	},

	addBack: function( selector ) {
		return this.add( selector == null ?
			this.prevObject : this.prevObject.filter( selector )
		);
	}
} );

function sibling( cur, dir ) {
	while ( ( cur = cur[ dir ] ) && cur.nodeType !== 1 ) {}
	return cur;
}

jQuery.each( {
	parent: function( elem ) {
		var parent = elem.parentNode;
		return parent && parent.nodeType !== 11 ? parent : null;
	},
	parents: function( elem ) {
		return dir( elem, "parentNode" );
	},
	parentsUntil: function( elem, _i, until ) {
		return dir( elem, "parentNode", until );
	},
	next: function( elem ) {
		return sibling( elem, "nextSibling" );
	},
	prev: function( elem ) {
		return sibling( elem, "previousSibling" );
	},
	nextAll: function( elem ) {
		return dir( elem, "nextSibling" );
	},
	prevAll: function( elem ) {
		return dir( elem, "previousSibling" );
	},
	nextUntil: function( elem, _i, until ) {
		return dir( elem, "nextSibling", until );
	},
	prevUntil: function( elem, _i, until ) {
		return dir( elem, "previousSibling", until );
	},
	siblings: function( elem ) {
		return siblings( ( elem.parentNode || {} ).firstChild, elem );
	},
	children: function( elem ) {
		return siblings( elem.firstChild );
	},
	contents: function( elem ) {
		if ( elem.contentDocument != null &&

			// Support: IE 11+
			// <object> elements with no `data` attribute has an object
			// `contentDocument` with a `null` prototype.
			getProto( elem.contentDocument ) ) {

			return elem.contentDocument;
		}

		// Support: IE 9 - 11+
		// Treat the template element as a regular one in browsers that
		// don't support it.
		if ( nodeName( elem, "template" ) ) {
			elem = elem.content || elem;
		}

		return jQuery.merge( [], elem.childNodes );
	}
}, function( name, fn ) {
	jQuery.fn[ name ] = function( until, selector ) {
		var matched = jQuery.map( this, fn, until );

		if ( name.slice( -5 ) !== "Until" ) {
			selector = until;
		}

		if ( selector && typeof selector === "string" ) {
			matched = jQuery.filter( selector, matched );
		}

		if ( this.length > 1 ) {

			// Remove duplicates
			if ( !guaranteedUnique[ name ] ) {
				jQuery.uniqueSort( matched );
			}

			// Reverse order for parents* and prev-derivatives
			if ( rparentsprev.test( name ) ) {
				matched.reverse();
			}
		}

		return this.pushStack( matched );
	};
} );

// Convert String-formatted options into Object-formatted ones
function createOptions( options ) {
	var object = {};
	jQuery.each( options.match( rnothtmlwhite ) || [], function( _, flag ) {
		object[ flag ] = true;
	} );
	return object;
}

/*
 * Create a callback list using the following parameters:
 *
 *	options: an optional list of space-separated options that will change how
 *			the callback list behaves or a more traditional option object
 *
 * By default a callback list will act like an event callback list and can be
 * "fired" multiple times.
 *
 * Possible options:
 *
 *	once:			will ensure the callback list can only be fired once (like a Deferred)
 *
 *	memory:			will keep track of previous values and will call any callback added
 *					after the list has been fired right away with the latest "memorized"
 *					values (like a Deferred)
 *
 *	unique:			will ensure a callback can only be added once (no duplicate in the list)
 *
 *	stopOnFalse:	interrupt callings when a callback returns false
 *
 */
jQuery.Callbacks = function( options ) {

	// Convert options from String-formatted to Object-formatted if needed
	// (we check in cache first)
	options = typeof options === "string" ?
		createOptions( options ) :
		jQuery.extend( {}, options );

	var // Flag to know if list is currently firing
		firing,

		// Last fire value for non-forgettable lists
		memory,

		// Flag to know if list was already fired
		fired,

		// Flag to prevent firing
		locked,

		// Actual callback list
		list = [],

		// Queue of execution data for repeatable lists
		queue = [],

		// Index of currently firing callback (modified by add/remove as needed)
		firingIndex = -1,

		// Fire callbacks
		fire = function() {

			// Enforce single-firing
			locked = locked || options.once;

			// Execute callbacks for all pending executions,
			// respecting firingIndex overrides and runtime changes
			fired = firing = true;
			for ( ; queue.length; firingIndex = -1 ) {
				memory = queue.shift();
				while ( ++firingIndex < list.length ) {

					// Run callback and check for early termination
					if ( list[ firingIndex ].apply( memory[ 0 ], memory[ 1 ] ) === false &&
						options.stopOnFalse ) {

						// Jump to end and forget the data so .add doesn't re-fire
						firingIndex = list.length;
						memory = false;
					}
				}
			}

			// Forget the data if we're done with it
			if ( !options.memory ) {
				memory = false;
			}

			firing = false;

			// Clean up if we're done firing for good
			if ( locked ) {

				// Keep an empty list if we have data for future add calls
				if ( memory ) {
					list = [];

				// Otherwise, this object is spent
				} else {
					list = "";
				}
			}
		},

		// Actual Callbacks object
		self = {

			// Add a callback or a collection of callbacks to the list
			add: function() {
				if ( list ) {

					// If we have memory from a past run, we should fire after adding
					if ( memory && !firing ) {
						firingIndex = list.length - 1;
						queue.push( memory );
					}

					( function add( args ) {
						jQuery.each( args, function( _, arg ) {
							if ( typeof arg === "function" ) {
								if ( !options.unique || !self.has( arg ) ) {
									list.push( arg );
								}
							} else if ( arg && arg.length && toType( arg ) !== "string" ) {

								// Inspect recursively
								add( arg );
							}
						} );
					} )( arguments );

					if ( memory && !firing ) {
						fire();
					}
				}
				return this;
			},

			// Remove a callback from the list
			remove: function() {
				jQuery.each( arguments, function( _, arg ) {
					var index;
					while ( ( index = jQuery.inArray( arg, list, index ) ) > -1 ) {
						list.splice( index, 1 );

						// Handle firing indexes
						if ( index <= firingIndex ) {
							firingIndex--;
						}
					}
				} );
				return this;
			},

			// Check if a given callback is in the list.
			// If no argument is given, return whether or not list has callbacks attached.
			has: function( fn ) {
				return fn ?
					jQuery.inArray( fn, list ) > -1 :
					list.length > 0;
			},

			// Remove all callbacks from the list
			empty: function() {
				if ( list ) {
					list = [];
				}
				return this;
			},

			// Disable .fire and .add
			// Abort any current/pending executions
			// Clear all callbacks and values
			disable: function() {
				locked = queue = [];
				list = memory = "";
				return this;
			},
			disabled: function() {
				return !list;
			},

			// Disable .fire
			// Also disable .add unless we have memory (since it would have no effect)
			// Abort any pending executions
			lock: function() {
				locked = queue = [];
				if ( !memory && !firing ) {
					list = memory = "";
				}
				return this;
			},
			locked: function() {
				return !!locked;
			},

			// Call all callbacks with the given context and arguments
			fireWith: function( context, args ) {
				if ( !locked ) {
					args = args || [];
					args = [ context, args.slice ? args.slice() : args ];
					queue.push( args );
					if ( !firing ) {
						fire();
					}
				}
				return this;
			},

			// Call all the callbacks with the given arguments
			fire: function() {
				self.fireWith( this, arguments );
				return this;
			},

			// To know if the callbacks have already been called at least once
			fired: function() {
				return !!fired;
			}
		};

	return self;
};

function Identity( v ) {
	return v;
}
function Thrower( ex ) {
	throw ex;
}

function adoptValue( value, resolve, reject, noValue ) {
	var method;

	try {

		// Check for promise aspect first to privilege synchronous behavior
		if ( value && typeof( method = value.promise ) === "function" ) {
			method.call( value ).done( resolve ).fail( reject );

		// Other thenables
		} else if ( value && typeof( method = value.then ) === "function" ) {
			method.call( value, resolve, reject );

		// Other non-thenables
		} else {

			// Control `resolve` arguments by letting Array#slice cast boolean `noValue` to integer:
			// * false: [ value ].slice( 0 ) => resolve( value )
			// * true: [ value ].slice( 1 ) => resolve()
			resolve.apply( undefined, [ value ].slice( noValue ) );
		}

	// For Promises/A+, convert exceptions into rejections
	// Since jQuery.when doesn't unwrap thenables, we can skip the extra checks appearing in
	// Deferred#then to conditionally suppress rejection.
	} catch ( value ) {
		reject( value );
	}
}

jQuery.extend( {

	Deferred: function( func ) {
		var tuples = [

				// action, add listener, callbacks,
				// ... .then handlers, argument index, [final state]
				[ "notify", "progress", jQuery.Callbacks( "memory" ),
					jQuery.Callbacks( "memory" ), 2 ],
				[ "resolve", "done", jQuery.Callbacks( "once memory" ),
					jQuery.Callbacks( "once memory" ), 0, "resolved" ],
				[ "reject", "fail", jQuery.Callbacks( "once memory" ),
					jQuery.Callbacks( "once memory" ), 1, "rejected" ]
			],
			state = "pending",
			promise = {
				state: function() {
					return state;
				},
				always: function() {
					deferred.done( arguments ).fail( arguments );
					return this;
				},
				catch: function( fn ) {
					return promise.then( null, fn );
				},

				// Keep pipe for back-compat
				pipe: function( /* fnDone, fnFail, fnProgress */ ) {
					var fns = arguments;

					return jQuery.Deferred( function( newDefer ) {
						jQuery.each( tuples, function( _i, tuple ) {

							// Map tuples (progress, done, fail) to arguments (done, fail, progress)
							var fn = typeof fns[ tuple[ 4 ] ] === "function" &&
								fns[ tuple[ 4 ] ];

							// deferred.progress(function() { bind to newDefer or newDefer.notify })
							// deferred.done(function() { bind to newDefer or newDefer.resolve })
							// deferred.fail(function() { bind to newDefer or newDefer.reject })
							deferred[ tuple[ 1 ] ]( function() {
								var returned = fn && fn.apply( this, arguments );
								if ( returned && typeof returned.promise === "function" ) {
									returned.promise()
										.progress( newDefer.notify )
										.done( newDefer.resolve )
										.fail( newDefer.reject );
								} else {
									newDefer[ tuple[ 0 ] + "With" ](
										this,
										fn ? [ returned ] : arguments
									);
								}
							} );
						} );
						fns = null;
					} ).promise();
				},
				then: function( onFulfilled, onRejected, onProgress ) {
					var maxDepth = 0;
					function resolve( depth, deferred, handler, special ) {
						return function() {
							var that = this,
								args = arguments,
								mightThrow = function() {
									var returned, then;

									// Support: Promises/A+ section 2.3.3.3.3
									// https://promisesaplus.com/#point-59
									// Ignore double-resolution attempts
									if ( depth < maxDepth ) {
										return;
									}

									returned = handler.apply( that, args );

									// Support: Promises/A+ section 2.3.1
									// https://promisesaplus.com/#point-48
									if ( returned === deferred.promise() ) {
										throw new TypeError( "Thenable self-resolution" );
									}

									// Support: Promises/A+ sections 2.3.3.1, 3.5
									// https://promisesaplus.com/#point-54
									// https://promisesaplus.com/#point-75
									// Retrieve `then` only once
									then = returned &&

										// Support: Promises/A+ section 2.3.4
										// https://promisesaplus.com/#point-64
										// Only check objects and functions for thenability
										( typeof returned === "object" ||
											typeof returned === "function" ) &&
										returned.then;

									// Handle a returned thenable
									if ( typeof then === "function" ) {

										// Special processors (notify) just wait for resolution
										if ( special ) {
											then.call(
												returned,
												resolve( maxDepth, deferred, Identity, special ),
												resolve( maxDepth, deferred, Thrower, special )
											);

										// Normal processors (resolve) also hook into progress
										} else {

											// ...and disregard older resolution values
											maxDepth++;

											then.call(
												returned,
												resolve( maxDepth, deferred, Identity, special ),
												resolve( maxDepth, deferred, Thrower, special ),
												resolve( maxDepth, deferred, Identity,
													deferred.notifyWith )
											);
										}

									// Handle all other returned values
									} else {

										// Only substitute handlers pass on context
										// and multiple values (non-spec behavior)
										if ( handler !== Identity ) {
											that = undefined;
											args = [ returned ];
										}

										// Process the value(s)
										// Default process is resolve
										( special || deferred.resolveWith )( that, args );
									}
								},

								// Only normal processors (resolve) catch and reject exceptions
								process = special ?
									mightThrow :
									function() {
										try {
											mightThrow();
										} catch ( e ) {

											if ( jQuery.Deferred.exceptionHook ) {
												jQuery.Deferred.exceptionHook( e,
													process.error );
											}

											// Support: Promises/A+ section 2.3.3.3.4.1
											// https://promisesaplus.com/#point-61
											// Ignore post-resolution exceptions
											if ( depth + 1 >= maxDepth ) {

												// Only substitute handlers pass on context
												// and multiple values (non-spec behavior)
												if ( handler !== Thrower ) {
													that = undefined;
													args = [ e ];
												}

												deferred.rejectWith( that, args );
											}
										}
									};

							// Support: Promises/A+ section 2.3.3.3.1
							// https://promisesaplus.com/#point-57
							// Re-resolve promises immediately to dodge false rejection from
							// subsequent errors
							if ( depth ) {
								process();
							} else {

								// Call an optional hook to record the error, in case of exception
								// since it's otherwise lost when execution goes async
								if ( jQuery.Deferred.getErrorHook ) {
									process.error = jQuery.Deferred.getErrorHook();
								}
								window.setTimeout( process );
							}
						};
					}

					return jQuery.Deferred( function( newDefer ) {

						// progress_handlers.add( ... )
						tuples[ 0 ][ 3 ].add(
							resolve(
								0,
								newDefer,
								typeof onProgress === "function" ?
									onProgress :
									Identity,
								newDefer.notifyWith
							)
						);

						// fulfilled_handlers.add( ... )
						tuples[ 1 ][ 3 ].add(
							resolve(
								0,
								newDefer,
								typeof onFulfilled === "function" ?
									onFulfilled :
									Identity
							)
						);

						// rejected_handlers.add( ... )
						tuples[ 2 ][ 3 ].add(
							resolve(
								0,
								newDefer,
								typeof onRejected === "function" ?
									onRejected :
									Thrower
							)
						);
					} ).promise();
				},

				// Get a promise for this deferred
				// If obj is provided, the promise aspect is added to the object
				promise: function( obj ) {
					return obj != null ? jQuery.extend( obj, promise ) : promise;
				}
			},
			deferred = {};

		// Add list-specific methods
		jQuery.each( tuples, function( i, tuple ) {
			var list = tuple[ 2 ],
				stateString = tuple[ 5 ];

			// promise.progress = list.add
			// promise.done = list.add
			// promise.fail = list.add
			promise[ tuple[ 1 ] ] = list.add;

			// Handle state
			if ( stateString ) {
				list.add(
					function() {

						// state = "resolved" (i.e., fulfilled)
						// state = "rejected"
						state = stateString;
					},

					// rejected_callbacks.disable
					// fulfilled_callbacks.disable
					tuples[ 3 - i ][ 2 ].disable,

					// rejected_handlers.disable
					// fulfilled_handlers.disable
					tuples[ 3 - i ][ 3 ].disable,

					// progress_callbacks.lock
					tuples[ 0 ][ 2 ].lock,

					// progress_handlers.lock
					tuples[ 0 ][ 3 ].lock
				);
			}

			// progress_handlers.fire
			// fulfilled_handlers.fire
			// rejected_handlers.fire
			list.add( tuple[ 3 ].fire );

			// deferred.notify = function() { deferred.notifyWith(...) }
			// deferred.resolve = function() { deferred.resolveWith(...) }
			// deferred.reject = function() { deferred.rejectWith(...) }
			deferred[ tuple[ 0 ] ] = function() {
				deferred[ tuple[ 0 ] + "With" ]( this === deferred ? undefined : this, arguments );
				return this;
			};

			// deferred.notifyWith = list.fireWith
			// deferred.resolveWith = list.fireWith
			// deferred.rejectWith = list.fireWith
			deferred[ tuple[ 0 ] + "With" ] = list.fireWith;
		} );

		// Make the deferred a promise
		promise.promise( deferred );

		// Call given func if any
		if ( func ) {
			func.call( deferred, deferred );
		}

		// All done!
		return deferred;
	},

	// Deferred helper
	when: function( singleValue ) {
		var

			// count of uncompleted subordinates
			remaining = arguments.length,

			// count of unprocessed arguments
			i = remaining,

			// subordinate fulfillment data
			resolveContexts = Array( i ),
			resolveValues = slice.call( arguments ),

			// the primary Deferred
			primary = jQuery.Deferred(),

			// subordinate callback factory
			updateFunc = function( i ) {
				return function( value ) {
					resolveContexts[ i ] = this;
					resolveValues[ i ] = arguments.length > 1 ? slice.call( arguments ) : value;
					if ( !( --remaining ) ) {
						primary.resolveWith( resolveContexts, resolveValues );
					}
				};
			};

		// Single- and empty arguments are adopted like Promise.resolve
		if ( remaining <= 1 ) {
			adoptValue( singleValue, primary.done( updateFunc( i ) ).resolve, primary.reject,
				!remaining );

			// Use .then() to unwrap secondary thenables (cf. gh-3000)
			if ( primary.state() === "pending" ||
				typeof( resolveValues[ i ] && resolveValues[ i ].then ) === "function" ) {

				return primary.then();
			}
		}

		// Multiple arguments are aggregated like Promise.all array elements
		while ( i-- ) {
			adoptValue( resolveValues[ i ], updateFunc( i ), primary.reject );
		}

		return primary.promise();
	}
} );

// These usually indicate a programmer mistake during development,
// warn about them ASAP rather than swallowing them by default.
var rerrorNames = /^(Eval|Internal|Range|Reference|Syntax|Type|URI)Error$/;

// If `jQuery.Deferred.getErrorHook` is defined, `asyncError` is an error
// captured before the async barrier to get the original error cause
// which may otherwise be hidden.
jQuery.Deferred.exceptionHook = function( error, asyncError ) {

	if ( error && rerrorNames.test( error.name ) ) {
		window.console.warn(
			"jQuery.Deferred exception",
			error,
			asyncError
		);
	}
};

jQuery.readyException = function( error ) {
	window.setTimeout( function() {
		throw error;
	} );
};

// The deferred used on DOM ready
var readyList = jQuery.Deferred();

jQuery.fn.ready = function( fn ) {

	readyList
		.then( fn )

		// Wrap jQuery.readyException in a function so that the lookup
		// happens at the time of error handling instead of callback
		// registration.
		.catch( function( error ) {
			jQuery.readyException( error );
		} );

	return this;
};

jQuery.extend( {

	// Is the DOM ready to be used? Set to true once it occurs.
	isReady: false,

	// A counter to track how many items to wait for before
	// the ready event fires. See trac-6781
	readyWait: 1,

	// Handle when the DOM is ready
	ready: function( wait ) {

		// Abort if there are pending holds or we're already ready
		if ( wait === true ? --jQuery.readyWait : jQuery.isReady ) {
			return;
		}

		// Remember that the DOM is ready
		jQuery.isReady = true;

		// If a normal DOM Ready event fired, decrement, and wait if need be
		if ( wait !== true && --jQuery.readyWait > 0 ) {
			return;
		}

		// If there are functions bound, to execute
		readyList.resolveWith( document$1, [ jQuery ] );
	}
} );

jQuery.ready.then = readyList.then;

// The ready event handler and self cleanup method
function completed() {
	document$1.removeEventListener( "DOMContentLoaded", completed );
	window.removeEventListener( "load", completed );
	jQuery.ready();
}

// Catch cases where $(document).ready() is called
// after the browser event has already occurred.
if ( document$1.readyState !== "loading" ) {

	// Handle it asynchronously to allow scripts the opportunity to delay ready
	window.setTimeout( jQuery.ready );

} else {

	// Use the handy event callback
	document$1.addEventListener( "DOMContentLoaded", completed );

	// A fallback to window.onload, that will always work
	window.addEventListener( "load", completed );
}

// Matches dashed string for camelizing
var rdashAlpha = /-([a-z])/g;

// Used by camelCase as callback to replace()
function fcamelCase( _all, letter ) {
	return letter.toUpperCase();
}

// Convert dashed to camelCase
function camelCase( string ) {
	return string.replace( rdashAlpha, fcamelCase );
}

/**
 * Determines whether an object can have data
 */
function acceptData( owner ) {

	// Accepts only:
	//  - Node
	//    - Node.ELEMENT_NODE
	//    - Node.DOCUMENT_NODE
	//  - Object
	//    - Any
	return owner.nodeType === 1 || owner.nodeType === 9 || !( +owner.nodeType );
}

function Data() {
	this.expando = jQuery.expando + Data.uid++;
}

Data.uid = 1;

Data.prototype = {

	cache: function( owner ) {

		// Check if the owner object already has a cache
		var value = owner[ this.expando ];

		// If not, create one
		if ( !value ) {
			value = Object.create( null );

			// We can accept data for non-element nodes in modern browsers,
			// but we should not, see trac-8335.
			// Always return an empty object.
			if ( acceptData( owner ) ) {

				// If it is a node unlikely to be stringify-ed or looped over
				// use plain assignment
				if ( owner.nodeType ) {
					owner[ this.expando ] = value;

				// Otherwise secure it in a non-enumerable property
				// configurable must be true to allow the property to be
				// deleted when data is removed
				} else {
					Object.defineProperty( owner, this.expando, {
						value: value,
						configurable: true
					} );
				}
			}
		}

		return value;
	},
	set: function( owner, data, value ) {
		var prop,
			cache = this.cache( owner );

		// Handle: [ owner, key, value ] args
		// Always use camelCase key (gh-2257)
		if ( typeof data === "string" ) {
			cache[ camelCase( data ) ] = value;

		// Handle: [ owner, { properties } ] args
		} else {

			// Copy the properties one-by-one to the cache object
			for ( prop in data ) {
				cache[ camelCase( prop ) ] = data[ prop ];
			}
		}
		return value;
	},
	get: function( owner, key ) {
		return key === undefined ?
			this.cache( owner ) :

			// Always use camelCase key (gh-2257)
			owner[ this.expando ] && owner[ this.expando ][ camelCase( key ) ];
	},
	access: function( owner, key, value ) {

		// In cases where either:
		//
		//   1. No key was specified
		//   2. A string key was specified, but no value provided
		//
		// Take the "read" path and allow the get method to determine
		// which value to return, respectively either:
		//
		//   1. The entire cache object
		//   2. The data stored at the key
		//
		if ( key === undefined ||
				( ( key && typeof key === "string" ) && value === undefined ) ) {

			return this.get( owner, key );
		}

		// When the key is not a string, or both a key and value
		// are specified, set or extend (existing objects) with either:
		//
		//   1. An object of properties
		//   2. A key and value
		//
		this.set( owner, key, value );

		// Since the "set" path can have two possible entry points
		// return the expected data based on which path was taken[*]
		return value !== undefined ? value : key;
	},
	remove: function( owner, key ) {
		var i,
			cache = owner[ this.expando ];

		if ( cache === undefined ) {
			return;
		}

		if ( key !== undefined ) {

			// Support array or space separated string of keys
			if ( Array.isArray( key ) ) {

				// If key is an array of keys...
				// We always set camelCase keys, so remove that.
				key = key.map( camelCase );
			} else {
				key = camelCase( key );

				// If a key with the spaces exists, use it.
				// Otherwise, create an array by matching non-whitespace
				key = key in cache ?
					[ key ] :
					( key.match( rnothtmlwhite ) || [] );
			}

			i = key.length;

			while ( i-- ) {
				delete cache[ key[ i ] ];
			}
		}

		// Remove the expando if there's no more data
		if ( key === undefined || jQuery.isEmptyObject( cache ) ) {

			// Support: Chrome <=35 - 45+
			// Webkit & Blink performance suffers when deleting properties
			// from DOM nodes, so set to undefined instead
			// https://bugs.chromium.org/p/chromium/issues/detail?id=378607 (bug restricted)
			if ( owner.nodeType ) {
				owner[ this.expando ] = undefined;
			} else {
				delete owner[ this.expando ];
			}
		}
	},
	hasData: function( owner ) {
		var cache = owner[ this.expando ];
		return cache !== undefined && !jQuery.isEmptyObject( cache );
	}
};

var dataPriv = new Data();

var dataUser = new Data();

//	Implementation Summary
//
//	1. Enforce API surface and semantic compatibility with 1.9.x branch
//	2. Improve the module's maintainability by reducing the storage
//		paths to a single mechanism.
//	3. Use the same single mechanism to support "private" and "user" data.
//	4. _Never_ expose "private" data to user code (TODO: Drop _data, _removeData)
//	5. Avoid exposing implementation details on user objects (eg. expando properties)
//	6. Provide a clear path for implementation upgrade to WeakMap in 2014

var rbrace = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,
	rmultiDash = /[A-Z]/g;

function getData( data ) {
	if ( data === "true" ) {
		return true;
	}

	if ( data === "false" ) {
		return false;
	}

	if ( data === "null" ) {
		return null;
	}

	// Only convert to a number if it doesn't change the string
	if ( data === +data + "" ) {
		return +data;
	}

	if ( rbrace.test( data ) ) {
		return JSON.parse( data );
	}

	return data;
}

function dataAttr( elem, key, data ) {
	var name;

	// If nothing was found internally, try to fetch any
	// data from the HTML5 data-* attribute
	if ( data === undefined && elem.nodeType === 1 ) {
		name = "data-" + key.replace( rmultiDash, "-$&" ).toLowerCase();
		data = elem.getAttribute( name );

		if ( typeof data === "string" ) {
			try {
				data = getData( data );
			} catch ( e ) {}

			// Make sure we set the data so it isn't changed later
			dataUser.set( elem, key, data );
		} else {
			data = undefined;
		}
	}
	return data;
}

jQuery.extend( {
	hasData: function( elem ) {
		return dataUser.hasData( elem ) || dataPriv.hasData( elem );
	},

	data: function( elem, name, data ) {
		return dataUser.access( elem, name, data );
	},

	removeData: function( elem, name ) {
		dataUser.remove( elem, name );
	},

	// TODO: Now that all calls to _data and _removeData have been replaced
	// with direct calls to dataPriv methods, these can be deprecated.
	_data: function( elem, name, data ) {
		return dataPriv.access( elem, name, data );
	},

	_removeData: function( elem, name ) {
		dataPriv.remove( elem, name );
	}
} );

jQuery.fn.extend( {
	data: function( key, value ) {
		var i, name, data,
			elem = this[ 0 ],
			attrs = elem && elem.attributes;

		// Gets all values
		if ( key === undefined ) {
			if ( this.length ) {
				data = dataUser.get( elem );

				if ( elem.nodeType === 1 && !dataPriv.get( elem, "hasDataAttrs" ) ) {
					i = attrs.length;
					while ( i-- ) {

						// Support: IE 11+
						// The attrs elements can be null (trac-14894)
						if ( attrs[ i ] ) {
							name = attrs[ i ].name;
							if ( name.indexOf( "data-" ) === 0 ) {
								name = camelCase( name.slice( 5 ) );
								dataAttr( elem, name, data[ name ] );
							}
						}
					}
					dataPriv.set( elem, "hasDataAttrs", true );
				}
			}

			return data;
		}

		// Sets multiple values
		if ( typeof key === "object" ) {
			return this.each( function() {
				dataUser.set( this, key );
			} );
		}

		return access( this, function( value ) {
			var data;

			// The calling jQuery object (element matches) is not empty
			// (and therefore has an element appears at this[ 0 ]) and the
			// `value` parameter was not undefined. An empty jQuery object
			// will result in `undefined` for elem = this[ 0 ] which will
			// throw an exception if an attempt to read a data cache is made.
			if ( elem && value === undefined ) {

				// Attempt to get data from the cache
				// The key will always be camelCased in Data
				data = dataUser.get( elem, key );
				if ( data !== undefined ) {
					return data;
				}

				// Attempt to "discover" the data in
				// HTML5 custom data-* attrs
				data = dataAttr( elem, key );
				if ( data !== undefined ) {
					return data;
				}

				// We tried really hard, but the data doesn't exist.
				return;
			}

			// Set the data...
			this.each( function() {

				// We always store the camelCased key
				dataUser.set( this, key, value );
			} );
		}, null, value, arguments.length > 1, null, true );
	},

	removeData: function( key ) {
		return this.each( function() {
			dataUser.remove( this, key );
		} );
	}
} );

jQuery.extend( {
	queue: function( elem, type, data ) {
		var queue;

		if ( elem ) {
			type = ( type || "fx" ) + "queue";
			queue = dataPriv.get( elem, type );

			// Speed up dequeue by getting out quickly if this is just a lookup
			if ( data ) {
				if ( !queue || Array.isArray( data ) ) {
					queue = dataPriv.set( elem, type, jQuery.makeArray( data ) );
				} else {
					queue.push( data );
				}
			}
			return queue || [];
		}
	},

	dequeue: function( elem, type ) {
		type = type || "fx";

		var queue = jQuery.queue( elem, type ),
			startLength = queue.length,
			fn = queue.shift(),
			hooks = jQuery._queueHooks( elem, type ),
			next = function() {
				jQuery.dequeue( elem, type );
			};

		// If the fx queue is dequeued, always remove the progress sentinel
		if ( fn === "inprogress" ) {
			fn = queue.shift();
			startLength--;
		}

		if ( fn ) {

			// Add a progress sentinel to prevent the fx queue from being
			// automatically dequeued
			if ( type === "fx" ) {
				queue.unshift( "inprogress" );
			}

			// Clear up the last queue stop function
			delete hooks.stop;
			fn.call( elem, next, hooks );
		}

		if ( !startLength && hooks ) {
			hooks.empty.fire();
		}
	},

	// Not public - generate a queueHooks object, or return the current one
	_queueHooks: function( elem, type ) {
		var key = type + "queueHooks";
		return dataPriv.get( elem, key ) || dataPriv.set( elem, key, {
			empty: jQuery.Callbacks( "once memory" ).add( function() {
				dataPriv.remove( elem, [ type + "queue", key ] );
			} )
		} );
	}
} );

jQuery.fn.extend( {
	queue: function( type, data ) {
		var setter = 2;

		if ( typeof type !== "string" ) {
			data = type;
			type = "fx";
			setter--;
		}

		if ( arguments.length < setter ) {
			return jQuery.queue( this[ 0 ], type );
		}

		return data === undefined ?
			this :
			this.each( function() {
				var queue = jQuery.queue( this, type, data );

				// Ensure a hooks for this queue
				jQuery._queueHooks( this, type );

				if ( type === "fx" && queue[ 0 ] !== "inprogress" ) {
					jQuery.dequeue( this, type );
				}
			} );
	},
	dequeue: function( type ) {
		return this.each( function() {
			jQuery.dequeue( this, type );
		} );
	},
	clearQueue: function( type ) {
		return this.queue( type || "fx", [] );
	},

	// Get a promise resolved when queues of a certain type
	// are emptied (fx is the type by default)
	promise: function( type, obj ) {
		var tmp,
			count = 1,
			defer = jQuery.Deferred(),
			elements = this,
			i = this.length,
			resolve = function() {
				if ( !( --count ) ) {
					defer.resolveWith( elements, [ elements ] );
				}
			};

		if ( typeof type !== "string" ) {
			obj = type;
			type = undefined;
		}
		type = type || "fx";

		while ( i-- ) {
			tmp = dataPriv.get( elements[ i ], type + "queueHooks" );
			if ( tmp && tmp.empty ) {
				count++;
				tmp.empty.add( resolve );
			}
		}
		resolve();
		return defer.promise( obj );
	}
} );

var pnum = /[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source;

var rcssNum = new RegExp( "^(?:([+-])=|)(" + pnum + ")([a-z%]*)$", "i" );

var cssExpand = [ "Top", "Right", "Bottom", "Left" ];

// isHiddenWithinTree reports if an element has a non-"none" display style (inline and/or
// through the CSS cascade), which is useful in deciding whether or not to make it visible.
// It differs from the :hidden selector (jQuery.expr.pseudos.hidden) in two important ways:
// * A hidden ancestor does not force an element to be classified as hidden.
// * Being disconnected from the document does not force an element to be classified as hidden.
// These differences improve the behavior of .toggle() et al. when applied to elements that are
// detached or contained within hidden ancestors (gh-2404, gh-2863).
function isHiddenWithinTree( elem, el ) {

	// isHiddenWithinTree might be called from jQuery#filter function;
	// in that case, element will be second argument
	elem = el || elem;

	// Inline style trumps all
	return elem.style.display === "none" ||
		elem.style.display === "" &&
		jQuery.css( elem, "display" ) === "none";
}

var ralphaStart = /^[a-z]/,

	// The regex visualized:
	//
	//                         /----------\
	//                        |            |    /-------\
	//                        |  / Top  \  |   |         |
	//         /--- Border ---+-| Right  |-+---+- Width -+---\
	//        |                 | Bottom |                    |
	//        |                  \ Left /                     |
	//        |                                               |
	//        |                              /----------\     |
	//        |          /-------------\    |            |    |- END
	//        |         |               |   |  / Top  \  |    |
	//        |         |  / Margin  \  |   | | Right  | |    |
	//        |---------+-|           |-+---+-| Bottom |-+----|
	//        |            \ Padding /         \ Left /       |
	// BEGIN -|                                               |
	//        |                /---------\                    |
	//        |               |           |                   |
	//        |               |  / Min \  |    / Width  \     |
	//         \--------------+-|       |-+---|          |---/
	//                           \ Max /       \ Height /
	rautoPx = /^(?:Border(?:Top|Right|Bottom|Left)?(?:Width|)|(?:Margin|Padding)?(?:Top|Right|Bottom|Left)?|(?:Min|Max)?(?:Width|Height))$/;

function isAutoPx( prop ) {

	// The first test is used to ensure that:
	// 1. The prop starts with a lowercase letter (as we uppercase it for the second regex).
	// 2. The prop is not empty.
	return ralphaStart.test( prop ) &&
		rautoPx.test( prop[ 0 ].toUpperCase() + prop.slice( 1 ) );
}

function adjustCSS( elem, prop, valueParts, tween ) {
	var adjusted, scale,
		maxIterations = 20,
		currentValue = tween ?
			function() {
				return tween.cur();
			} :
			function() {
				return jQuery.css( elem, prop, "" );
			},
		initial = currentValue(),
		unit = valueParts && valueParts[ 3 ] || ( isAutoPx( prop ) ? "px" : "" ),

		// Starting value computation is required for potential unit mismatches
		initialInUnit = elem.nodeType &&
			( !isAutoPx( prop ) || unit !== "px" && +initial ) &&
			rcssNum.exec( jQuery.css( elem, prop ) );

	if ( initialInUnit && initialInUnit[ 3 ] !== unit ) {

		// Support: Firefox <=54 - 66+
		// Halve the iteration target value to prevent interference from CSS upper bounds (gh-2144)
		initial = initial / 2;

		// Trust units reported by jQuery.css
		unit = unit || initialInUnit[ 3 ];

		// Iteratively approximate from a nonzero starting point
		initialInUnit = +initial || 1;

		while ( maxIterations-- ) {

			// Evaluate and update our best guess (doubling guesses that zero out).
			// Finish if the scale equals or crosses 1 (making the old*new product non-positive).
			jQuery.style( elem, prop, initialInUnit + unit );
			if ( ( 1 - scale ) * ( 1 - ( scale = currentValue() / initial || 0.5 ) ) <= 0 ) {
				maxIterations = 0;
			}
			initialInUnit = initialInUnit / scale;

		}

		initialInUnit = initialInUnit * 2;
		jQuery.style( elem, prop, initialInUnit + unit );

		// Make sure we update the tween properties later on
		valueParts = valueParts || [];
	}

	if ( valueParts ) {
		initialInUnit = +initialInUnit || +initial || 0;

		// Apply relative offset (+=/-=) if specified
		adjusted = valueParts[ 1 ] ?
			initialInUnit + ( valueParts[ 1 ] + 1 ) * valueParts[ 2 ] :
			+valueParts[ 2 ];
		if ( tween ) {
			tween.unit = unit;
			tween.start = initialInUnit;
			tween.end = adjusted;
		}
	}
	return adjusted;
}

// Matches dashed string for camelizing
var rmsPrefix = /^-ms-/;

// Convert dashed to camelCase, handle vendor prefixes.
// Used by the css & effects modules.
// Support: IE <=9 - 11+
// Microsoft forgot to hump their vendor prefix (trac-9572)
function cssCamelCase( string ) {
	return camelCase( string.replace( rmsPrefix, "ms-" ) );
}

var defaultDisplayMap = {};

function getDefaultDisplay( elem ) {
	var temp,
		doc = elem.ownerDocument,
		nodeName = elem.nodeName,
		display = defaultDisplayMap[ nodeName ];

	if ( display ) {
		return display;
	}

	temp = doc.body.appendChild( doc.createElement( nodeName ) );
	display = jQuery.css( temp, "display" );

	temp.parentNode.removeChild( temp );

	if ( display === "none" ) {
		display = "block";
	}
	defaultDisplayMap[ nodeName ] = display;

	return display;
}

function showHide( elements, show ) {
	var display, elem,
		values = [],
		index = 0,
		length = elements.length;

	// Determine new display value for elements that need to change
	for ( ; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}

		display = elem.style.display;
		if ( show ) {

			// Since we force visibility upon cascade-hidden elements, an immediate (and slow)
			// check is required in this first loop unless we have a nonempty display value (either
			// inline or about-to-be-restored)
			if ( display === "none" ) {
				values[ index ] = dataPriv.get( elem, "display" ) || null;
				if ( !values[ index ] ) {
					elem.style.display = "";
				}
			}
			if ( elem.style.display === "" && isHiddenWithinTree( elem ) ) {
				values[ index ] = getDefaultDisplay( elem );
			}
		} else {
			if ( display !== "none" ) {
				values[ index ] = "none";

				// Remember what we're overwriting
				dataPriv.set( elem, "display", display );
			}
		}
	}

	// Set the display of the elements in a second loop to avoid constant reflow
	for ( index = 0; index < length; index++ ) {
		if ( values[ index ] != null ) {
			elements[ index ].style.display = values[ index ];
		}
	}

	return elements;
}

jQuery.fn.extend( {
	show: function() {
		return showHide( this, true );
	},
	hide: function() {
		return showHide( this );
	},
	toggle: function( state ) {
		if ( typeof state === "boolean" ) {
			return state ? this.show() : this.hide();
		}

		return this.each( function() {
			if ( isHiddenWithinTree( this ) ) {
				jQuery( this ).show();
			} else {
				jQuery( this ).hide();
			}
		} );
	}
} );

var isAttached = function( elem ) {
		return jQuery.contains( elem.ownerDocument, elem ) ||
			elem.getRootNode( composed ) === elem.ownerDocument;
	},
	composed = { composed: true };

// Support: IE 9 - 11+
// Check attachment across shadow DOM boundaries when possible (gh-3504).
// Provide a fallback for browsers without Shadow DOM v1 support.
if ( !documentElement$1.getRootNode ) {
	isAttached = function( elem ) {
		return jQuery.contains( elem.ownerDocument, elem );
	};
}

// rtagName captures the name from the first start tag in a string of HTML
// https://html.spec.whatwg.org/multipage/syntax.html#tag-open-state
// https://html.spec.whatwg.org/multipage/syntax.html#tag-name-state
var rtagName = /<([a-z][^\/\0>\x20\t\r\n\f]*)/i;

var wrapMap = {

	// Table parts need to be wrapped with `<table>` or they're
	// stripped to their contents when put in a div.
	// XHTML parsers do not magically insert elements in the
	// same way that tag soup parsers do, so we cannot shorten
	// this by omitting <tbody> or other required elements.
	thead: [ "table" ],
	col: [ "colgroup", "table" ],
	tr: [ "tbody", "table" ],
	td: [ "tr", "tbody", "table" ]
};

wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
wrapMap.th = wrapMap.td;

function getAll( context, tag ) {

	// Support: IE <=9 - 11+
	// Use typeof to avoid zero-argument method invocation on host objects (trac-15151)
	var ret;

	if ( typeof context.getElementsByTagName !== "undefined" ) {
		ret = context.getElementsByTagName( tag || "*" );

	} else if ( typeof context.querySelectorAll !== "undefined" ) {
		ret = context.querySelectorAll( tag || "*" );

	} else {
		ret = [];
	}

	if ( tag === undefined || tag && nodeName( context, tag ) ) {
		return jQuery.merge( [ context ], ret );
	}

	return ret;
}

var rscriptType = /^$|^module$|\/(?:java|ecma)script/i;

// Mark scripts as having already been evaluated
function setGlobalEval( elems, refElements ) {
	var i = 0,
		l = elems.length;

	for ( ; i < l; i++ ) {
		dataPriv.set(
			elems[ i ],
			"globalEval",
			!refElements || dataPriv.get( refElements[ i ], "globalEval" )
		);
	}
}

var rhtml = /<|&#?\w+;/;

function buildFragment( elems, context, scripts, selection, ignored ) {
	var elem, tmp, tag, wrap, attached, j,
		fragment = context.createDocumentFragment(),
		nodes = [],
		i = 0,
		l = elems.length;

	for ( ; i < l; i++ ) {
		elem = elems[ i ];

		if ( elem || elem === 0 ) {

			// Add nodes directly
			if ( toType( elem ) === "object" && ( elem.nodeType || isArrayLike( elem ) ) ) {
				jQuery.merge( nodes, elem.nodeType ? [ elem ] : elem );

			// Convert non-html into a text node
			} else if ( !rhtml.test( elem ) ) {
				nodes.push( context.createTextNode( elem ) );

			// Convert html into DOM nodes
			} else {
				tmp = tmp || fragment.appendChild( context.createElement( "div" ) );

				// Deserialize a standard representation
				tag = ( rtagName.exec( elem ) || [ "", "" ] )[ 1 ].toLowerCase();
				wrap = wrapMap[ tag ] || arr;

				// Create wrappers & descend into them.
				j = wrap.length;
				while ( --j > -1 ) {
					tmp = tmp.appendChild( context.createElement( wrap[ j ] ) );
				}

				tmp.innerHTML = jQuery.htmlPrefilter( elem );

				jQuery.merge( nodes, tmp.childNodes );

				// Remember the top-level container
				tmp = fragment.firstChild;

				// Ensure the created nodes are orphaned (trac-12392)
				tmp.textContent = "";
			}
		}
	}

	// Remove wrapper from fragment
	fragment.textContent = "";

	i = 0;
	while ( ( elem = nodes[ i++ ] ) ) {

		// Skip elements already in the context collection (trac-4087)
		if ( selection && jQuery.inArray( elem, selection ) > -1 ) {
			if ( ignored ) {
				ignored.push( elem );
			}
			continue;
		}

		attached = isAttached( elem );

		// Append to fragment
		tmp = getAll( fragment.appendChild( elem ), "script" );

		// Preserve script evaluation history
		if ( attached ) {
			setGlobalEval( tmp );
		}

		// Capture executables
		if ( scripts ) {
			j = 0;
			while ( ( elem = tmp[ j++ ] ) ) {
				if ( rscriptType.test( elem.type || "" ) ) {
					scripts.push( elem );
				}
			}
		}
	}

	return fragment;
}

// Replace/restore the type attribute of script elements for safe DOM manipulation
function disableScript( elem ) {
	elem.type = ( elem.getAttribute( "type" ) !== null ) + "/" + elem.type;
	return elem;
}
function restoreScript( elem ) {
	if ( ( elem.type || "" ).slice( 0, 5 ) === "true/" ) {
		elem.type = elem.type.slice( 5 );
	} else {
		elem.removeAttribute( "type" );
	}

	return elem;
}

function domManip( collection, args, callback, ignored ) {

	// Flatten any nested arrays
	args = flat( args );

	var fragment, first, scripts, hasScripts, node, doc,
		i = 0,
		l = collection.length,
		iNoClone = l - 1,
		value = args[ 0 ],
		valueIsFunction = typeof value === "function";

	if ( valueIsFunction ) {
		return collection.each( function( index ) {
			var self = collection.eq( index );
			args[ 0 ] = value.call( this, index, self.html() );
			domManip( self, args, callback, ignored );
		} );
	}

	if ( l ) {
		fragment = buildFragment( args, collection[ 0 ].ownerDocument, false, collection, ignored );
		first = fragment.firstChild;

		if ( fragment.childNodes.length === 1 ) {
			fragment = first;
		}

		// Require either new content or an interest in ignored elements to invoke the callback
		if ( first || ignored ) {
			scripts = jQuery.map( getAll( fragment, "script" ), disableScript );
			hasScripts = scripts.length;

			// Use the original fragment for the last item
			// instead of the first because it can end up
			// being emptied incorrectly in certain situations (trac-8070).
			for ( ; i < l; i++ ) {
				node = fragment;

				if ( i !== iNoClone ) {
					node = jQuery.clone( node, true, true );

					// Keep references to cloned scripts for later restoration
					if ( hasScripts ) {
						jQuery.merge( scripts, getAll( node, "script" ) );
					}
				}

				callback.call( collection[ i ], node, i );
			}

			if ( hasScripts ) {
				doc = scripts[ scripts.length - 1 ].ownerDocument;

				// Re-enable scripts
				jQuery.map( scripts, restoreScript );

				// Evaluate executable scripts on first document insertion
				for ( i = 0; i < hasScripts; i++ ) {
					node = scripts[ i ];
					if ( rscriptType.test( node.type || "" ) &&
						!dataPriv.get( node, "globalEval" ) &&
						jQuery.contains( doc, node ) ) {

						if ( node.src && ( node.type || "" ).toLowerCase()  !== "module" ) {

							// Optional AJAX dependency, but won't run scripts if not present
							if ( jQuery._evalUrl && !node.noModule ) {
								jQuery._evalUrl( node.src, {
									nonce: node.nonce,
									crossOrigin: node.crossOrigin
								}, doc );
							}
						} else {
							DOMEval( node.textContent, node, doc );
						}
					}
				}
			}
		}
	}

	return collection;
}

var rcheckableType = /^(?:checkbox|radio)$/i;

var rtypenamespace = /^([^.]*)(?:\.(.+)|)/;

function returnTrue() {
	return true;
}

function returnFalse() {
	return false;
}

function on( elem, types, selector, data, fn, one ) {
	var origFn, type;

	// Types can be a map of types/handlers
	if ( typeof types === "object" ) {

		// ( types-Object, selector, data )
		if ( typeof selector !== "string" ) {

			// ( types-Object, data )
			data = data || selector;
			selector = undefined;
		}
		for ( type in types ) {
			on( elem, type, selector, data, types[ type ], one );
		}
		return elem;
	}

	if ( data == null && fn == null ) {

		// ( types, fn )
		fn = selector;
		data = selector = undefined;
	} else if ( fn == null ) {
		if ( typeof selector === "string" ) {

			// ( types, selector, fn )
			fn = data;
			data = undefined;
		} else {

			// ( types, data, fn )
			fn = data;
			data = selector;
			selector = undefined;
		}
	}
	if ( fn === false ) {
		fn = returnFalse;
	} else if ( !fn ) {
		return elem;
	}

	if ( one === 1 ) {
		origFn = fn;
		fn = function( event ) {

			// Can use an empty set, since event contains the info
			jQuery().off( event );
			return origFn.apply( this, arguments );
		};

		// Use same guid so caller can remove using origFn
		fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
	}
	return elem.each( function() {
		jQuery.event.add( this, types, fn, data, selector );
	} );
}

/*
 * Helper functions for managing events -- not part of the public interface.
 * Props to Dean Edwards' addEvent library for many of the ideas.
 */
jQuery.event = {

	add: function( elem, types, handler, data, selector ) {

		var handleObjIn, eventHandle, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData = dataPriv.get( elem );

		// Only attach events to objects that accept data
		if ( !acceptData( elem ) ) {
			return;
		}

		// Caller can pass in an object of custom data in lieu of the handler
		if ( handler.handler ) {
			handleObjIn = handler;
			handler = handleObjIn.handler;
			selector = handleObjIn.selector;
		}

		// Ensure that invalid selectors throw exceptions at attach time
		// Evaluate against documentElement in case elem is a non-element node (e.g., document)
		if ( selector ) {
			jQuery.find.matchesSelector( documentElement$1, selector );
		}

		// Make sure that the handler has a unique ID, used to find/remove it later
		if ( !handler.guid ) {
			handler.guid = jQuery.guid++;
		}

		// Init the element's event structure and main handler, if this is the first
		if ( !( events = elemData.events ) ) {
			events = elemData.events = Object.create( null );
		}
		if ( !( eventHandle = elemData.handle ) ) {
			eventHandle = elemData.handle = function( e ) {

				// Discard the second event of a jQuery.event.trigger() and
				// when an event is called after a page has unloaded
				return typeof jQuery !== "undefined" && jQuery.event.triggered !== e.type ?
					jQuery.event.dispatch.apply( elem, arguments ) : undefined;
			};
		}

		// Handle multiple events separated by a space
		types = ( types || "" ).match( rnothtmlwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[ t ] ) || [];
			type = origType = tmp[ 1 ];
			namespaces = ( tmp[ 2 ] || "" ).split( "." ).sort();

			// There *must* be a type, no attaching namespace-only handlers
			if ( !type ) {
				continue;
			}

			// If event changes its type, use the special event handlers for the changed type
			special = jQuery.event.special[ type ] || {};

			// If selector defined, determine special event api type, otherwise given type
			type = ( selector ? special.delegateType : special.bindType ) || type;

			// Update special based on newly reset type
			special = jQuery.event.special[ type ] || {};

			// handleObj is passed to all event handlers
			handleObj = jQuery.extend( {
				type: type,
				origType: origType,
				data: data,
				handler: handler,
				guid: handler.guid,
				selector: selector,
				needsContext: selector && jQuery.expr.match.needsContext.test( selector ),
				namespace: namespaces.join( "." )
			}, handleObjIn );

			// Init the event handler queue if we're the first
			if ( !( handlers = events[ type ] ) ) {
				handlers = events[ type ] = [];
				handlers.delegateCount = 0;

				// Only use addEventListener if the special events handler returns false
				if ( !special.setup ||
					special.setup.call( elem, data, namespaces, eventHandle ) === false ) {

					if ( elem.addEventListener ) {
						elem.addEventListener( type, eventHandle );
					}
				}
			}

			if ( special.add ) {
				special.add.call( elem, handleObj );

				if ( !handleObj.handler.guid ) {
					handleObj.handler.guid = handler.guid;
				}
			}

			// Add to the element's handler list, delegates in front
			if ( selector ) {
				handlers.splice( handlers.delegateCount++, 0, handleObj );
			} else {
				handlers.push( handleObj );
			}
		}

	},

	// Detach an event or set of events from an element
	remove: function( elem, types, handler, selector, mappedTypes ) {

		var j, origCount, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData = dataPriv.hasData( elem ) && dataPriv.get( elem );

		if ( !elemData || !( events = elemData.events ) ) {
			return;
		}

		// Once for each type.namespace in types; type may be omitted
		types = ( types || "" ).match( rnothtmlwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[ t ] ) || [];
			type = origType = tmp[ 1 ];
			namespaces = ( tmp[ 2 ] || "" ).split( "." ).sort();

			// Unbind all events (on this namespace, if provided) for the element
			if ( !type ) {
				for ( type in events ) {
					jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
				}
				continue;
			}

			special = jQuery.event.special[ type ] || {};
			type = ( selector ? special.delegateType : special.bindType ) || type;
			handlers = events[ type ] || [];
			tmp = tmp[ 2 ] &&
				new RegExp( "(^|\\.)" + namespaces.join( "\\.(?:.*\\.|)" ) + "(\\.|$)" );

			// Remove matching events
			origCount = j = handlers.length;
			while ( j-- ) {
				handleObj = handlers[ j ];

				if ( ( mappedTypes || origType === handleObj.origType ) &&
					( !handler || handler.guid === handleObj.guid ) &&
					( !tmp || tmp.test( handleObj.namespace ) ) &&
					( !selector || selector === handleObj.selector ||
						selector === "**" && handleObj.selector ) ) {
					handlers.splice( j, 1 );

					if ( handleObj.selector ) {
						handlers.delegateCount--;
					}
					if ( special.remove ) {
						special.remove.call( elem, handleObj );
					}
				}
			}

			// Remove generic event handler if we removed something and no more handlers exist
			// (avoids potential for endless recursion during removal of special event handlers)
			if ( origCount && !handlers.length ) {
				if ( !special.teardown ||
					special.teardown.call( elem, namespaces, elemData.handle ) === false ) {

					jQuery.removeEvent( elem, type, elemData.handle );
				}

				delete events[ type ];
			}
		}

		// Remove data and the expando if it's no longer used
		if ( jQuery.isEmptyObject( events ) ) {
			dataPriv.remove( elem, "handle events" );
		}
	},

	dispatch: function( nativeEvent ) {

		var i, j, ret, matched, handleObj, handlerQueue,
			args = new Array( arguments.length ),

			// Make a writable jQuery.Event from the native event object
			event = jQuery.event.fix( nativeEvent ),

			handlers = (
				dataPriv.get( this, "events" ) || Object.create( null )
			)[ event.type ] || [],
			special = jQuery.event.special[ event.type ] || {};

		// Use the fix-ed jQuery.Event rather than the (read-only) native event
		args[ 0 ] = event;

		for ( i = 1; i < arguments.length; i++ ) {
			args[ i ] = arguments[ i ];
		}

		event.delegateTarget = this;

		// Call the preDispatch hook for the mapped type, and let it bail if desired
		if ( special.preDispatch && special.preDispatch.call( this, event ) === false ) {
			return;
		}

		// Determine handlers
		handlerQueue = jQuery.event.handlers.call( this, event, handlers );

		// Run delegates first; they may want to stop propagation beneath us
		i = 0;
		while ( ( matched = handlerQueue[ i++ ] ) && !event.isPropagationStopped() ) {
			event.currentTarget = matched.elem;

			j = 0;
			while ( ( handleObj = matched.handlers[ j++ ] ) &&
				!event.isImmediatePropagationStopped() ) {

				// If the event is namespaced, then each handler is only invoked if it is
				// specially universal or its namespaces are a superset of the event's.
				if ( !event.rnamespace || handleObj.namespace === false ||
					event.rnamespace.test( handleObj.namespace ) ) {

					event.handleObj = handleObj;
					event.data = handleObj.data;

					ret = ( ( jQuery.event.special[ handleObj.origType ] || {} ).handle ||
						handleObj.handler ).apply( matched.elem, args );

					if ( ret !== undefined ) {
						if ( ( event.result = ret ) === false ) {
							event.preventDefault();
							event.stopPropagation();
						}
					}
				}
			}
		}

		// Call the postDispatch hook for the mapped type
		if ( special.postDispatch ) {
			special.postDispatch.call( this, event );
		}

		return event.result;
	},

	handlers: function( event, handlers ) {
		var i, handleObj, sel, matchedHandlers, matchedSelectors,
			handlerQueue = [],
			delegateCount = handlers.delegateCount,
			cur = event.target;

		// Find delegate handlers
		if ( delegateCount &&

			// Support: Firefox <=42 - 66+
			// Suppress spec-violating clicks indicating a non-primary pointer button (trac-3861)
			// https://www.w3.org/TR/DOM-Level-3-Events/#event-type-click
			// Support: IE 11+
			// ...but not arrow key "clicks" of radio inputs, which can have `button` -1 (gh-2343)
			!( event.type === "click" && event.button >= 1 ) ) {

			for ( ; cur !== this; cur = cur.parentNode || this ) {

				// Don't check non-elements (trac-13208)
				// Don't process clicks on disabled elements (trac-6911, trac-8165, trac-11382, trac-11764)
				if ( cur.nodeType === 1 && !( event.type === "click" && cur.disabled === true ) ) {
					matchedHandlers = [];
					matchedSelectors = {};
					for ( i = 0; i < delegateCount; i++ ) {
						handleObj = handlers[ i ];

						// Don't conflict with Object.prototype properties (trac-13203)
						sel = handleObj.selector + " ";

						if ( matchedSelectors[ sel ] === undefined ) {
							matchedSelectors[ sel ] = handleObj.needsContext ?
								jQuery( sel, this ).index( cur ) > -1 :
								jQuery.find( sel, this, null, [ cur ] ).length;
						}
						if ( matchedSelectors[ sel ] ) {
							matchedHandlers.push( handleObj );
						}
					}
					if ( matchedHandlers.length ) {
						handlerQueue.push( { elem: cur, handlers: matchedHandlers } );
					}
				}
			}
		}

		// Add the remaining (directly-bound) handlers
		cur = this;
		if ( delegateCount < handlers.length ) {
			handlerQueue.push( { elem: cur, handlers: handlers.slice( delegateCount ) } );
		}

		return handlerQueue;
	},

	addProp: function( name, hook ) {
		Object.defineProperty( jQuery.Event.prototype, name, {
			enumerable: true,
			configurable: true,

			get: typeof hook === "function" ?
				function() {
					if ( this.originalEvent ) {
						return hook( this.originalEvent );
					}
				} :
				function() {
					if ( this.originalEvent ) {
						return this.originalEvent[ name ];
					}
				},

			set: function( value ) {
				Object.defineProperty( this, name, {
					enumerable: true,
					configurable: true,
					writable: true,
					value: value
				} );
			}
		} );
	},

	fix: function( originalEvent ) {
		return originalEvent[ jQuery.expando ] ?
			originalEvent :
			new jQuery.Event( originalEvent );
	},

	special: jQuery.extend( Object.create( null ), {
		load: {

			// Prevent triggered image.load events from bubbling to window.load
			noBubble: true
		},
		click: {

			// Utilize native event to ensure correct state for checkable inputs
			setup: function( data ) {

				// For mutual compressibility with _default, replace `this` access with a local var.
				// `|| data` is dead code meant only to preserve the variable through minification.
				var el = this || data;

				// Claim the first handler
				if ( rcheckableType.test( el.type ) &&
					el.click && nodeName( el, "input" ) ) {

					// dataPriv.set( el, "click", ... )
					leverageNative( el, "click", true );
				}

				// Return false to allow normal processing in the caller
				return false;
			},
			trigger: function( data ) {

				// For mutual compressibility with _default, replace `this` access with a local var.
				// `|| data` is dead code meant only to preserve the variable through minification.
				var el = this || data;

				// Force setup before triggering a click
				if ( rcheckableType.test( el.type ) &&
					el.click && nodeName( el, "input" ) ) {

					leverageNative( el, "click" );
				}

				// Return non-false to allow normal event-path propagation
				return true;
			},

			// For cross-browser consistency, suppress native .click() on links
			// Also prevent it if we're currently inside a leveraged native-event stack
			_default: function( event ) {
				var target = event.target;
				return rcheckableType.test( target.type ) &&
					target.click && nodeName( target, "input" ) &&
					dataPriv.get( target, "click" ) ||
					nodeName( target, "a" );
			}
		},

		beforeunload: {
			postDispatch: function( event ) {

				// Support: Chrome <=73+
				// Chrome doesn't alert on `event.preventDefault()`
				// as the standard mandates.
				if ( event.result !== undefined && event.originalEvent ) {
					event.originalEvent.returnValue = event.result;
				}
			}
		}
	} )
};

// Ensure the presence of an event listener that handles manually-triggered
// synthetic events by interrupting progress until reinvoked in response to
// *native* events that it fires directly, ensuring that state changes have
// already occurred before other listeners are invoked.
function leverageNative( el, type, isSetup ) {

	// Missing `isSetup` indicates a trigger call, which must force setup through jQuery.event.add
	if ( !isSetup ) {
		if ( dataPriv.get( el, type ) === undefined ) {
			jQuery.event.add( el, type, returnTrue );
		}
		return;
	}

	// Register the controller as a special universal handler for all event namespaces
	dataPriv.set( el, type, false );
	jQuery.event.add( el, type, {
		namespace: false,
		handler: function( event ) {
			var result,
				saved = dataPriv.get( this, type );

			// This controller function is invoked under multiple circumstances,
			// differentiated by the stored value in `saved`:
			// 1. For an outer synthetic `.trigger()`ed event (detected by
			//    `event.isTrigger & 1` and non-array `saved`), it records arguments
			//    as an array and fires an [inner] native event to prompt state
			//    changes that should be observed by registered listeners (such as
			//    checkbox toggling and focus updating), then clears the stored value.
			// 2. For an [inner] native event (detected by `saved` being
			//    an array), it triggers an inner synthetic event, records the
			//    result, and preempts propagation to further jQuery listeners.
			// 3. For an inner synthetic event (detected by `event.isTrigger & 1` and
			//    array `saved`), it prevents double-propagation of surrogate events
			//    but otherwise allows everything to proceed (particularly including
			//    further listeners).
			// Possible `saved` data shapes: `[...], `{ value }`, `false`.
			if ( ( event.isTrigger & 1 ) && this[ type ] ) {

				// Interrupt processing of the outer synthetic .trigger()ed event
				if ( !saved.length ) {

					// Store arguments for use when handling the inner native event
					// There will always be at least one argument (an event object),
					// so this array will not be confused with a leftover capture object.
					saved = slice.call( arguments );
					dataPriv.set( this, type, saved );

					// Trigger the native event and capture its result
					this[ type ]();
					result = dataPriv.get( this, type );
					dataPriv.set( this, type, false );

					if ( saved !== result ) {

						// Cancel the outer synthetic event
						event.stopImmediatePropagation();
						event.preventDefault();

						// Support: Chrome 86+
						// In Chrome, if an element having a focusout handler is
						// blurred by clicking outside of it, it invokes the handler
						// synchronously. If that handler calls `.remove()` on
						// the element, the data is cleared, leaving `result`
						// undefined. We need to guard against this.
						return result && result.value;
					}

				// If this is an inner synthetic event for an event with a bubbling
				// surrogate (focus or blur), assume that the surrogate already
				// propagated from triggering the native event and prevent that
				// from happening again here.
				} else if ( ( jQuery.event.special[ type ] || {} ).delegateType ) {
					event.stopPropagation();
				}

			// If this is a native event triggered above, everything is now in order.
			// Fire an inner synthetic event with the original arguments.
			} else if ( saved.length ) {

				// ...and capture the result
				dataPriv.set( this, type, {
					value: jQuery.event.trigger(
						saved[ 0 ],
						saved.slice( 1 ),
						this
					)
				} );

				// Abort handling of the native event by all jQuery handlers while allowing
				// native handlers on the same element to run. On target, this is achieved
				// by stopping immediate propagation just on the jQuery event. However,
				// the native event is re-wrapped by a jQuery one on each level of the
				// propagation so the only way to stop it for jQuery is to stop it for
				// everyone via native `stopPropagation()`. This is not a problem for
				// focus/blur which don't bubble, but it does also stop click on checkboxes
				// and radios. We accept this limitation.
				event.stopPropagation();
				event.isImmediatePropagationStopped = returnTrue;
			}
		}
	} );
}

jQuery.removeEvent = function( elem, type, handle ) {

	// This "if" is needed for plain objects
	if ( elem.removeEventListener ) {
		elem.removeEventListener( type, handle );
	}
};

jQuery.Event = function( src, props ) {

	// Allow instantiation without the 'new' keyword
	if ( !( this instanceof jQuery.Event ) ) {
		return new jQuery.Event( src, props );
	}

	// Event object
	if ( src && src.type ) {
		this.originalEvent = src;
		this.type = src.type;

		// Events bubbling up the document may have been marked as prevented
		// by a handler lower down the tree; reflect the correct value.
		this.isDefaultPrevented = src.defaultPrevented ?
			returnTrue :
			returnFalse;

		// Create target properties
		this.target = src.target;
		this.currentTarget = src.currentTarget;
		this.relatedTarget = src.relatedTarget;

	// Event type
	} else {
		this.type = src;
	}

	// Put explicitly provided properties onto the event object
	if ( props ) {
		jQuery.extend( this, props );
	}

	// Create a timestamp if incoming event doesn't have one
	this.timeStamp = src && src.timeStamp || Date.now();

	// Mark it as fixed
	this[ jQuery.expando ] = true;
};

// jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
// https://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
jQuery.Event.prototype = {
	constructor: jQuery.Event,
	isDefaultPrevented: returnFalse,
	isPropagationStopped: returnFalse,
	isImmediatePropagationStopped: returnFalse,
	isSimulated: false,

	preventDefault: function() {
		var e = this.originalEvent;

		this.isDefaultPrevented = returnTrue;

		if ( e && !this.isSimulated ) {
			e.preventDefault();
		}
	},
	stopPropagation: function() {
		var e = this.originalEvent;

		this.isPropagationStopped = returnTrue;

		if ( e && !this.isSimulated ) {
			e.stopPropagation();
		}
	},
	stopImmediatePropagation: function() {
		var e = this.originalEvent;

		this.isImmediatePropagationStopped = returnTrue;

		if ( e && !this.isSimulated ) {
			e.stopImmediatePropagation();
		}

		this.stopPropagation();
	}
};

// Includes all common event props including KeyEvent and MouseEvent specific props
jQuery.each( {
	altKey: true,
	bubbles: true,
	cancelable: true,
	changedTouches: true,
	ctrlKey: true,
	detail: true,
	eventPhase: true,
	metaKey: true,
	pageX: true,
	pageY: true,
	shiftKey: true,
	view: true,
	"char": true,
	code: true,
	charCode: true,
	key: true,
	keyCode: true,
	button: true,
	buttons: true,
	clientX: true,
	clientY: true,
	offsetX: true,
	offsetY: true,
	pointerId: true,
	pointerType: true,
	screenX: true,
	screenY: true,
	targetTouches: true,
	toElement: true,
	touches: true,
	which: true
}, jQuery.event.addProp );

jQuery.each( { focus: "focusin", blur: "focusout" }, function( type, delegateType ) {

	// Support: IE 11+
	// Attach a single focusin/focusout handler on the document while someone wants focus/blur.
	// This is because the former are synchronous in IE while the latter are async. In other
	// browsers, all those handlers are invoked synchronously.
	function focusMappedHandler( nativeEvent ) {

		// `eventHandle` would already wrap the event, but we need to change the `type` here.
		var event = jQuery.event.fix( nativeEvent );
		event.type = nativeEvent.type === "focusin" ? "focus" : "blur";
		event.isSimulated = true;

		// focus/blur don't bubble while focusin/focusout do; simulate the former by only
		// invoking the handler at the lower level.
		if ( event.target === event.currentTarget ) {

			// The setup part calls `leverageNative`, which, in turn, calls
			// `jQuery.event.add`, so event handle will already have been set
			// by this point.
			dataPriv.get( this, "handle" )( event );
		}
	}

	jQuery.event.special[ type ] = {

		// Utilize native event if possible so blur/focus sequence is correct
		setup: function() {

			// Claim the first handler
			// dataPriv.set( this, "focus", ... )
			// dataPriv.set( this, "blur", ... )
			leverageNative( this, type, true );

			if ( isIE ) {
				this.addEventListener( delegateType, focusMappedHandler );
			} else {

				// Return false to allow normal processing in the caller
				return false;
			}
		},
		trigger: function() {

			// Force setup before trigger
			leverageNative( this, type );

			// Return non-false to allow normal event-path propagation
			return true;
		},

		teardown: function() {
			if ( isIE ) {
				this.removeEventListener( delegateType, focusMappedHandler );
			} else {

				// Return false to indicate standard teardown should be applied
				return false;
			}
		},

		// Suppress native focus or blur if we're currently inside
		// a leveraged native-event stack
		_default: function( event ) {
			return dataPriv.get( event.target, type );
		},

		delegateType: delegateType
	};
} );

// Create mouseenter/leave events using mouseover/out and event-time checks
// so that event delegation works in jQuery.
// Do the same for pointerenter/pointerleave and pointerover/pointerout
jQuery.each( {
	mouseenter: "mouseover",
	mouseleave: "mouseout",
	pointerenter: "pointerover",
	pointerleave: "pointerout"
}, function( orig, fix ) {
	jQuery.event.special[ orig ] = {
		delegateType: fix,
		bindType: fix,

		handle: function( event ) {
			var ret,
				target = this,
				related = event.relatedTarget,
				handleObj = event.handleObj;

			// For mouseenter/leave call the handler if related is outside the target.
			// NB: No relatedTarget if the mouse left/entered the browser window
			if ( !related || ( related !== target && !jQuery.contains( target, related ) ) ) {
				event.type = handleObj.origType;
				ret = handleObj.handler.apply( this, arguments );
				event.type = fix;
			}
			return ret;
		}
	};
} );

jQuery.fn.extend( {

	on: function( types, selector, data, fn ) {
		return on( this, types, selector, data, fn );
	},
	one: function( types, selector, data, fn ) {
		return on( this, types, selector, data, fn, 1 );
	},
	off: function( types, selector, fn ) {
		var handleObj, type;
		if ( types && types.preventDefault && types.handleObj ) {

			// ( event )  dispatched jQuery.Event
			handleObj = types.handleObj;
			jQuery( types.delegateTarget ).off(
				handleObj.namespace ?
					handleObj.origType + "." + handleObj.namespace :
					handleObj.origType,
				handleObj.selector,
				handleObj.handler
			);
			return this;
		}
		if ( typeof types === "object" ) {

			// ( types-object [, selector] )
			for ( type in types ) {
				this.off( type, selector, types[ type ] );
			}
			return this;
		}
		if ( selector === false || typeof selector === "function" ) {

			// ( types [, fn] )
			fn = selector;
			selector = undefined;
		}
		if ( fn === false ) {
			fn = returnFalse;
		}
		return this.each( function() {
			jQuery.event.remove( this, types, fn, selector );
		} );
	}
} );

var

	// Support: IE <=10 - 11+
	// In IE using regex groups here causes severe slowdowns.
	rnoInnerhtml = /<script|<style|<link/i;

// Prefer a tbody over its parent table for containing new rows
function manipulationTarget( elem, content ) {
	if ( nodeName( elem, "table" ) &&
		nodeName( content.nodeType !== 11 ? content : content.firstChild, "tr" ) ) {

		return jQuery( elem ).children( "tbody" )[ 0 ] || elem;
	}

	return elem;
}

function cloneCopyEvent( src, dest ) {
	var type, i, l,
		events = dataPriv.get( src, "events" );

	if ( dest.nodeType !== 1 ) {
		return;
	}

	// 1. Copy private data: events, handlers, etc.
	if ( events ) {
		dataPriv.remove( dest, "handle events" );
		for ( type in events ) {
			for ( i = 0, l = events[ type ].length; i < l; i++ ) {
				jQuery.event.add( dest, type, events[ type ][ i ] );
			}
		}
	}

	// 2. Copy user data
	if ( dataUser.hasData( src ) ) {
		dataUser.set( dest, jQuery.extend( {}, dataUser.get( src ) ) );
	}
}

function remove( elem, selector, keepData ) {
	var node,
		nodes = selector ? jQuery.filter( selector, elem ) : elem,
		i = 0;

	for ( ; ( node = nodes[ i ] ) != null; i++ ) {
		if ( !keepData && node.nodeType === 1 ) {
			jQuery.cleanData( getAll( node ) );
		}

		if ( node.parentNode ) {
			if ( keepData && isAttached( node ) ) {
				setGlobalEval( getAll( node, "script" ) );
			}
			node.parentNode.removeChild( node );
		}
	}

	return elem;
}

jQuery.extend( {
	htmlPrefilter: function( html ) {
		return html;
	},

	clone: function( elem, dataAndEvents, deepDataAndEvents ) {
		var i, l, srcElements, destElements,
			clone = elem.cloneNode( true ),
			inPage = isAttached( elem );

		// Fix IE cloning issues
		if ( isIE && ( elem.nodeType === 1 || elem.nodeType === 11 ) &&
				!jQuery.isXMLDoc( elem ) ) {

			// We eschew jQuery#find here for performance reasons:
			// https://jsperf.com/getall-vs-sizzle/2
			destElements = getAll( clone );
			srcElements = getAll( elem );

			for ( i = 0, l = srcElements.length; i < l; i++ ) {

				// Support: IE <=11+
				// IE fails to set the defaultValue to the correct value when
				// cloning textareas.
				if ( nodeName( destElements[ i ], "textarea" ) ) {
					destElements[ i ].defaultValue = srcElements[ i ].defaultValue;
				}
			}
		}

		// Copy the events from the original to the clone
		if ( dataAndEvents ) {
			if ( deepDataAndEvents ) {
				srcElements = srcElements || getAll( elem );
				destElements = destElements || getAll( clone );

				for ( i = 0, l = srcElements.length; i < l; i++ ) {
					cloneCopyEvent( srcElements[ i ], destElements[ i ] );
				}
			} else {
				cloneCopyEvent( elem, clone );
			}
		}

		// Preserve script evaluation history
		destElements = getAll( clone, "script" );
		if ( destElements.length > 0 ) {
			setGlobalEval( destElements, !inPage && getAll( elem, "script" ) );
		}

		// Return the cloned set
		return clone;
	},

	cleanData: function( elems ) {
		var data, elem, type,
			special = jQuery.event.special,
			i = 0;

		for ( ; ( elem = elems[ i ] ) !== undefined; i++ ) {
			if ( acceptData( elem ) ) {
				if ( ( data = elem[ dataPriv.expando ] ) ) {
					if ( data.events ) {
						for ( type in data.events ) {
							if ( special[ type ] ) {
								jQuery.event.remove( elem, type );

							// This is a shortcut to avoid jQuery.event.remove's overhead
							} else {
								jQuery.removeEvent( elem, type, data.handle );
							}
						}
					}

					// Support: Chrome <=35 - 45+
					// Assign undefined instead of using delete, see Data#remove
					elem[ dataPriv.expando ] = undefined;
				}
				if ( elem[ dataUser.expando ] ) {

					// Support: Chrome <=35 - 45+
					// Assign undefined instead of using delete, see Data#remove
					elem[ dataUser.expando ] = undefined;
				}
			}
		}
	}
} );

jQuery.fn.extend( {
	detach: function( selector ) {
		return remove( this, selector, true );
	},

	remove: function( selector ) {
		return remove( this, selector );
	},

	text: function( value ) {
		return access( this, function( value ) {
			return value === undefined ?
				jQuery.text( this ) :
				this.empty().each( function() {
					if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
						this.textContent = value;
					}
				} );
		}, null, value, arguments.length );
	},

	append: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.appendChild( elem );
			}
		} );
	},

	prepend: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.insertBefore( elem, target.firstChild );
			}
		} );
	},

	before: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this );
			}
		} );
	},

	after: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this.nextSibling );
			}
		} );
	},

	empty: function() {
		var elem,
			i = 0;

		for ( ; ( elem = this[ i ] ) != null; i++ ) {
			if ( elem.nodeType === 1 ) {

				// Prevent memory leaks
				jQuery.cleanData( getAll( elem, false ) );

				// Remove any remaining nodes
				elem.textContent = "";
			}
		}

		return this;
	},

	clone: function( dataAndEvents, deepDataAndEvents ) {
		dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
		deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

		return this.map( function() {
			return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
		} );
	},

	html: function( value ) {
		return access( this, function( value ) {
			var elem = this[ 0 ] || {},
				i = 0,
				l = this.length;

			if ( value === undefined && elem.nodeType === 1 ) {
				return elem.innerHTML;
			}

			// See if we can take a shortcut and just use innerHTML
			if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
				!wrapMap[ ( rtagName.exec( value ) || [ "", "" ] )[ 1 ].toLowerCase() ] ) {

				value = jQuery.htmlPrefilter( value );

				try {
					for ( ; i < l; i++ ) {
						elem = this[ i ] || {};

						// Remove element nodes and prevent memory leaks
						if ( elem.nodeType === 1 ) {
							jQuery.cleanData( getAll( elem, false ) );
							elem.innerHTML = value;
						}
					}

					elem = 0;

				// If using innerHTML throws an exception, use the fallback method
				} catch ( e ) {}
			}

			if ( elem ) {
				this.empty().append( value );
			}
		}, null, value, arguments.length );
	},

	replaceWith: function() {
		var ignored = [];

		// Make the changes, replacing each non-ignored context element with the new content
		return domManip( this, arguments, function( elem ) {
			var parent = this.parentNode;

			if ( jQuery.inArray( this, ignored ) < 0 ) {
				jQuery.cleanData( getAll( this ) );
				if ( parent ) {
					parent.replaceChild( elem, this );
				}
			}

		// Force callback invocation
		}, ignored );
	}
} );

jQuery.each( {
	appendTo: "append",
	prependTo: "prepend",
	insertBefore: "before",
	insertAfter: "after",
	replaceAll: "replaceWith"
}, function( name, original ) {
	jQuery.fn[ name ] = function( selector ) {
		var elems,
			ret = [],
			insert = jQuery( selector ),
			last = insert.length - 1,
			i = 0;

		for ( ; i <= last; i++ ) {
			elems = i === last ? this : this.clone( true );
			jQuery( insert[ i ] )[ original ]( elems );
			push.apply( ret, elems );
		}

		return this.pushStack( ret );
	};
} );

var rnumnonpx = new RegExp( "^(" + pnum + ")(?!px)[a-z%]+$", "i" );

var rcustomProp = /^--/;

function getStyles( elem ) {

	// Support: IE <=11+ (trac-14150)
	// In IE popup's `window` is the opener window which makes `window.getComputedStyle( elem )`
	// break. Using `elem.ownerDocument.defaultView` avoids the issue.
	var view = elem.ownerDocument.defaultView;

	// `document.implementation.createHTMLDocument( "" )` has a `null` `defaultView`
	// property; check `defaultView` truthiness to fallback to window in such a case.
	if ( !view ) {
		view = window;
	}

	return view.getComputedStyle( elem );
}

// A method for quickly swapping in/out CSS properties to get correct calculations.
function swap( elem, options, callback ) {
	var ret, name,
		old = {};

	// Remember the old values, and insert the new ones
	for ( name in options ) {
		old[ name ] = elem.style[ name ];
		elem.style[ name ] = options[ name ];
	}

	ret = callback.call( elem );

	// Revert the old values
	for ( name in options ) {
		elem.style[ name ] = old[ name ];
	}

	return ret;
}

function curCSS( elem, name, computed ) {
	var ret,
		isCustomProp = rcustomProp.test( name );

	computed = computed || getStyles( elem );

	// getPropertyValue is needed for `.css('--customProperty')` (gh-3144)
	if ( computed ) {

		// A fallback to direct property access is needed as `computed`, being
		// the output of `getComputedStyle`, contains camelCased keys and
		// `getPropertyValue` requires kebab-case ones.
		//
		// Support: IE <=9 - 11+
		// IE only supports `"float"` in `getPropertyValue`; in computed styles
		// it's only available as `"cssFloat"`. We no longer modify properties
		// sent to `.css()` apart from camelCasing, so we need to check both.
		// Normally, this would create difference in behavior: if
		// `getPropertyValue` returns an empty string, the value returned
		// by `.css()` would be `undefined`. This is usually the case for
		// disconnected elements. However, in IE even disconnected elements
		// with no styles return `"none"` for `getPropertyValue( "float" )`
		ret = computed.getPropertyValue( name ) || computed[ name ];

		if ( isCustomProp && ret ) {

			// Support: Firefox 105+, Chrome <=105+
			// Spec requires trimming whitespace for custom properties (gh-4926).
			// Firefox only trims leading whitespace. Chrome just collapses
			// both leading & trailing whitespace to a single space.
			//
			// Fall back to `undefined` if empty string returned.
			// This collapses a missing definition with property defined
			// and set to an empty string but there's no standard API
			// allowing us to differentiate them without a performance penalty
			// and returning `undefined` aligns with older jQuery.
			//
			// rtrimCSS treats U+000D CARRIAGE RETURN and U+000C FORM FEED
			// as whitespace while CSS does not, but this is not a problem
			// because CSS preprocessing replaces them with U+000A LINE FEED
			// (which *is* CSS whitespace)
			// https://www.w3.org/TR/css-syntax-3/#input-preprocessing
			ret = ret.replace( rtrimCSS, "$1" ) || undefined;
		}

		if ( ret === "" && !isAttached( elem ) ) {
			ret = jQuery.style( elem, name );
		}
	}

	return ret !== undefined ?

		// Support: IE <=9 - 11+
		// IE returns zIndex value as an integer.
		ret + "" :
		ret;
}

var cssPrefixes = [ "Webkit", "Moz", "ms" ],
	emptyStyle = document$1.createElement( "div" ).style,
	vendorProps = {};

// Return a vendor-prefixed property or undefined
function vendorPropName( name ) {

	// Check for vendor prefixed names
	var capName = name[ 0 ].toUpperCase() + name.slice( 1 ),
		i = cssPrefixes.length;

	while ( i-- ) {
		name = cssPrefixes[ i ] + capName;
		if ( name in emptyStyle ) {
			return name;
		}
	}
}

// Return a potentially-mapped vendor prefixed property
function finalPropName( name ) {
	var final = vendorProps[ name ];

	if ( final ) {
		return final;
	}
	if ( name in emptyStyle ) {
		return name;
	}
	return vendorProps[ name ] = vendorPropName( name ) || name;
}

( function() {

var reliableTrDimensionsVal,
	div = document$1.createElement( "div" );

// Finish early in limited (non-browser) environments
if ( !div.style ) {
	return;
}

// Support: IE 10 - 11+
// IE misreports `getComputedStyle` of table rows with width/height
// set in CSS while `offset*` properties report correct values.
// Support: Firefox 70+
// Only Firefox includes border widths
// in computed dimensions. (gh-4529)
support.reliableTrDimensions = function() {
	var table, tr, trStyle;
	if ( reliableTrDimensionsVal == null ) {
		table = document$1.createElement( "table" );
		tr = document$1.createElement( "tr" );

		table.style.cssText = "position:absolute;left:-11111px;border-collapse:separate";
		tr.style.cssText = "box-sizing:content-box;border:1px solid";

		// Support: Chrome 86+
		// Height set through cssText does not get applied.
		// Computed height then comes back as 0.
		tr.style.height = "1px";
		div.style.height = "9px";

		// Support: Android Chrome 86+
		// In our bodyBackground.html iframe,
		// display for all div elements is set to "inline",
		// which causes a problem only in Android Chrome, but
		// not consistently across all devices.
		// Ensuring the div is `display: block`
		// gets around this issue.
		div.style.display = "block";

		documentElement$1
			.appendChild( table )
			.appendChild( tr )
			.appendChild( div );

		// Don't run until window is visible
		if ( table.offsetWidth === 0 ) {
			documentElement$1.removeChild( table );
			return;
		}

		trStyle = window.getComputedStyle( tr );
		reliableTrDimensionsVal = ( Math.round( parseFloat( trStyle.height ) ) +
			Math.round( parseFloat( trStyle.borderTopWidth ) ) +
			Math.round( parseFloat( trStyle.borderBottomWidth ) ) ) === tr.offsetHeight;

		documentElement$1.removeChild( table );
	}
	return reliableTrDimensionsVal;
};
} )();

var

	// Swappable if display is none or starts with table
	// except "table", "table-cell", or "table-caption"
	// See here for display values: https://developer.mozilla.org/en-US/docs/CSS/display
	rdisplayswap = /^(none|table(?!-c[ea]).+)/,
	cssShow = { position: "absolute", visibility: "hidden", display: "block" },
	cssNormalTransform = {
		letterSpacing: "0",
		fontWeight: "400"
	};

function setPositiveNumber( _elem, value, subtract ) {

	// Any relative (+/-) values have already been
	// normalized at this point
	var matches = rcssNum.exec( value );
	return matches ?

		// Guard against undefined "subtract", e.g., when used as in cssHooks
		Math.max( 0, matches[ 2 ] - ( subtract || 0 ) ) + ( matches[ 3 ] || "px" ) :
		value;
}

function boxModelAdjustment( elem, dimension, box, isBorderBox, styles, computedVal ) {
	var i = dimension === "width" ? 1 : 0,
		extra = 0,
		delta = 0,
		marginDelta = 0;

	// Adjustment may not be necessary
	if ( box === ( isBorderBox ? "border" : "content" ) ) {
		return 0;
	}

	for ( ; i < 4; i += 2 ) {

		// Both box models exclude margin
		// Count margin delta separately to only add it after scroll gutter adjustment.
		// This is needed to make negative margins work with `outerHeight( true )` (gh-3982).
		if ( box === "margin" ) {
			marginDelta += jQuery.css( elem, box + cssExpand[ i ], true, styles );
		}

		// If we get here with a content-box, we're seeking "padding" or "border" or "margin"
		if ( !isBorderBox ) {

			// Add padding
			delta += jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );

			// For "border" or "margin", add border
			if ( box !== "padding" ) {
				delta += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );

			// But still keep track of it otherwise
			} else {
				extra += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}

		// If we get here with a border-box (content + padding + border), we're seeking "content" or
		// "padding" or "margin"
		} else {

			// For "content", subtract padding
			if ( box === "content" ) {
				delta -= jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );
			}

			// For "content" or "padding", subtract border
			if ( box !== "margin" ) {
				delta -= jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		}
	}

	// Account for positive content-box scroll gutter when requested by providing computedVal
	if ( !isBorderBox && computedVal >= 0 ) {

		// offsetWidth/offsetHeight is a rounded sum of content, padding, scroll gutter, and border
		// Assuming integer scroll gutter, subtract the rest and round down
		delta += Math.max( 0, Math.ceil(
			elem[ "offset" + dimension[ 0 ].toUpperCase() + dimension.slice( 1 ) ] -
			computedVal -
			delta -
			extra -
			0.5

		// If offsetWidth/offsetHeight is unknown, then we can't determine content-box scroll gutter
		// Use an explicit zero to avoid NaN (gh-3964)
		) ) || 0;
	}

	return delta + marginDelta;
}

function getWidthOrHeight( elem, dimension, extra ) {

	// Start with computed style
	var styles = getStyles( elem ),

		// To avoid forcing a reflow, only fetch boxSizing if we need it (gh-4322).
		// Fake content-box until we know it's needed to know the true value.
		boxSizingNeeded = isIE || extra,
		isBorderBox = boxSizingNeeded &&
			jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
		valueIsBorderBox = isBorderBox,

		val = curCSS( elem, dimension, styles ),
		offsetProp = "offset" + dimension[ 0 ].toUpperCase() + dimension.slice( 1 );

	// Return a confounding non-pixel value or feign ignorance, as appropriate.
	if ( rnumnonpx.test( val ) ) {
		if ( !extra ) {
			return val;
		}
		val = "auto";
	}


	if ( (

		// Fall back to offsetWidth/offsetHeight when value is "auto"
		// This happens for inline elements with no explicit setting (gh-3571)
		val === "auto" ||

		// Support: IE 9 - 11+
		// Use offsetWidth/offsetHeight for when box sizing is unreliable.
		// In those cases, the computed value can be trusted to be border-box.
		( isIE && isBorderBox ) ||

		// Support: IE 10 - 11+
		// IE misreports `getComputedStyle` of table rows with width/height
		// set in CSS while `offset*` properties report correct values.
		// Support: Firefox 70+
		// Firefox includes border widths
		// in computed dimensions for table rows. (gh-4529)
		( !support.reliableTrDimensions() && nodeName( elem, "tr" ) ) ) &&

		// Make sure the element is visible & connected
		elem.getClientRects().length ) {

		isBorderBox = jQuery.css( elem, "boxSizing", false, styles ) === "border-box";

		// Where available, offsetWidth/offsetHeight approximate border box dimensions.
		// Where not available (e.g., SVG), assume unreliable box-sizing and interpret the
		// retrieved value as a content box dimension.
		valueIsBorderBox = offsetProp in elem;
		if ( valueIsBorderBox ) {
			val = elem[ offsetProp ];
		}
	}

	// Normalize "" and auto
	val = parseFloat( val ) || 0;

	// Adjust for the element's box model
	return ( val +
		boxModelAdjustment(
			elem,
			dimension,
			extra || ( isBorderBox ? "border" : "content" ),
			valueIsBorderBox,
			styles,

			// Provide the current computed size to request scroll gutter calculation (gh-3589)
			val
		)
	) + "px";
}

jQuery.extend( {

	// Add in style property hooks for overriding the default
	// behavior of getting and setting a style property
	cssHooks: {},

	// Get and set the style property on a DOM Node
	style: function( elem, name, value, extra ) {

		// Don't set styles on text and comment nodes
		if ( !elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style ) {
			return;
		}

		// Make sure that we're working with the right name
		var ret, type, hooks,
			origName = cssCamelCase( name ),
			isCustomProp = rcustomProp.test( name ),
			style = elem.style;

		// Make sure that we're working with the right name. We don't
		// want to query the value if it is a CSS custom property
		// since they are user-defined.
		if ( !isCustomProp ) {
			name = finalPropName( origName );
		}

		// Gets hook for the prefixed version, then unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// Check if we're setting a value
		if ( value !== undefined ) {
			type = typeof value;

			// Convert "+=" or "-=" to relative numbers (trac-7345)
			if ( type === "string" && ( ret = rcssNum.exec( value ) ) && ret[ 1 ] ) {
				value = adjustCSS( elem, name, ret );

				// Fixes bug trac-9237
				type = "number";
			}

			// Make sure that null and NaN values aren't set (trac-7116)
			if ( value == null || value !== value ) {
				return;
			}

			// If the value is a number, add `px` for certain CSS properties
			if ( type === "number" ) {
				value += ret && ret[ 3 ] || ( isAutoPx( origName ) ? "px" : "" );
			}

			// Support: IE <=9 - 11+
			// background-* props of a cloned element affect the source element (trac-8908)
			if ( isIE && value === "" && name.indexOf( "background" ) === 0 ) {
				style[ name ] = "inherit";
			}

			// If a hook was provided, use that value, otherwise just set the specified value
			if ( !hooks || !( "set" in hooks ) ||
				( value = hooks.set( elem, value, extra ) ) !== undefined ) {

				if ( isCustomProp ) {
					style.setProperty( name, value );
				} else {
					style[ name ] = value;
				}
			}

		} else {

			// If a hook was provided get the non-computed value from there
			if ( hooks && "get" in hooks &&
				( ret = hooks.get( elem, false, extra ) ) !== undefined ) {

				return ret;
			}

			// Otherwise just get the value from the style object
			return style[ name ];
		}
	},

	css: function( elem, name, extra, styles ) {
		var val, num, hooks,
			origName = cssCamelCase( name ),
			isCustomProp = rcustomProp.test( name );

		// Make sure that we're working with the right name. We don't
		// want to modify the value if it is a CSS custom property
		// since they are user-defined.
		if ( !isCustomProp ) {
			name = finalPropName( origName );
		}

		// Try prefixed name followed by the unprefixed name
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// If a hook was provided get the computed value from there
		if ( hooks && "get" in hooks ) {
			val = hooks.get( elem, true, extra );
		}

		// Otherwise, if a way to get the computed value exists, use that
		if ( val === undefined ) {
			val = curCSS( elem, name, styles );
		}

		// Convert "normal" to computed value
		if ( val === "normal" && name in cssNormalTransform ) {
			val = cssNormalTransform[ name ];
		}

		// Make numeric if forced or a qualifier was provided and val looks numeric
		if ( extra === "" || extra ) {
			num = parseFloat( val );
			return extra === true || isFinite( num ) ? num || 0 : val;
		}

		return val;
	}
} );

jQuery.each( [ "height", "width" ], function( _i, dimension ) {
	jQuery.cssHooks[ dimension ] = {
		get: function( elem, computed, extra ) {
			if ( computed ) {

				// Certain elements can have dimension info if we invisibly show them
				// but it must have a current display style that would benefit
				return rdisplayswap.test( jQuery.css( elem, "display" ) ) &&

					// Support: Safari <=8 - 12+, Chrome <=73+
					// Table columns in WebKit/Blink have non-zero offsetWidth & zero
					// getBoundingClientRect().width unless display is changed.
					// Support: IE <=11+
					// Running getBoundingClientRect on a disconnected node
					// in IE throws an error.
					( !elem.getClientRects().length || !elem.getBoundingClientRect().width ) ?
					swap( elem, cssShow, function() {
						return getWidthOrHeight( elem, dimension, extra );
					} ) :
					getWidthOrHeight( elem, dimension, extra );
			}
		},

		set: function( elem, value, extra ) {
			var matches,
				styles = getStyles( elem ),

				// To avoid forcing a reflow, only fetch boxSizing if we need it (gh-3991)
				isBorderBox = extra &&
					jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
				subtract = extra ?
					boxModelAdjustment(
						elem,
						dimension,
						extra,
						isBorderBox,
						styles
					) :
					0;

			// Convert to pixels if value adjustment is needed
			if ( subtract && ( matches = rcssNum.exec( value ) ) &&
				( matches[ 3 ] || "px" ) !== "px" ) {

				elem.style[ dimension ] = value;
				value = jQuery.css( elem, dimension );
			}

			return setPositiveNumber( elem, value, subtract );
		}
	};
} );

// These hooks are used by animate to expand properties
jQuery.each( {
	margin: "",
	padding: "",
	border: "Width"
}, function( prefix, suffix ) {
	jQuery.cssHooks[ prefix + suffix ] = {
		expand: function( value ) {
			var i = 0,
				expanded = {},

				// Assumes a single number if not a string
				parts = typeof value === "string" ? value.split( " " ) : [ value ];

			for ( ; i < 4; i++ ) {
				expanded[ prefix + cssExpand[ i ] + suffix ] =
					parts[ i ] || parts[ i - 2 ] || parts[ 0 ];
			}

			return expanded;
		}
	};

	if ( prefix !== "margin" ) {
		jQuery.cssHooks[ prefix + suffix ].set = setPositiveNumber;
	}
} );

jQuery.fn.extend( {
	css: function( name, value ) {
		return access( this, function( elem, name, value ) {
			var styles, len,
				map = {},
				i = 0;

			if ( Array.isArray( name ) ) {
				styles = getStyles( elem );
				len = name.length;

				for ( ; i < len; i++ ) {
					map[ name[ i ] ] = jQuery.css( elem, name[ i ], false, styles );
				}

				return map;
			}

			return value !== undefined ?
				jQuery.style( elem, name, value ) :
				jQuery.css( elem, name );
		}, name, value, arguments.length > 1 );
	}
} );

function Tween( elem, options, prop, end, easing ) {
	return new Tween.prototype.init( elem, options, prop, end, easing );
}
jQuery.Tween = Tween;

Tween.prototype = {
	constructor: Tween,
	init: function( elem, options, prop, end, easing, unit ) {
		this.elem = elem;
		this.prop = prop;
		this.easing = easing || jQuery.easing._default;
		this.options = options;
		this.start = this.now = this.cur();
		this.end = end;
		this.unit = unit || ( isAutoPx( prop ) ? "px" : "" );
	},
	cur: function() {
		var hooks = Tween.propHooks[ this.prop ];

		return hooks && hooks.get ?
			hooks.get( this ) :
			Tween.propHooks._default.get( this );
	},
	run: function( percent ) {
		var eased,
			hooks = Tween.propHooks[ this.prop ];

		if ( this.options.duration ) {
			this.pos = eased = jQuery.easing[ this.easing ](
				percent, this.options.duration * percent, 0, 1, this.options.duration
			);
		} else {
			this.pos = eased = percent;
		}
		this.now = ( this.end - this.start ) * eased + this.start;

		if ( this.options.step ) {
			this.options.step.call( this.elem, this.now, this );
		}

		if ( hooks && hooks.set ) {
			hooks.set( this );
		} else {
			Tween.propHooks._default.set( this );
		}
		return this;
	}
};

Tween.prototype.init.prototype = Tween.prototype;

Tween.propHooks = {
	_default: {
		get: function( tween ) {
			var result;

			// Use a property on the element directly when it is not a DOM element,
			// or when there is no matching style property that exists.
			if ( tween.elem.nodeType !== 1 ||
				tween.elem[ tween.prop ] != null && tween.elem.style[ tween.prop ] == null ) {
				return tween.elem[ tween.prop ];
			}

			// Passing an empty string as a 3rd parameter to .css will automatically
			// attempt a parseFloat and fallback to a string if the parse fails.
			// Simple values such as "10px" are parsed to Float;
			// complex values such as "rotate(1rad)" are returned as-is.
			result = jQuery.css( tween.elem, tween.prop, "" );

			// Empty strings, null, undefined and "auto" are converted to 0.
			return !result || result === "auto" ? 0 : result;
		},
		set: function( tween ) {

			// Use step hook for back compat.
			// Use cssHook if its there.
			// Use .style if available and use plain properties where available.
			if ( jQuery.fx.step[ tween.prop ] ) {
				jQuery.fx.step[ tween.prop ]( tween );
			} else if ( tween.elem.nodeType === 1 && (
				jQuery.cssHooks[ tween.prop ] ||
					tween.elem.style[ finalPropName( tween.prop ) ] != null ) ) {
				jQuery.style( tween.elem, tween.prop, tween.now + tween.unit );
			} else {
				tween.elem[ tween.prop ] = tween.now;
			}
		}
	}
};

jQuery.easing = {
	linear: function( p ) {
		return p;
	},
	swing: function( p ) {
		return 0.5 - Math.cos( p * Math.PI ) / 2;
	},
	_default: "swing"
};

jQuery.fx = Tween.prototype.init;

// Back compat <1.8 extension point
jQuery.fx.step = {};

var
	fxNow, inProgress,
	rfxtypes = /^(?:toggle|show|hide)$/,
	rrun = /queueHooks$/;

function schedule() {
	if ( inProgress ) {
		if ( document$1.hidden === false && window.requestAnimationFrame ) {
			window.requestAnimationFrame( schedule );
		} else {
			window.setTimeout( schedule, 13 );
		}

		jQuery.fx.tick();
	}
}

// Animations created synchronously will run synchronously
function createFxNow() {
	window.setTimeout( function() {
		fxNow = undefined;
	} );
	return ( fxNow = Date.now() );
}

// Generate parameters to create a standard animation
function genFx( type, includeWidth ) {
	var which,
		i = 0,
		attrs = { height: type };

	// If we include width, step value is 1 to do all cssExpand values,
	// otherwise step value is 2 to skip over Left and Right
	includeWidth = includeWidth ? 1 : 0;
	for ( ; i < 4; i += 2 - includeWidth ) {
		which = cssExpand[ i ];
		attrs[ "margin" + which ] = attrs[ "padding" + which ] = type;
	}

	if ( includeWidth ) {
		attrs.opacity = attrs.width = type;
	}

	return attrs;
}

function createTween( value, prop, animation ) {
	var tween,
		collection = ( Animation.tweeners[ prop ] || [] ).concat( Animation.tweeners[ "*" ] ),
		index = 0,
		length = collection.length;
	for ( ; index < length; index++ ) {
		if ( ( tween = collection[ index ].call( animation, prop, value ) ) ) {

			// We're done with this property
			return tween;
		}
	}
}

function defaultPrefilter( elem, props, opts ) {
	var prop, value, toggle, hooks, oldfire, propTween, restoreDisplay, display,
		isBox = "width" in props || "height" in props,
		anim = this,
		orig = {},
		style = elem.style,
		hidden = elem.nodeType && isHiddenWithinTree( elem ),
		dataShow = dataPriv.get( elem, "fxshow" );

	// Queue-skipping animations hijack the fx hooks
	if ( !opts.queue ) {
		hooks = jQuery._queueHooks( elem, "fx" );
		if ( hooks.unqueued == null ) {
			hooks.unqueued = 0;
			oldfire = hooks.empty.fire;
			hooks.empty.fire = function() {
				if ( !hooks.unqueued ) {
					oldfire();
				}
			};
		}
		hooks.unqueued++;

		anim.always( function() {

			// Ensure the complete handler is called before this completes
			anim.always( function() {
				hooks.unqueued--;
				if ( !jQuery.queue( elem, "fx" ).length ) {
					hooks.empty.fire();
				}
			} );
		} );
	}

	// Detect show/hide animations
	for ( prop in props ) {
		value = props[ prop ];
		if ( rfxtypes.test( value ) ) {
			delete props[ prop ];
			toggle = toggle || value === "toggle";
			if ( value === ( hidden ? "hide" : "show" ) ) {

				// Pretend to be hidden if this is a "show" and
				// there is still data from a stopped show/hide
				if ( value === "show" && dataShow && dataShow[ prop ] !== undefined ) {
					hidden = true;

				// Ignore all other no-op show/hide data
				} else {
					continue;
				}
			}
			orig[ prop ] = dataShow && dataShow[ prop ] || jQuery.style( elem, prop );
		}
	}

	// Bail out if this is a no-op like .hide().hide()
	propTween = !jQuery.isEmptyObject( props );
	if ( !propTween && jQuery.isEmptyObject( orig ) ) {
		return;
	}

	// Restrict "overflow" and "display" styles during box animations
	if ( isBox && elem.nodeType === 1 ) {

		// Support: IE <=9 - 11+
		// Record all 3 overflow attributes because IE does not infer the shorthand
		// from identically-valued overflowX and overflowY.
		opts.overflow = [ style.overflow, style.overflowX, style.overflowY ];

		// Identify a display type, preferring old show/hide data over the CSS cascade
		restoreDisplay = dataShow && dataShow.display;
		if ( restoreDisplay == null ) {
			restoreDisplay = dataPriv.get( elem, "display" );
		}
		display = jQuery.css( elem, "display" );
		if ( display === "none" ) {
			if ( restoreDisplay ) {
				display = restoreDisplay;
			} else {

				// Get nonempty value(s) by temporarily forcing visibility
				showHide( [ elem ], true );
				restoreDisplay = elem.style.display || restoreDisplay;
				display = jQuery.css( elem, "display" );
				showHide( [ elem ] );
			}
		}

		// Animate inline elements as inline-block
		if ( display === "inline" || display === "inline-block" && restoreDisplay != null ) {
			if ( jQuery.css( elem, "float" ) === "none" ) {

				// Restore the original display value at the end of pure show/hide animations
				if ( !propTween ) {
					anim.done( function() {
						style.display = restoreDisplay;
					} );
					if ( restoreDisplay == null ) {
						display = style.display;
						restoreDisplay = display === "none" ? "" : display;
					}
				}
				style.display = "inline-block";
			}
		}
	}

	if ( opts.overflow ) {
		style.overflow = "hidden";
		anim.always( function() {
			style.overflow = opts.overflow[ 0 ];
			style.overflowX = opts.overflow[ 1 ];
			style.overflowY = opts.overflow[ 2 ];
		} );
	}

	// Implement show/hide animations
	propTween = false;
	for ( prop in orig ) {

		// General show/hide setup for this element animation
		if ( !propTween ) {
			if ( dataShow ) {
				if ( "hidden" in dataShow ) {
					hidden = dataShow.hidden;
				}
			} else {
				dataShow = dataPriv.set( elem, "fxshow", { display: restoreDisplay } );
			}

			// Store hidden/visible for toggle so `.stop().toggle()` "reverses"
			if ( toggle ) {
				dataShow.hidden = !hidden;
			}

			// Show elements before animating them
			if ( hidden ) {
				showHide( [ elem ], true );
			}

			// eslint-disable-next-line no-loop-func
			anim.done( function() {

				// The final step of a "hide" animation is actually hiding the element
				if ( !hidden ) {
					showHide( [ elem ] );
				}
				dataPriv.remove( elem, "fxshow" );
				for ( prop in orig ) {
					jQuery.style( elem, prop, orig[ prop ] );
				}
			} );
		}

		// Per-property setup
		propTween = createTween( hidden ? dataShow[ prop ] : 0, prop, anim );
		if ( !( prop in dataShow ) ) {
			dataShow[ prop ] = propTween.start;
			if ( hidden ) {
				propTween.end = propTween.start;
				propTween.start = 0;
			}
		}
	}
}

function propFilter( props, specialEasing ) {
	var index, name, easing, value, hooks;

	// camelCase, specialEasing and expand cssHook pass
	for ( index in props ) {
		name = cssCamelCase( index );
		easing = specialEasing[ name ];
		value = props[ index ];
		if ( Array.isArray( value ) ) {
			easing = value[ 1 ];
			value = props[ index ] = value[ 0 ];
		}

		if ( index !== name ) {
			props[ name ] = value;
			delete props[ index ];
		}

		hooks = jQuery.cssHooks[ name ];
		if ( hooks && "expand" in hooks ) {
			value = hooks.expand( value );
			delete props[ name ];

			// Not quite $.extend, this won't overwrite existing keys.
			// Reusing 'index' because we have the correct "name"
			for ( index in value ) {
				if ( !( index in props ) ) {
					props[ index ] = value[ index ];
					specialEasing[ index ] = easing;
				}
			}
		} else {
			specialEasing[ name ] = easing;
		}
	}
}

function Animation( elem, properties, options ) {
	var result,
		stopped,
		index = 0,
		length = Animation.prefilters.length,
		deferred = jQuery.Deferred().always( function() {

			// Don't match elem in the :animated selector
			delete tick.elem;
		} ),
		tick = function() {
			if ( stopped ) {
				return false;
			}
			var currentTime = fxNow || createFxNow(),
				remaining = Math.max( 0, animation.startTime + animation.duration - currentTime ),

				percent = 1 - ( remaining / animation.duration || 0 ),
				index = 0,
				length = animation.tweens.length;

			for ( ; index < length; index++ ) {
				animation.tweens[ index ].run( percent );
			}

			deferred.notifyWith( elem, [ animation, percent, remaining ] );

			// If there's more to do, yield
			if ( percent < 1 && length ) {
				return remaining;
			}

			// If this was an empty animation, synthesize a final progress notification
			if ( !length ) {
				deferred.notifyWith( elem, [ animation, 1, 0 ] );
			}

			// Resolve the animation and report its conclusion
			deferred.resolveWith( elem, [ animation ] );
			return false;
		},
		animation = deferred.promise( {
			elem: elem,
			props: jQuery.extend( {}, properties ),
			opts: jQuery.extend( true, {
				specialEasing: {},
				easing: jQuery.easing._default
			}, options ),
			originalProperties: properties,
			originalOptions: options,
			startTime: fxNow || createFxNow(),
			duration: options.duration,
			tweens: [],
			createTween: function( prop, end ) {
				var tween = jQuery.Tween( elem, animation.opts, prop, end,
					animation.opts.specialEasing[ prop ] || animation.opts.easing );
				animation.tweens.push( tween );
				return tween;
			},
			stop: function( gotoEnd ) {
				var index = 0,

					// If we are going to the end, we want to run all the tweens
					// otherwise we skip this part
					length = gotoEnd ? animation.tweens.length : 0;
				if ( stopped ) {
					return this;
				}
				stopped = true;
				for ( ; index < length; index++ ) {
					animation.tweens[ index ].run( 1 );
				}

				// Resolve when we played the last frame; otherwise, reject
				if ( gotoEnd ) {
					deferred.notifyWith( elem, [ animation, 1, 0 ] );
					deferred.resolveWith( elem, [ animation, gotoEnd ] );
				} else {
					deferred.rejectWith( elem, [ animation, gotoEnd ] );
				}
				return this;
			}
		} ),
		props = animation.props;

	propFilter( props, animation.opts.specialEasing );

	for ( ; index < length; index++ ) {
		result = Animation.prefilters[ index ].call( animation, elem, props, animation.opts );
		if ( result ) {
			if ( typeof result.stop === "function" ) {
				jQuery._queueHooks( animation.elem, animation.opts.queue ).stop =
					result.stop.bind( result );
			}
			return result;
		}
	}

	jQuery.map( props, createTween, animation );

	if ( typeof animation.opts.start === "function" ) {
		animation.opts.start.call( elem, animation );
	}

	// Attach callbacks from options
	animation
		.progress( animation.opts.progress )
		.done( animation.opts.done, animation.opts.complete )
		.fail( animation.opts.fail )
		.always( animation.opts.always );

	jQuery.fx.timer(
		jQuery.extend( tick, {
			elem: elem,
			anim: animation,
			queue: animation.opts.queue
		} )
	);

	return animation;
}

jQuery.Animation = jQuery.extend( Animation, {

	tweeners: {
		"*": [ function( prop, value ) {
			var tween = this.createTween( prop, value );
			adjustCSS( tween.elem, prop, rcssNum.exec( value ), tween );
			return tween;
		} ]
	},

	tweener: function( props, callback ) {
		if ( typeof props === "function" ) {
			callback = props;
			props = [ "*" ];
		} else {
			props = props.match( rnothtmlwhite );
		}

		var prop,
			index = 0,
			length = props.length;

		for ( ; index < length; index++ ) {
			prop = props[ index ];
			Animation.tweeners[ prop ] = Animation.tweeners[ prop ] || [];
			Animation.tweeners[ prop ].unshift( callback );
		}
	},

	prefilters: [ defaultPrefilter ],

	prefilter: function( callback, prepend ) {
		if ( prepend ) {
			Animation.prefilters.unshift( callback );
		} else {
			Animation.prefilters.push( callback );
		}
	}
} );

jQuery.speed = function( speed, easing, fn ) {
	var opt = speed && typeof speed === "object" ? jQuery.extend( {}, speed ) : {
		complete: fn || easing ||
			typeof speed === "function" && speed,
		duration: speed,
		easing: fn && easing || easing && typeof easing !== "function" && easing
	};

	// Go to the end state if fx are off
	if ( jQuery.fx.off ) {
		opt.duration = 0;

	} else {
		if ( typeof opt.duration !== "number" ) {
			if ( opt.duration in jQuery.fx.speeds ) {
				opt.duration = jQuery.fx.speeds[ opt.duration ];

			} else {
				opt.duration = jQuery.fx.speeds._default;
			}
		}
	}

	// Normalize opt.queue - true/undefined/null -> "fx"
	if ( opt.queue == null || opt.queue === true ) {
		opt.queue = "fx";
	}

	// Queueing
	opt.old = opt.complete;

	opt.complete = function() {
		if ( typeof opt.old === "function" ) {
			opt.old.call( this );
		}

		if ( opt.queue ) {
			jQuery.dequeue( this, opt.queue );
		}
	};

	return opt;
};

jQuery.fn.extend( {
	fadeTo: function( speed, to, easing, callback ) {

		// Show any hidden elements after setting opacity to 0
		return this.filter( isHiddenWithinTree ).css( "opacity", 0 ).show()

			// Animate to the value specified
			.end().animate( { opacity: to }, speed, easing, callback );
	},
	animate: function( prop, speed, easing, callback ) {
		var empty = jQuery.isEmptyObject( prop ),
			optall = jQuery.speed( speed, easing, callback ),
			doAnimation = function() {

				// Operate on a copy of prop so per-property easing won't be lost
				var anim = Animation( this, jQuery.extend( {}, prop ), optall );

				// Empty animations, or finishing resolves immediately
				if ( empty || dataPriv.get( this, "finish" ) ) {
					anim.stop( true );
				}
			};

		doAnimation.finish = doAnimation;

		return empty || optall.queue === false ?
			this.each( doAnimation ) :
			this.queue( optall.queue, doAnimation );
	},
	stop: function( type, clearQueue, gotoEnd ) {
		var stopQueue = function( hooks ) {
			var stop = hooks.stop;
			delete hooks.stop;
			stop( gotoEnd );
		};

		if ( typeof type !== "string" ) {
			gotoEnd = clearQueue;
			clearQueue = type;
			type = undefined;
		}
		if ( clearQueue ) {
			this.queue( type || "fx", [] );
		}

		return this.each( function() {
			var dequeue = true,
				index = type != null && type + "queueHooks",
				timers = jQuery.timers,
				data = dataPriv.get( this );

			if ( index ) {
				if ( data[ index ] && data[ index ].stop ) {
					stopQueue( data[ index ] );
				}
			} else {
				for ( index in data ) {
					if ( data[ index ] && data[ index ].stop && rrun.test( index ) ) {
						stopQueue( data[ index ] );
					}
				}
			}

			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this &&
					( type == null || timers[ index ].queue === type ) ) {

					timers[ index ].anim.stop( gotoEnd );
					dequeue = false;
					timers.splice( index, 1 );
				}
			}

			// Start the next in the queue if the last step wasn't forced.
			// Timers currently will call their complete callbacks, which
			// will dequeue but only if they were gotoEnd.
			if ( dequeue || !gotoEnd ) {
				jQuery.dequeue( this, type );
			}
		} );
	},
	finish: function( type ) {
		if ( type !== false ) {
			type = type || "fx";
		}
		return this.each( function() {
			var index,
				data = dataPriv.get( this ),
				queue = data[ type + "queue" ],
				hooks = data[ type + "queueHooks" ],
				timers = jQuery.timers,
				length = queue ? queue.length : 0;

			// Enable finishing flag on private data
			data.finish = true;

			// Empty the queue first
			jQuery.queue( this, type, [] );

			if ( hooks && hooks.stop ) {
				hooks.stop.call( this, true );
			}

			// Look for any active animations, and finish them
			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && timers[ index ].queue === type ) {
					timers[ index ].anim.stop( true );
					timers.splice( index, 1 );
				}
			}

			// Look for any animations in the old queue and finish them
			for ( index = 0; index < length; index++ ) {
				if ( queue[ index ] && queue[ index ].finish ) {
					queue[ index ].finish.call( this );
				}
			}

			// Turn off finishing flag
			delete data.finish;
		} );
	}
} );

jQuery.each( [ "toggle", "show", "hide" ], function( _i, name ) {
	var cssFn = jQuery.fn[ name ];
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return speed == null || typeof speed === "boolean" ?
			cssFn.apply( this, arguments ) :
			this.animate( genFx( name, true ), speed, easing, callback );
	};
} );

// Generate shortcuts for custom animations
jQuery.each( {
	slideDown: genFx( "show" ),
	slideUp: genFx( "hide" ),
	slideToggle: genFx( "toggle" ),
	fadeIn: { opacity: "show" },
	fadeOut: { opacity: "hide" },
	fadeToggle: { opacity: "toggle" }
}, function( name, props ) {
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return this.animate( props, speed, easing, callback );
	};
} );

jQuery.timers = [];
jQuery.fx.tick = function() {
	var timer,
		i = 0,
		timers = jQuery.timers;

	fxNow = Date.now();

	for ( ; i < timers.length; i++ ) {
		timer = timers[ i ];

		// Run the timer and safely remove it when done (allowing for external removal)
		if ( !timer() && timers[ i ] === timer ) {
			timers.splice( i--, 1 );
		}
	}

	if ( !timers.length ) {
		jQuery.fx.stop();
	}
	fxNow = undefined;
};

jQuery.fx.timer = function( timer ) {
	jQuery.timers.push( timer );
	jQuery.fx.start();
};

jQuery.fx.start = function() {
	if ( inProgress ) {
		return;
	}

	inProgress = true;
	schedule();
};

jQuery.fx.stop = function() {
	inProgress = null;
};

jQuery.fx.speeds = {
	slow: 600,
	fast: 200,

	// Default speed
	_default: 400
};

// Based off of the plugin by Clint Helfers, with permission.
jQuery.fn.delay = function( time, type ) {
	time = jQuery.fx ? jQuery.fx.speeds[ time ] || time : time;
	type = type || "fx";

	return this.queue( type, function( next, hooks ) {
		var timeout = window.setTimeout( next, time );
		hooks.stop = function() {
			window.clearTimeout( timeout );
		};
	} );
};

var rfocusable = /^(?:input|select|textarea|button)$/i,
	rclickable = /^(?:a|area)$/i;

jQuery.fn.extend( {
	prop: function( name, value ) {
		return access( this, jQuery.prop, name, value, arguments.length > 1 );
	},

	removeProp: function( name ) {
		return this.each( function() {
			delete this[ jQuery.propFix[ name ] || name ];
		} );
	}
} );

jQuery.extend( {
	prop: function( elem, name, value ) {
		var ret, hooks,
			nType = elem.nodeType;

		// Don't get/set properties on text, comment and attribute nodes
		if ( nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		if ( nType !== 1 || !jQuery.isXMLDoc( elem ) ) {

			// Fix name and attach hooks
			name = jQuery.propFix[ name ] || name;
			hooks = jQuery.propHooks[ name ];
		}

		if ( value !== undefined ) {
			if ( hooks && "set" in hooks &&
				( ret = hooks.set( elem, value, name ) ) !== undefined ) {
				return ret;
			}

			return ( elem[ name ] = value );
		}

		if ( hooks && "get" in hooks && ( ret = hooks.get( elem, name ) ) !== null ) {
			return ret;
		}

		return elem[ name ];
	},

	propHooks: {
		tabIndex: {
			get: function( elem ) {

				// Support: IE <=9 - 11+
				// elem.tabIndex doesn't always return the
				// correct value when it hasn't been explicitly set
				// Use proper attribute retrieval (trac-12072)
				var tabindex = elem.getAttribute( "tabindex" );

				if ( tabindex ) {
					return parseInt( tabindex, 10 );
				}

				if (
					rfocusable.test( elem.nodeName ) ||

					// href-less anchor's `tabIndex` property value is `0` and
					// the `tabindex` attribute value: `null`. We want `-1`.
					rclickable.test( elem.nodeName ) && elem.href
				) {
					return 0;
				}

				return -1;
			}
		}
	},

	propFix: {
		"for": "htmlFor",
		"class": "className"
	}
} );

// Support: IE <=11+
// Accessing the selectedIndex property forces the browser to respect
// setting selected on the option. The getter ensures a default option
// is selected when in an optgroup. ESLint rule "no-unused-expressions"
// is disabled for this code since it considers such accessions noop.
if ( isIE ) {
	jQuery.propHooks.selected = {
		get: function( elem ) {

			var parent = elem.parentNode;
			if ( parent && parent.parentNode ) {
				// eslint-disable-next-line no-unused-expressions
				parent.parentNode.selectedIndex;
			}
			return null;
		},
		set: function( elem ) {


			var parent = elem.parentNode;
			if ( parent ) {
				// eslint-disable-next-line no-unused-expressions
				parent.selectedIndex;

				if ( parent.parentNode ) {
					// eslint-disable-next-line no-unused-expressions
					parent.parentNode.selectedIndex;
				}
			}
		}
	};
}

jQuery.each( [
	"tabIndex",
	"readOnly",
	"maxLength",
	"cellSpacing",
	"cellPadding",
	"rowSpan",
	"colSpan",
	"useMap",
	"frameBorder",
	"contentEditable"
], function() {
	jQuery.propFix[ this.toLowerCase() ] = this;
} );

// Strip and collapse whitespace according to HTML spec
// https://infra.spec.whatwg.org/#strip-and-collapse-ascii-whitespace
function stripAndCollapse( value ) {
	var tokens = value.match( rnothtmlwhite ) || [];
	return tokens.join( " " );
}

function getClass( elem ) {
	return elem.getAttribute && elem.getAttribute( "class" ) || "";
}

function classesToArray( value ) {
	if ( Array.isArray( value ) ) {
		return value;
	}
	if ( typeof value === "string" ) {
		return value.match( rnothtmlwhite ) || [];
	}
	return [];
}

jQuery.fn.extend( {
	addClass: function( value ) {
		var classNames, cur, curValue, className, i, finalValue;

		if ( typeof value === "function" ) {
			return this.each( function( j ) {
				jQuery( this ).addClass( value.call( this, j, getClass( this ) ) );
			} );
		}

		classNames = classesToArray( value );

		if ( classNames.length ) {
			return this.each( function() {
				curValue = getClass( this );
				cur = this.nodeType === 1 && ( " " + stripAndCollapse( curValue ) + " " );

				if ( cur ) {
					for ( i = 0; i < classNames.length; i++ ) {
						className = classNames[ i ];
						if ( cur.indexOf( " " + className + " " ) < 0 ) {
							cur += className + " ";
						}
					}

					// Only assign if different to avoid unneeded rendering.
					finalValue = stripAndCollapse( cur );
					if ( curValue !== finalValue ) {
						this.setAttribute( "class", finalValue );
					}
				}
			} );
		}

		return this;
	},

	removeClass: function( value ) {
		var classNames, cur, curValue, className, i, finalValue;

		if ( typeof value === "function" ) {
			return this.each( function( j ) {
				jQuery( this ).removeClass( value.call( this, j, getClass( this ) ) );
			} );
		}

		if ( !arguments.length ) {
			return this.attr( "class", "" );
		}

		classNames = classesToArray( value );

		if ( classNames.length ) {
			return this.each( function() {
				curValue = getClass( this );

				// This expression is here for better compressibility (see addClass)
				cur = this.nodeType === 1 && ( " " + stripAndCollapse( curValue ) + " " );

				if ( cur ) {
					for ( i = 0; i < classNames.length; i++ ) {
						className = classNames[ i ];

						// Remove *all* instances
						while ( cur.indexOf( " " + className + " " ) > -1 ) {
							cur = cur.replace( " " + className + " ", " " );
						}
					}

					// Only assign if different to avoid unneeded rendering.
					finalValue = stripAndCollapse( cur );
					if ( curValue !== finalValue ) {
						this.setAttribute( "class", finalValue );
					}
				}
			} );
		}

		return this;
	},

	toggleClass: function( value, stateVal ) {
		var classNames, className, i, self;

		if ( typeof value === "function" ) {
			return this.each( function( i ) {
				jQuery( this ).toggleClass(
					value.call( this, i, getClass( this ), stateVal ),
					stateVal
				);
			} );
		}

		if ( typeof stateVal === "boolean" ) {
			return stateVal ? this.addClass( value ) : this.removeClass( value );
		}

		classNames = classesToArray( value );

		if ( classNames.length ) {
			return this.each( function() {

				// Toggle individual class names
				self = jQuery( this );

				for ( i = 0; i < classNames.length; i++ ) {
					className = classNames[ i ];

					// Check each className given, space separated list
					if ( self.hasClass( className ) ) {
						self.removeClass( className );
					} else {
						self.addClass( className );
					}
				}
			} );
		}

		return this;
	},

	hasClass: function( selector ) {
		var className, elem,
			i = 0;

		className = " " + selector + " ";
		while ( ( elem = this[ i++ ] ) ) {
			if ( elem.nodeType === 1 &&
				( " " + stripAndCollapse( getClass( elem ) ) + " " ).indexOf( className ) > -1 ) {
				return true;
			}
		}

		return false;
	}
} );

jQuery.fn.extend( {
	val: function( value ) {
		var hooks, ret, valueIsFunction,
			elem = this[ 0 ];

		if ( !arguments.length ) {
			if ( elem ) {
				hooks = jQuery.valHooks[ elem.type ] ||
					jQuery.valHooks[ elem.nodeName.toLowerCase() ];

				if ( hooks &&
					"get" in hooks &&
					( ret = hooks.get( elem, "value" ) ) !== undefined
				) {
					return ret;
				}

				ret = elem.value;

				// Handle cases where value is null/undef or number
				return ret == null ? "" : ret;
			}

			return;
		}

		valueIsFunction = typeof value === "function";

		return this.each( function( i ) {
			var val;

			if ( this.nodeType !== 1 ) {
				return;
			}

			if ( valueIsFunction ) {
				val = value.call( this, i, jQuery( this ).val() );
			} else {
				val = value;
			}

			// Treat null/undefined as ""; convert numbers to string
			if ( val == null ) {
				val = "";

			} else if ( typeof val === "number" ) {
				val += "";

			} else if ( Array.isArray( val ) ) {
				val = jQuery.map( val, function( value ) {
					return value == null ? "" : value + "";
				} );
			}

			hooks = jQuery.valHooks[ this.type ] || jQuery.valHooks[ this.nodeName.toLowerCase() ];

			// If set returns undefined, fall back to normal setting
			if ( !hooks || !( "set" in hooks ) || hooks.set( this, val, "value" ) === undefined ) {
				this.value = val;
			}
		} );
	}
} );

jQuery.extend( {
	valHooks: {
		select: {
			get: function( elem ) {
				var value, option, i,
					options = elem.options,
					index = elem.selectedIndex,
					one = elem.type === "select-one",
					values = one ? null : [],
					max = one ? index + 1 : options.length;

				if ( index < 0 ) {
					i = max;

				} else {
					i = one ? index : 0;
				}

				// Loop through all the selected options
				for ( ; i < max; i++ ) {
					option = options[ i ];

					if ( option.selected &&

							// Don't return options that are disabled or in a disabled optgroup
							!option.disabled &&
							( !option.parentNode.disabled ||
								!nodeName( option.parentNode, "optgroup" ) ) ) {

						// Get the specific value for the option
						value = jQuery( option ).val();

						// We don't need an array for one selects
						if ( one ) {
							return value;
						}

						// Multi-Selects return an array
						values.push( value );
					}
				}

				return values;
			},

			set: function( elem, value ) {
				var optionSet, option,
					options = elem.options,
					values = jQuery.makeArray( value ),
					i = options.length;

				while ( i-- ) {
					option = options[ i ];

					if ( ( option.selected =
						jQuery.inArray( jQuery( option ).val(), values ) > -1
					) ) {
						optionSet = true;
					}
				}

				// Force browsers to behave consistently when non-matching value is set
				if ( !optionSet ) {
					elem.selectedIndex = -1;
				}
				return values;
			}
		}
	}
} );

if ( isIE ) {
	jQuery.valHooks.option = {
		get: function( elem ) {

			var val = elem.getAttribute( "value" );
			return val != null ?
				val :

				// Support: IE <=10 - 11+
				// option.text throws exceptions (trac-14686, trac-14858)
				// Strip and collapse whitespace
				// https://html.spec.whatwg.org/#strip-and-collapse-whitespace
				stripAndCollapse( jQuery.text( elem ) );
		}
	};
}

// Radios and checkboxes getter/setter
jQuery.each( [ "radio", "checkbox" ], function() {
	jQuery.valHooks[ this ] = {
		set: function( elem, value ) {
			if ( Array.isArray( value ) ) {
				return ( elem.checked = jQuery.inArray( jQuery( elem ).val(), value ) > -1 );
			}
		}
	};
} );

var rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
	stopPropagationCallback = function( e ) {
		e.stopPropagation();
	};

jQuery.extend( jQuery.event, {

	trigger: function( event, data, elem, onlyHandlers ) {

		var i, cur, tmp, bubbleType, ontype, handle, special, lastElement,
			eventPath = [ elem || document$1 ],
			type = hasOwn.call( event, "type" ) ? event.type : event,
			namespaces = hasOwn.call( event, "namespace" ) ? event.namespace.split( "." ) : [];

		cur = lastElement = tmp = elem = elem || document$1;

		// Don't do events on text and comment nodes
		if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
			return;
		}

		// focus/blur morphs to focusin/out; ensure we're not firing them right now
		if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
			return;
		}

		if ( type.indexOf( "." ) > -1 ) {

			// Namespaced trigger; create a regexp to match event type in handle()
			namespaces = type.split( "." );
			type = namespaces.shift();
			namespaces.sort();
		}
		ontype = type.indexOf( ":" ) < 0 && "on" + type;

		// Caller can pass in a jQuery.Event object, Object, or just an event type string
		event = event[ jQuery.expando ] ?
			event :
			new jQuery.Event( type, typeof event === "object" && event );

		// Trigger bitmask: & 1 for native handlers; & 2 for jQuery (always true)
		event.isTrigger = onlyHandlers ? 2 : 3;
		event.namespace = namespaces.join( "." );
		event.rnamespace = event.namespace ?
			new RegExp( "(^|\\.)" + namespaces.join( "\\.(?:.*\\.|)" ) + "(\\.|$)" ) :
			null;

		// Clean up the event in case it is being reused
		event.result = undefined;
		if ( !event.target ) {
			event.target = elem;
		}

		// Clone any incoming data and prepend the event, creating the handler arg list
		data = data == null ?
			[ event ] :
			jQuery.makeArray( data, [ event ] );

		// Allow special events to draw outside the lines
		special = jQuery.event.special[ type ] || {};
		if ( !onlyHandlers && special.trigger && special.trigger.apply( elem, data ) === false ) {
			return;
		}

		// Determine event propagation path in advance, per W3C events spec (trac-9951)
		// Bubble up to document, then to window; watch for a global ownerDocument var (trac-9724)
		if ( !onlyHandlers && !special.noBubble && !isWindow( elem ) ) {

			bubbleType = special.delegateType || type;
			if ( !rfocusMorph.test( bubbleType + type ) ) {
				cur = cur.parentNode;
			}
			for ( ; cur; cur = cur.parentNode ) {
				eventPath.push( cur );
				tmp = cur;
			}

			// Only add window if we got to document (e.g., not plain obj or detached DOM)
			if ( tmp === ( elem.ownerDocument || document$1 ) ) {
				eventPath.push( tmp.defaultView || tmp.parentWindow || window );
			}
		}

		// Fire handlers on the event path
		i = 0;
		while ( ( cur = eventPath[ i++ ] ) && !event.isPropagationStopped() ) {
			lastElement = cur;
			event.type = i > 1 ?
				bubbleType :
				special.bindType || type;

			// jQuery handler
			handle = ( dataPriv.get( cur, "events" ) || Object.create( null ) )[ event.type ] &&
				dataPriv.get( cur, "handle" );
			if ( handle ) {
				handle.apply( cur, data );
			}

			// Native handler
			handle = ontype && cur[ ontype ];
			if ( handle && handle.apply && acceptData( cur ) ) {
				event.result = handle.apply( cur, data );
				if ( event.result === false ) {
					event.preventDefault();
				}
			}
		}
		event.type = type;

		// If nobody prevented the default action, do it now
		if ( !onlyHandlers && !event.isDefaultPrevented() ) {

			if ( ( !special._default ||
				special._default.apply( eventPath.pop(), data ) === false ) &&
				acceptData( elem ) ) {

				// Call a native DOM method on the target with the same name as the event.
				// Don't do default actions on window, that's where global variables be (trac-6170)
				if ( ontype && typeof elem[ type ] === "function" && !isWindow( elem ) ) {

					// Don't re-trigger an onFOO event when we call its FOO() method
					tmp = elem[ ontype ];

					if ( tmp ) {
						elem[ ontype ] = null;
					}

					// Prevent re-triggering of the same event, since we already bubbled it above
					jQuery.event.triggered = type;

					if ( event.isPropagationStopped() ) {
						lastElement.addEventListener( type, stopPropagationCallback );
					}

					elem[ type ]();

					if ( event.isPropagationStopped() ) {
						lastElement.removeEventListener( type, stopPropagationCallback );
					}

					jQuery.event.triggered = undefined;

					if ( tmp ) {
						elem[ ontype ] = tmp;
					}
				}
			}
		}

		return event.result;
	},

	// Piggyback on a donor event to simulate a different one
	// Used only for `focus(in | out)` events
	simulate: function( type, elem, event ) {
		var e = jQuery.extend(
			new jQuery.Event(),
			event,
			{
				type: type,
				isSimulated: true
			}
		);

		jQuery.event.trigger( e, null, elem );
	}

} );

jQuery.fn.extend( {

	trigger: function( type, data ) {
		return this.each( function() {
			jQuery.event.trigger( type, data, this );
		} );
	},
	triggerHandler: function( type, data ) {
		var elem = this[ 0 ];
		if ( elem ) {
			return jQuery.event.trigger( type, data, elem, true );
		}
	}
} );

var location = window.location;

var nonce = { guid: Date.now() };

var rquery = /\?/;

// Cross-browser xml parsing
jQuery.parseXML = function( data ) {
	var xml, parserErrorElem;
	if ( !data || typeof data !== "string" ) {
		return null;
	}

	// Support: IE 9 - 11+
	// IE throws on parseFromString with invalid input.
	try {
		xml = ( new window.DOMParser() ).parseFromString( data, "text/xml" );
	} catch ( e ) {}

	parserErrorElem = xml && xml.getElementsByTagName( "parsererror" )[ 0 ];
	if ( !xml || parserErrorElem ) {
		jQuery.error( "Invalid XML: " + (
			parserErrorElem ?
				jQuery.map( parserErrorElem.childNodes, function( el ) {
					return el.textContent;
				} ).join( "\n" ) :
				data
		) );
	}
	return xml;
};

var
	rbracket = /\[\]$/,
	rCRLF = /\r?\n/g,
	rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
	rsubmittable = /^(?:input|select|textarea|keygen)/i;

function buildParams( prefix, obj, traditional, add ) {
	var name;

	if ( Array.isArray( obj ) ) {

		// Serialize array item.
		jQuery.each( obj, function( i, v ) {
			if ( traditional || rbracket.test( prefix ) ) {

				// Treat each array item as a scalar.
				add( prefix, v );

			} else {

				// Item is non-scalar (array or object), encode its numeric index.
				buildParams(
					prefix + "[" + ( typeof v === "object" && v != null ? i : "" ) + "]",
					v,
					traditional,
					add
				);
			}
		} );

	} else if ( !traditional && toType( obj ) === "object" ) {

		// Serialize object item.
		for ( name in obj ) {
			buildParams( prefix + "[" + name + "]", obj[ name ], traditional, add );
		}

	} else {

		// Serialize scalar item.
		add( prefix, obj );
	}
}

// Serialize an array of form elements or a set of
// key/values into a query string
jQuery.param = function( a, traditional ) {
	var prefix,
		s = [],
		add = function( key, valueOrFunction ) {

			// If value is a function, invoke it and use its return value
			var value = typeof valueOrFunction === "function" ?
				valueOrFunction() :
				valueOrFunction;

			s[ s.length ] = encodeURIComponent( key ) + "=" +
				encodeURIComponent( value == null ? "" : value );
		};

	if ( a == null ) {
		return "";
	}

	// If an array was passed in, assume that it is an array of form elements.
	if ( Array.isArray( a ) || ( a.jquery && !jQuery.isPlainObject( a ) ) ) {

		// Serialize the form elements
		jQuery.each( a, function() {
			add( this.name, this.value );
		} );

	} else {

		// If traditional, encode the "old" way (the way 1.3.2 or older
		// did it), otherwise encode params recursively.
		for ( prefix in a ) {
			buildParams( prefix, a[ prefix ], traditional, add );
		}
	}

	// Return the resulting serialization
	return s.join( "&" );
};

jQuery.fn.extend( {
	serialize: function() {
		return jQuery.param( this.serializeArray() );
	},
	serializeArray: function() {
		return this.map( function() {

			// Can add propHook for "elements" to filter or add form elements
			var elements = jQuery.prop( this, "elements" );
			return elements ? jQuery.makeArray( elements ) : this;
		} ).filter( function() {
			var type = this.type;

			// Use .is( ":disabled" ) so that fieldset[disabled] works
			return this.name && !jQuery( this ).is( ":disabled" ) &&
				rsubmittable.test( this.nodeName ) && !rsubmitterTypes.test( type ) &&
				( this.checked || !rcheckableType.test( type ) );
		} ).map( function( _i, elem ) {
			var val = jQuery( this ).val();

			if ( val == null ) {
				return null;
			}

			if ( Array.isArray( val ) ) {
				return jQuery.map( val, function( val ) {
					return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
				} );
			}

			return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
		} ).get();
	}
} );

var
	r20 = /%20/g,
	rhash = /#.*$/,
	rantiCache = /([?&])_=[^&]*/,
	rheaders = /^(.*?):[ \t]*([^\r\n]*)$/mg,

	// trac-7653, trac-8125, trac-8152: local protocol detection
	rlocalProtocol = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/,
	rnoContent = /^(?:GET|HEAD)$/,
	rprotocol = /^\/\//,

	/* Prefilters
	 * 1) They are useful to introduce custom dataTypes (see ajax/jsonp.js for an example)
	 * 2) These are called:
	 *    - BEFORE asking for a transport
	 *    - AFTER param serialization (s.data is a string if s.processData is true)
	 * 3) key is the dataType
	 * 4) the catchall symbol "*" can be used
	 * 5) execution will start with transport dataType and THEN continue down to "*" if needed
	 */
	prefilters = {},

	/* Transports bindings
	 * 1) key is the dataType
	 * 2) the catchall symbol "*" can be used
	 * 3) selection will start with transport dataType and THEN go to "*" if needed
	 */
	transports = {},

	// Avoid comment-prolog char sequence (trac-10098); must appease lint and evade compression
	allTypes = "*/".concat( "*" ),

	// Anchor tag for parsing the document origin
	originAnchor = document$1.createElement( "a" );

originAnchor.href = location.href;

// Base "constructor" for jQuery.ajaxPrefilter and jQuery.ajaxTransport
function addToPrefiltersOrTransports( structure ) {

	// dataTypeExpression is optional and defaults to "*"
	return function( dataTypeExpression, func ) {

		if ( typeof dataTypeExpression !== "string" ) {
			func = dataTypeExpression;
			dataTypeExpression = "*";
		}

		var dataType,
			i = 0,
			dataTypes = dataTypeExpression.toLowerCase().match( rnothtmlwhite ) || [];

		if ( typeof func === "function" ) {

			// For each dataType in the dataTypeExpression
			while ( ( dataType = dataTypes[ i++ ] ) ) {

				// Prepend if requested
				if ( dataType[ 0 ] === "+" ) {
					dataType = dataType.slice( 1 ) || "*";
					( structure[ dataType ] = structure[ dataType ] || [] ).unshift( func );

				// Otherwise append
				} else {
					( structure[ dataType ] = structure[ dataType ] || [] ).push( func );
				}
			}
		}
	};
}

// Base inspection function for prefilters and transports
function inspectPrefiltersOrTransports( structure, options, originalOptions, jqXHR ) {

	var inspected = {},
		seekingTransport = ( structure === transports );

	function inspect( dataType ) {
		var selected;
		inspected[ dataType ] = true;
		jQuery.each( structure[ dataType ] || [], function( _, prefilterOrFactory ) {
			var dataTypeOrTransport = prefilterOrFactory( options, originalOptions, jqXHR );
			if ( typeof dataTypeOrTransport === "string" &&
				!seekingTransport && !inspected[ dataTypeOrTransport ] ) {

				options.dataTypes.unshift( dataTypeOrTransport );
				inspect( dataTypeOrTransport );
				return false;
			} else if ( seekingTransport ) {
				return !( selected = dataTypeOrTransport );
			}
		} );
		return selected;
	}

	return inspect( options.dataTypes[ 0 ] ) || !inspected[ "*" ] && inspect( "*" );
}

// A special extend for ajax options
// that takes "flat" options (not to be deep extended)
// Fixes trac-9887
function ajaxExtend( target, src ) {
	var key, deep,
		flatOptions = jQuery.ajaxSettings.flatOptions || {};

	for ( key in src ) {
		if ( src[ key ] !== undefined ) {
			( flatOptions[ key ] ? target : ( deep || ( deep = {} ) ) )[ key ] = src[ key ];
		}
	}
	if ( deep ) {
		jQuery.extend( true, target, deep );
	}

	return target;
}

/* Handles responses to an ajax request:
 * - finds the right dataType (mediates between content-type and expected dataType)
 * - returns the corresponding response
 */
function ajaxHandleResponses( s, jqXHR, responses ) {

	var ct, type, finalDataType, firstDataType,
		contents = s.contents,
		dataTypes = s.dataTypes;

	// Remove auto dataType and get content-type in the process
	while ( dataTypes[ 0 ] === "*" ) {
		dataTypes.shift();
		if ( ct === undefined ) {
			ct = s.mimeType || jqXHR.getResponseHeader( "Content-Type" );
		}
	}

	// Check if we're dealing with a known content-type
	if ( ct ) {
		for ( type in contents ) {
			if ( contents[ type ] && contents[ type ].test( ct ) ) {
				dataTypes.unshift( type );
				break;
			}
		}
	}

	// Check to see if we have a response for the expected dataType
	if ( dataTypes[ 0 ] in responses ) {
		finalDataType = dataTypes[ 0 ];
	} else {

		// Try convertible dataTypes
		for ( type in responses ) {
			if ( !dataTypes[ 0 ] || s.converters[ type + " " + dataTypes[ 0 ] ] ) {
				finalDataType = type;
				break;
			}
			if ( !firstDataType ) {
				firstDataType = type;
			}
		}

		// Or just use first one
		finalDataType = finalDataType || firstDataType;
	}

	// If we found a dataType
	// We add the dataType to the list if needed
	// and return the corresponding response
	if ( finalDataType ) {
		if ( finalDataType !== dataTypes[ 0 ] ) {
			dataTypes.unshift( finalDataType );
		}
		return responses[ finalDataType ];
	}
}

/* Chain conversions given the request and the original response
 * Also sets the responseXXX fields on the jqXHR instance
 */
function ajaxConvert( s, response, jqXHR, isSuccess ) {
	var conv2, current, conv, tmp, prev,
		converters = {},

		// Work with a copy of dataTypes in case we need to modify it for conversion
		dataTypes = s.dataTypes.slice();

	// Create converters map with lowercased keys
	if ( dataTypes[ 1 ] ) {
		for ( conv in s.converters ) {
			converters[ conv.toLowerCase() ] = s.converters[ conv ];
		}
	}

	current = dataTypes.shift();

	// Convert to each sequential dataType
	while ( current ) {

		if ( s.responseFields[ current ] ) {
			jqXHR[ s.responseFields[ current ] ] = response;
		}

		// Apply the dataFilter if provided
		if ( !prev && isSuccess && s.dataFilter ) {
			response = s.dataFilter( response, s.dataType );
		}

		prev = current;
		current = dataTypes.shift();

		if ( current ) {

			// There's only work to do if current dataType is non-auto
			if ( current === "*" ) {

				current = prev;

			// Convert response if prev dataType is non-auto and differs from current
			} else if ( prev !== "*" && prev !== current ) {

				// Seek a direct converter
				conv = converters[ prev + " " + current ] || converters[ "* " + current ];

				// If none found, seek a pair
				if ( !conv ) {
					for ( conv2 in converters ) {

						// If conv2 outputs current
						tmp = conv2.split( " " );
						if ( tmp[ 1 ] === current ) {

							// If prev can be converted to accepted input
							conv = converters[ prev + " " + tmp[ 0 ] ] ||
								converters[ "* " + tmp[ 0 ] ];
							if ( conv ) {

								// Condense equivalence converters
								if ( conv === true ) {
									conv = converters[ conv2 ];

								// Otherwise, insert the intermediate dataType
								} else if ( converters[ conv2 ] !== true ) {
									current = tmp[ 0 ];
									dataTypes.unshift( tmp[ 1 ] );
								}
								break;
							}
						}
					}
				}

				// Apply converter (if not an equivalence)
				if ( conv !== true ) {

					// Unless errors are allowed to bubble, catch and return them
					if ( conv && s.throws ) {
						response = conv( response );
					} else {
						try {
							response = conv( response );
						} catch ( e ) {
							return {
								state: "parsererror",
								error: conv ? e : "No conversion from " + prev + " to " + current
							};
						}
					}
				}
			}
		}
	}

	return { state: "success", data: response };
}

jQuery.extend( {

	// Counter for holding the number of active queries
	active: 0,

	// Last-Modified header cache for next request
	lastModified: {},
	etag: {},

	ajaxSettings: {
		url: location.href,
		type: "GET",
		isLocal: rlocalProtocol.test( location.protocol ),
		global: true,
		processData: true,
		async: true,
		contentType: "application/x-www-form-urlencoded; charset=UTF-8",

		/*
		timeout: 0,
		data: null,
		dataType: null,
		username: null,
		password: null,
		cache: null,
		throws: false,
		traditional: false,
		headers: {},
		*/

		accepts: {
			"*": allTypes,
			text: "text/plain",
			html: "text/html",
			xml: "application/xml, text/xml",
			json: "application/json, text/javascript"
		},

		contents: {
			xml: /\bxml\b/,
			html: /\bhtml/,
			json: /\bjson\b/
		},

		responseFields: {
			xml: "responseXML",
			text: "responseText",
			json: "responseJSON"
		},

		// Data converters
		// Keys separate source (or catchall "*") and destination types with a single space
		converters: {

			// Convert anything to text
			"* text": String,

			// Text to html (true = no transformation)
			"text html": true,

			// Evaluate text as a json expression
			"text json": JSON.parse,

			// Parse text as xml
			"text xml": jQuery.parseXML
		},

		// For options that shouldn't be deep extended:
		// you can add your own custom options here if
		// and when you create one that shouldn't be
		// deep extended (see ajaxExtend)
		flatOptions: {
			url: true,
			context: true
		}
	},

	// Creates a full fledged settings object into target
	// with both ajaxSettings and settings fields.
	// If target is omitted, writes into ajaxSettings.
	ajaxSetup: function( target, settings ) {
		return settings ?

			// Building a settings object
			ajaxExtend( ajaxExtend( target, jQuery.ajaxSettings ), settings ) :

			// Extending ajaxSettings
			ajaxExtend( jQuery.ajaxSettings, target );
	},

	ajaxPrefilter: addToPrefiltersOrTransports( prefilters ),
	ajaxTransport: addToPrefiltersOrTransports( transports ),

	// Main method
	ajax: function( url, options ) {

		// If url is an object, simulate pre-1.5 signature
		if ( typeof url === "object" ) {
			options = url;
			url = undefined;
		}

		// Force options to be an object
		options = options || {};

		var transport,

			// URL without anti-cache param
			cacheURL,

			// Response headers
			responseHeadersString,
			responseHeaders,

			// timeout handle
			timeoutTimer,

			// Url cleanup var
			urlAnchor,

			// Request state (becomes false upon send and true upon completion)
			completed,

			// To know if global events are to be dispatched
			fireGlobals,

			// Loop variable
			i,

			// uncached part of the url
			uncached,

			// Create the final options object
			s = jQuery.ajaxSetup( {}, options ),

			// Callbacks context
			callbackContext = s.context || s,

			// Context for global events is callbackContext if it is a DOM node or jQuery collection
			globalEventContext = s.context &&
				( callbackContext.nodeType || callbackContext.jquery ) ?
				jQuery( callbackContext ) :
				jQuery.event,

			// Deferreds
			deferred = jQuery.Deferred(),
			completeDeferred = jQuery.Callbacks( "once memory" ),

			// Status-dependent callbacks
			statusCode = s.statusCode || {},

			// Headers (they are sent all at once)
			requestHeaders = {},
			requestHeadersNames = {},

			// Default abort message
			strAbort = "canceled",

			// Fake xhr
			jqXHR = {
				readyState: 0,

				// Builds headers hashtable if needed
				getResponseHeader: function( key ) {
					var match;
					if ( completed ) {
						if ( !responseHeaders ) {
							responseHeaders = {};
							while ( ( match = rheaders.exec( responseHeadersString ) ) ) {

								// Support: IE 11+
								// `getResponseHeader( key )` in IE doesn't combine all header
								// values for the provided key into a single result with values
								// joined by commas as other browsers do. Instead, it returns
								// them on separate lines.
								responseHeaders[ match[ 1 ].toLowerCase() + " " ] =
									( responseHeaders[ match[ 1 ].toLowerCase() + " " ] || [] )
										.concat( match[ 2 ] );
							}
						}
						match = responseHeaders[ key.toLowerCase() + " " ];
					}
					return match == null ? null : match.join( ", " );
				},

				// Raw string
				getAllResponseHeaders: function() {
					return completed ? responseHeadersString : null;
				},

				// Caches the header
				setRequestHeader: function( name, value ) {
					if ( completed == null ) {
						name = requestHeadersNames[ name.toLowerCase() ] =
							requestHeadersNames[ name.toLowerCase() ] || name;
						requestHeaders[ name ] = value;
					}
					return this;
				},

				// Overrides response content-type header
				overrideMimeType: function( type ) {
					if ( completed == null ) {
						s.mimeType = type;
					}
					return this;
				},

				// Status-dependent callbacks
				statusCode: function( map ) {
					var code;
					if ( map ) {
						if ( completed ) {

							// Execute the appropriate callbacks
							jqXHR.always( map[ jqXHR.status ] );
						} else {

							// Lazy-add the new callbacks in a way that preserves old ones
							for ( code in map ) {
								statusCode[ code ] = [ statusCode[ code ], map[ code ] ];
							}
						}
					}
					return this;
				},

				// Cancel the request
				abort: function( statusText ) {
					var finalText = statusText || strAbort;
					if ( transport ) {
						transport.abort( finalText );
					}
					done( 0, finalText );
					return this;
				}
			};

		// Attach deferreds
		deferred.promise( jqXHR );

		// Add protocol if not provided (prefilters might expect it)
		// Handle falsy url in the settings object (trac-10093: consistency with old signature)
		// We also use the url parameter if available
		s.url = ( ( url || s.url || location.href ) + "" )
			.replace( rprotocol, location.protocol + "//" );

		// Alias method option to type as per ticket trac-12004
		s.type = options.method || options.type || s.method || s.type;

		// Extract dataTypes list
		s.dataTypes = ( s.dataType || "*" ).toLowerCase().match( rnothtmlwhite ) || [ "" ];

		// A cross-domain request is in order when the origin doesn't match the current origin.
		if ( s.crossDomain == null ) {
			urlAnchor = document$1.createElement( "a" );

			// Support: IE <=8 - 11+
			// IE throws exception on accessing the href property if url is malformed,
			// e.g. http://example.com:80x/
			try {
				urlAnchor.href = s.url;

				// Support: IE <=8 - 11+
				// Anchor's host property isn't correctly set when s.url is relative
				urlAnchor.href = urlAnchor.href;
				s.crossDomain = originAnchor.protocol + "//" + originAnchor.host !==
					urlAnchor.protocol + "//" + urlAnchor.host;
			} catch ( e ) {

				// If there is an error parsing the URL, assume it is crossDomain,
				// it can be rejected by the transport if it is invalid
				s.crossDomain = true;
			}
		}

		// Apply prefilters
		inspectPrefiltersOrTransports( prefilters, s, options, jqXHR );

		// Convert data if not already a string
		if ( s.data && s.processData && typeof s.data !== "string" ) {
			s.data = jQuery.param( s.data, s.traditional );
		}

		// If request was aborted inside a prefilter, stop there
		if ( completed ) {
			return jqXHR;
		}

		// We can fire global events as of now if asked to
		// Don't fire events if jQuery.event is undefined in an ESM-usage scenario (trac-15118)
		fireGlobals = jQuery.event && s.global;

		// Watch for a new set of requests
		if ( fireGlobals && jQuery.active++ === 0 ) {
			jQuery.event.trigger( "ajaxStart" );
		}

		// Uppercase the type
		s.type = s.type.toUpperCase();

		// Determine if request has content
		s.hasContent = !rnoContent.test( s.type );

		// Save the URL in case we're toying with the If-Modified-Since
		// and/or If-None-Match header later on
		// Remove hash to simplify url manipulation
		cacheURL = s.url.replace( rhash, "" );

		// More options handling for requests with no content
		if ( !s.hasContent ) {

			// Remember the hash so we can put it back
			uncached = s.url.slice( cacheURL.length );

			// If data is available and should be processed, append data to url
			if ( s.data && ( s.processData || typeof s.data === "string" ) ) {
				cacheURL += ( rquery.test( cacheURL ) ? "&" : "?" ) + s.data;

				// trac-9682: remove data so that it's not used in an eventual retry
				delete s.data;
			}

			// Add or update anti-cache param if needed
			if ( s.cache === false ) {
				cacheURL = cacheURL.replace( rantiCache, "$1" );
				uncached = ( rquery.test( cacheURL ) ? "&" : "?" ) + "_=" +
					( nonce.guid++ ) + uncached;
			}

			// Put hash and anti-cache on the URL that will be requested (gh-1732)
			s.url = cacheURL + uncached;

		// Change '%20' to '+' if this is encoded form body content (gh-2658)
		} else if ( s.data && s.processData &&
			( s.contentType || "" ).indexOf( "application/x-www-form-urlencoded" ) === 0 ) {
			s.data = s.data.replace( r20, "+" );
		}

		// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
		if ( s.ifModified ) {
			if ( jQuery.lastModified[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-Modified-Since", jQuery.lastModified[ cacheURL ] );
			}
			if ( jQuery.etag[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-None-Match", jQuery.etag[ cacheURL ] );
			}
		}

		// Set the correct header, if data is being sent
		if ( s.data && s.hasContent && s.contentType !== false || options.contentType ) {
			jqXHR.setRequestHeader( "Content-Type", s.contentType );
		}

		// Set the Accepts header for the server, depending on the dataType
		jqXHR.setRequestHeader(
			"Accept",
			s.dataTypes[ 0 ] && s.accepts[ s.dataTypes[ 0 ] ] ?
				s.accepts[ s.dataTypes[ 0 ] ] +
					( s.dataTypes[ 0 ] !== "*" ? ", " + allTypes + "; q=0.01" : "" ) :
				s.accepts[ "*" ]
		);

		// Check for headers option
		for ( i in s.headers ) {
			jqXHR.setRequestHeader( i, s.headers[ i ] );
		}

		// Allow custom headers/mimetypes and early abort
		if ( s.beforeSend &&
			( s.beforeSend.call( callbackContext, jqXHR, s ) === false || completed ) ) {

			// Abort if not done already and return
			return jqXHR.abort();
		}

		// Aborting is no longer a cancellation
		strAbort = "abort";

		// Install callbacks on deferreds
		completeDeferred.add( s.complete );
		jqXHR.done( s.success );
		jqXHR.fail( s.error );

		// Get transport
		transport = inspectPrefiltersOrTransports( transports, s, options, jqXHR );

		// If no transport, we auto-abort
		if ( !transport ) {
			done( -1, "No Transport" );
		} else {
			jqXHR.readyState = 1;

			// Send global event
			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxSend", [ jqXHR, s ] );
			}

			// If request was aborted inside ajaxSend, stop there
			if ( completed ) {
				return jqXHR;
			}

			// Timeout
			if ( s.async && s.timeout > 0 ) {
				timeoutTimer = window.setTimeout( function() {
					jqXHR.abort( "timeout" );
				}, s.timeout );
			}

			try {
				completed = false;
				transport.send( requestHeaders, done );
			} catch ( e ) {

				// Rethrow post-completion exceptions
				if ( completed ) {
					throw e;
				}

				// Propagate others as results
				done( -1, e );
			}
		}

		// Callback for when everything is done
		function done( status, nativeStatusText, responses, headers ) {
			var isSuccess, success, error, response, modified,
				statusText = nativeStatusText;

			// Ignore repeat invocations
			if ( completed ) {
				return;
			}

			completed = true;

			// Clear timeout if it exists
			if ( timeoutTimer ) {
				window.clearTimeout( timeoutTimer );
			}

			// Dereference transport for early garbage collection
			// (no matter how long the jqXHR object will be used)
			transport = undefined;

			// Cache response headers
			responseHeadersString = headers || "";

			// Set readyState
			jqXHR.readyState = status > 0 ? 4 : 0;

			// Determine if successful
			isSuccess = status >= 200 && status < 300 || status === 304;

			// Get response data
			if ( responses ) {
				response = ajaxHandleResponses( s, jqXHR, responses );
			}

			// Use a noop converter for missing script but not if jsonp
			if ( !isSuccess &&
				jQuery.inArray( "script", s.dataTypes ) > -1 &&
				jQuery.inArray( "json", s.dataTypes ) < 0 ) {
				s.converters[ "text script" ] = function() {};
			}

			// Convert no matter what (that way responseXXX fields are always set)
			response = ajaxConvert( s, response, jqXHR, isSuccess );

			// If successful, handle type chaining
			if ( isSuccess ) {

				// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
				if ( s.ifModified ) {
					modified = jqXHR.getResponseHeader( "Last-Modified" );
					if ( modified ) {
						jQuery.lastModified[ cacheURL ] = modified;
					}
					modified = jqXHR.getResponseHeader( "etag" );
					if ( modified ) {
						jQuery.etag[ cacheURL ] = modified;
					}
				}

				// if no content
				if ( status === 204 || s.type === "HEAD" ) {
					statusText = "nocontent";

				// if not modified
				} else if ( status === 304 ) {
					statusText = "notmodified";

				// If we have data, let's convert it
				} else {
					statusText = response.state;
					success = response.data;
					error = response.error;
					isSuccess = !error;
				}
			} else {

				// Extract error from statusText and normalize for non-aborts
				error = statusText;
				if ( status || !statusText ) {
					statusText = "error";
					if ( status < 0 ) {
						status = 0;
					}
				}
			}

			// Set data for the fake xhr object
			jqXHR.status = status;
			jqXHR.statusText = ( nativeStatusText || statusText ) + "";

			// Success/Error
			if ( isSuccess ) {
				deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
			} else {
				deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
			}

			// Status-dependent callbacks
			jqXHR.statusCode( statusCode );
			statusCode = undefined;

			if ( fireGlobals ) {
				globalEventContext.trigger( isSuccess ? "ajaxSuccess" : "ajaxError",
					[ jqXHR, s, isSuccess ? success : error ] );
			}

			// Complete
			completeDeferred.fireWith( callbackContext, [ jqXHR, statusText ] );

			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxComplete", [ jqXHR, s ] );

				// Handle the global AJAX counter
				if ( !( --jQuery.active ) ) {
					jQuery.event.trigger( "ajaxStop" );
				}
			}
		}

		return jqXHR;
	},

	getJSON: function( url, data, callback ) {
		return jQuery.get( url, data, callback, "json" );
	},

	getScript: function( url, callback ) {
		return jQuery.get( url, undefined, callback, "script" );
	}
} );

jQuery.each( [ "get", "post" ], function( _i, method ) {
	jQuery[ method ] = function( url, data, callback, type ) {

		// Shift arguments if data argument was omitted.
		// Handle the null callback placeholder.
		if ( typeof data === "function" || data === null ) {
			type = type || callback;
			callback = data;
			data = undefined;
		}

		// The url can be an options object (which then must have .url)
		return jQuery.ajax( jQuery.extend( {
			url: url,
			type: method,
			dataType: type,
			data: data,
			success: callback
		}, jQuery.isPlainObject( url ) && url ) );
	};
} );

jQuery.ajaxPrefilter( function( s ) {
	var i;
	for ( i in s.headers ) {
		if ( i.toLowerCase() === "content-type" ) {
			s.contentType = s.headers[ i ] || "";
		}
	}
} );

jQuery._evalUrl = function( url, options, doc ) {
	return jQuery.ajax( {
		url: url,

		// Make this explicit, since user can override this through ajaxSetup (trac-11264)
		type: "GET",
		dataType: "script",
		cache: true,
		async: false,
		global: false,
		scriptAttrs: options.crossOrigin ? { "crossOrigin": options.crossOrigin } : undefined,

		// Only evaluate the response if it is successful (gh-4126)
		// dataFilter is not invoked for failure responses, so using it instead
		// of the default converter is kludgy but it works.
		converters: {
			"text script": function() {}
		},
		dataFilter: function( response ) {
			jQuery.globalEval( response, options, doc );
		}
	} );
};

jQuery.fn.extend( {
	wrapAll: function( html ) {
		var wrap;

		if ( this[ 0 ] ) {
			if ( typeof html === "function" ) {
				html = html.call( this[ 0 ] );
			}

			// The elements to wrap the target around
			wrap = jQuery( html, this[ 0 ].ownerDocument ).eq( 0 ).clone( true );

			if ( this[ 0 ].parentNode ) {
				wrap.insertBefore( this[ 0 ] );
			}

			wrap.map( function() {
				var elem = this;

				while ( elem.firstElementChild ) {
					elem = elem.firstElementChild;
				}

				return elem;
			} ).append( this );
		}

		return this;
	},

	wrapInner: function( html ) {
		if ( typeof html === "function" ) {
			return this.each( function( i ) {
				jQuery( this ).wrapInner( html.call( this, i ) );
			} );
		}

		return this.each( function() {
			var self = jQuery( this ),
				contents = self.contents();

			if ( contents.length ) {
				contents.wrapAll( html );

			} else {
				self.append( html );
			}
		} );
	},

	wrap: function( html ) {
		var htmlIsFunction = typeof html === "function";

		return this.each( function( i ) {
			jQuery( this ).wrapAll( htmlIsFunction ? html.call( this, i ) : html );
		} );
	},

	unwrap: function( selector ) {
		this.parent( selector ).not( "body" ).each( function() {
			jQuery( this ).replaceWith( this.childNodes );
		} );
		return this;
	}
} );

jQuery.expr.pseudos.hidden = function( elem ) {
	return !jQuery.expr.pseudos.visible( elem );
};
jQuery.expr.pseudos.visible = function( elem ) {
	return !!( elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length );
};

jQuery.ajaxSettings.xhr = function() {
	return new window.XMLHttpRequest();
};

var xhrSuccessStatus = {

	// File protocol always yields status code 0, assume 200
	0: 200
};

jQuery.ajaxTransport( function( options ) {
	var callback;

	return {
		send: function( headers, complete ) {
			var i,
				xhr = options.xhr();

			xhr.open(
				options.type,
				options.url,
				options.async,
				options.username,
				options.password
			);

			// Apply custom fields if provided
			if ( options.xhrFields ) {
				for ( i in options.xhrFields ) {
					xhr[ i ] = options.xhrFields[ i ];
				}
			}

			// Override mime type if needed
			if ( options.mimeType && xhr.overrideMimeType ) {
				xhr.overrideMimeType( options.mimeType );
			}

			// X-Requested-With header
			// For cross-domain requests, seeing as conditions for a preflight are
			// akin to a jigsaw puzzle, we simply never set it to be sure.
			// (it can always be set on a per-request basis or even using ajaxSetup)
			// For same-domain requests, won't change header if already provided.
			if ( !options.crossDomain && !headers[ "X-Requested-With" ] ) {
				headers[ "X-Requested-With" ] = "XMLHttpRequest";
			}

			// Set headers
			for ( i in headers ) {
				xhr.setRequestHeader( i, headers[ i ] );
			}

			// Callback
			callback = function( type ) {
				return function() {
					if ( callback ) {
						callback = xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = null;

						if ( type === "abort" ) {
							xhr.abort();
						} else if ( type === "error" ) {
							complete(

								// File: protocol always yields status 0; see trac-8605, trac-14207
								xhr.status,
								xhr.statusText
							);
						} else {
							complete(
								xhrSuccessStatus[ xhr.status ] || xhr.status,
								xhr.statusText,

								// For XHR2 non-text, let the caller handle it (gh-2498)
								( xhr.responseType || "text" ) === "text" ?
									{ text: xhr.responseText } :
									{ binary: xhr.response },
								xhr.getAllResponseHeaders()
							);
						}
					}
				};
			};

			// Listen to events
			xhr.onload = callback();
			xhr.onabort = xhr.onerror = xhr.ontimeout = callback( "error" );

			// Create the abort callback
			callback = callback( "abort" );

			try {

				// Do send the request (this may raise an exception)
				xhr.send( options.hasContent && options.data || null );
			} catch ( e ) {

				// trac-14683: Only rethrow if this hasn't been notified as an error yet
				if ( callback ) {
					throw e;
				}
			}
		},

		abort: function() {
			if ( callback ) {
				callback();
			}
		}
	};
} );

function canUseScriptTag( s ) {

	// A script tag can only be used for async, cross domain or forced-by-attrs requests.
	// Requests with headers cannot use a script tag. However, when both `scriptAttrs` &
	// `headers` options are specified, both are impossible to satisfy together; we
	// prefer `scriptAttrs` then.
	// Sync requests remain handled differently to preserve strict script ordering.
	return s.scriptAttrs || (
		!s.headers &&
		(
			s.crossDomain ||

			// When dealing with JSONP (`s.dataTypes` include "json" then)
			// don't use a script tag so that error responses still may have
			// `responseJSON` set. Continue using a script tag for JSONP requests that:
			//   * are cross-domain as AJAX requests won't work without a CORS setup
			//   * have `scriptAttrs` set as that's a script-only functionality
			// Note that this means JSONP requests violate strict CSP script-src settings.
			// A proper solution is to migrate from using JSONP to a CORS setup.
			( s.async && jQuery.inArray( "json", s.dataTypes ) < 0 )
		)
	);
}

// Install script dataType. Don't specify `contents.script` so that an explicit
// `dataType: "script"` is required (see gh-2432, gh-4822)
jQuery.ajaxSetup( {
	accepts: {
		script: "text/javascript, application/javascript, " +
			"application/ecmascript, application/x-ecmascript"
	},
	converters: {
		"text script": function( text ) {
			jQuery.globalEval( text );
			return text;
		}
	}
} );

// Handle cache's special case and crossDomain
jQuery.ajaxPrefilter( "script", function( s ) {
	if ( s.cache === undefined ) {
		s.cache = false;
	}

	// These types of requests are handled via a script tag
	// so force their methods to GET.
	if ( canUseScriptTag( s ) ) {
		s.type = "GET";
	}
} );

// Bind script tag hack transport
jQuery.ajaxTransport( "script", function( s ) {
	if ( canUseScriptTag( s ) ) {
		var script, callback;
		return {
			send: function( _, complete ) {
				script = jQuery( "<script>" )
					.attr( s.scriptAttrs || {} )
					.prop( { charset: s.scriptCharset, src: s.url } )
					.on( "load error", callback = function( evt ) {
						script.remove();
						callback = null;
						if ( evt ) {
							complete( evt.type === "error" ? 404 : 200, evt.type );
						}
					} );

				// Use native DOM manipulation to avoid our domManip AJAX trickery
				document$1.head.appendChild( script[ 0 ] );
			},
			abort: function() {
				if ( callback ) {
					callback();
				}
			}
		};
	}
} );

var oldCallbacks = [],
	rjsonp = /(=)\?(?=&|$)|\?\?/;

// Default jsonp settings
jQuery.ajaxSetup( {
	jsonp: "callback",
	jsonpCallback: function() {
		var callback = oldCallbacks.pop() || ( jQuery.expando + "_" + ( nonce.guid++ ) );
		this[ callback ] = true;
		return callback;
	}
} );

// Detect, normalize options and install callbacks for jsonp requests
jQuery.ajaxPrefilter( "jsonp", function( s, originalSettings, jqXHR ) {

	var callbackName, overwritten, responseContainer,
		jsonProp = s.jsonp !== false && ( rjsonp.test( s.url ) ?
			"url" :
			typeof s.data === "string" &&
				( s.contentType || "" )
					.indexOf( "application/x-www-form-urlencoded" ) === 0 &&
				rjsonp.test( s.data ) && "data"
		);

	// Get callback name, remembering preexisting value associated with it
	callbackName = s.jsonpCallback = typeof s.jsonpCallback === "function" ?
		s.jsonpCallback() :
		s.jsonpCallback;

	// Insert callback into url or form data
	if ( jsonProp ) {
		s[ jsonProp ] = s[ jsonProp ].replace( rjsonp, "$1" + callbackName );
	} else if ( s.jsonp !== false ) {
		s.url += ( rquery.test( s.url ) ? "&" : "?" ) + s.jsonp + "=" + callbackName;
	}

	// Use data converter to retrieve json after script execution
	s.converters[ "script json" ] = function() {
		if ( !responseContainer ) {
			jQuery.error( callbackName + " was not called" );
		}
		return responseContainer[ 0 ];
	};

	// Force json dataType
	s.dataTypes[ 0 ] = "json";

	// Install callback
	overwritten = window[ callbackName ];
	window[ callbackName ] = function() {
		responseContainer = arguments;
	};

	// Clean-up function (fires after converters)
	jqXHR.always( function() {

		// If previous value didn't exist - remove it
		if ( overwritten === undefined ) {
			jQuery( window ).removeProp( callbackName );

		// Otherwise restore preexisting value
		} else {
			window[ callbackName ] = overwritten;
		}

		// Save back as free
		if ( s[ callbackName ] ) {

			// Make sure that re-using the options doesn't screw things around
			s.jsonpCallback = originalSettings.jsonpCallback;

			// Save the callback name for future use
			oldCallbacks.push( callbackName );
		}

		// Call if it was a function and we have a response
		if ( responseContainer && typeof overwritten === "function" ) {
			overwritten( responseContainer[ 0 ] );
		}

		responseContainer = overwritten = undefined;
	} );

	// Delegate to script
	return "script";
} );

jQuery.ajaxPrefilter( function( s, origOptions ) {

	// Binary data needs to be passed to XHR as-is without stringification.
	if ( typeof s.data !== "string" && !jQuery.isPlainObject( s.data ) &&
			!Array.isArray( s.data ) &&

			// Don't disable data processing if explicitly set by the user.
			!( "processData" in origOptions ) ) {
		s.processData = false;
	}

	// `Content-Type` for requests with `FormData` bodies needs to be set
	// by the browser as it needs to append the `boundary` it generated.
	if ( s.data instanceof window.FormData ) {
		s.contentType = false;
	}
} );

// Argument "data" should be string of html or a TrustedHTML wrapper of obvious HTML
// context (optional): If specified, the fragment will be created in this context,
// defaults to document
// keepScripts (optional): If true, will include scripts passed in the html string
jQuery.parseHTML = function( data, context, keepScripts ) {
	if ( typeof data !== "string" && !isObviousHtml( data + "" ) ) {
		return [];
	}
	if ( typeof context === "boolean" ) {
		keepScripts = context;
		context = false;
	}

	var base, parsed, scripts;

	if ( !context ) {

		// Stop scripts or inline event handlers from being executed immediately
		// by using document.implementation
		context = document$1.implementation.createHTMLDocument( "" );

		// Set the base href for the created document
		// so any parsed elements with URLs
		// are based on the document's URL (gh-2965)
		base = context.createElement( "base" );
		base.href = document$1.location.href;
		context.head.appendChild( base );
	}

	parsed = rsingleTag.exec( data );
	scripts = !keepScripts && [];

	// Single tag
	if ( parsed ) {
		return [ context.createElement( parsed[ 1 ] ) ];
	}

	parsed = buildFragment( [ data ], context, scripts );

	if ( scripts && scripts.length ) {
		jQuery( scripts ).remove();
	}

	return jQuery.merge( [], parsed.childNodes );
};

/**
 * Load a url into a page
 */
jQuery.fn.load = function( url, params, callback ) {
	var selector, type, response,
		self = this,
		off = url.indexOf( " " );

	if ( off > -1 ) {
		selector = stripAndCollapse( url.slice( off ) );
		url = url.slice( 0, off );
	}

	// If it's a function
	if ( typeof params === "function" ) {

		// We assume that it's the callback
		callback = params;
		params = undefined;

	// Otherwise, build a param string
	} else if ( params && typeof params === "object" ) {
		type = "POST";
	}

	// If we have elements to modify, make the request
	if ( self.length > 0 ) {
		jQuery.ajax( {
			url: url,

			// If "type" variable is undefined, then "GET" method will be used.
			// Make value of this field explicit since
			// user can override it through ajaxSetup method
			type: type || "GET",
			dataType: "html",
			data: params
		} ).done( function( responseText ) {

			// Save response for use in complete callback
			response = arguments;

			self.html( selector ?

				// If a selector was specified, locate the right elements in a dummy div
				// Exclude scripts to avoid IE 'Permission Denied' errors
				jQuery( "<div>" ).append( jQuery.parseHTML( responseText ) ).find( selector ) :

				// Otherwise use the full result
				responseText );

		// If the request succeeds, this function gets "data", "status", "jqXHR"
		// but they are ignored because response was set above.
		// If it fails, this function gets "jqXHR", "status", "error"
		} ).always( callback && function( jqXHR, status ) {
			self.each( function() {
				callback.apply( this, response || [ jqXHR.responseText, status, jqXHR ] );
			} );
		} );
	}

	return this;
};

jQuery.expr.pseudos.animated = function( elem ) {
	return jQuery.grep( jQuery.timers, function( fn ) {
		return elem === fn.elem;
	} ).length;
};

jQuery.offset = {
	setOffset: function( elem, options, i ) {
		var curPosition, curLeft, curCSSTop, curTop, curOffset, curCSSLeft, calculatePosition,
			position = jQuery.css( elem, "position" ),
			curElem = jQuery( elem ),
			props = {};

		// Set position first, in-case top/left are set even on static elem
		if ( position === "static" ) {
			elem.style.position = "relative";
		}

		curOffset = curElem.offset();
		curCSSTop = jQuery.css( elem, "top" );
		curCSSLeft = jQuery.css( elem, "left" );
		calculatePosition = ( position === "absolute" || position === "fixed" ) &&
			( curCSSTop + curCSSLeft ).indexOf( "auto" ) > -1;

		// Need to be able to calculate position if either
		// top or left is auto and position is either absolute or fixed
		if ( calculatePosition ) {
			curPosition = curElem.position();
			curTop = curPosition.top;
			curLeft = curPosition.left;

		} else {
			curTop = parseFloat( curCSSTop ) || 0;
			curLeft = parseFloat( curCSSLeft ) || 0;
		}

		if ( typeof options === "function" ) {

			// Use jQuery.extend here to allow modification of coordinates argument (gh-1848)
			options = options.call( elem, i, jQuery.extend( {}, curOffset ) );
		}

		if ( options.top != null ) {
			props.top = ( options.top - curOffset.top ) + curTop;
		}
		if ( options.left != null ) {
			props.left = ( options.left - curOffset.left ) + curLeft;
		}

		if ( "using" in options ) {
			options.using.call( elem, props );

		} else {
			curElem.css( props );
		}
	}
};

jQuery.fn.extend( {

	// offset() relates an element's border box to the document origin
	offset: function( options ) {

		// Preserve chaining for setter
		if ( arguments.length ) {
			return options === undefined ?
				this :
				this.each( function( i ) {
					jQuery.offset.setOffset( this, options, i );
				} );
		}

		var rect, win,
			elem = this[ 0 ];

		if ( !elem ) {
			return;
		}

		// Return zeros for disconnected and hidden (display: none) elements (gh-2310)
		// Support: IE <=11+
		// Running getBoundingClientRect on a
		// disconnected node in IE throws an error
		if ( !elem.getClientRects().length ) {
			return { top: 0, left: 0 };
		}

		// Get document-relative position by adding viewport scroll to viewport-relative gBCR
		rect = elem.getBoundingClientRect();
		win = elem.ownerDocument.defaultView;
		return {
			top: rect.top + win.pageYOffset,
			left: rect.left + win.pageXOffset
		};
	},

	// position() relates an element's margin box to its offset parent's padding box
	// This corresponds to the behavior of CSS absolute positioning
	position: function() {
		if ( !this[ 0 ] ) {
			return;
		}

		var offsetParent, offset, doc,
			elem = this[ 0 ],
			parentOffset = { top: 0, left: 0 };

		// position:fixed elements are offset from the viewport, which itself always has zero offset
		if ( jQuery.css( elem, "position" ) === "fixed" ) {

			// Assume position:fixed implies availability of getBoundingClientRect
			offset = elem.getBoundingClientRect();

		} else {
			offset = this.offset();

			// Account for the *real* offset parent, which can be the document or its root element
			// when a statically positioned element is identified
			doc = elem.ownerDocument;
			offsetParent = elem.offsetParent || doc.documentElement;
			while ( offsetParent &&
				offsetParent !== doc.documentElement &&
				jQuery.css( offsetParent, "position" ) === "static" ) {

				offsetParent = offsetParent.offsetParent || doc.documentElement;
			}
			if ( offsetParent && offsetParent !== elem && offsetParent.nodeType === 1 &&
				jQuery.css( offsetParent, "position" ) !== "static" ) {

				// Incorporate borders into its offset, since they are outside its content origin
				parentOffset = jQuery( offsetParent ).offset();
				parentOffset.top += jQuery.css( offsetParent, "borderTopWidth", true );
				parentOffset.left += jQuery.css( offsetParent, "borderLeftWidth", true );
			}
		}

		// Subtract parent offsets and element margins
		return {
			top: offset.top - parentOffset.top - jQuery.css( elem, "marginTop", true ),
			left: offset.left - parentOffset.left - jQuery.css( elem, "marginLeft", true )
		};
	},

	// This method will return documentElement in the following cases:
	// 1) For the element inside the iframe without offsetParent, this method will return
	//    documentElement of the parent window
	// 2) For the hidden or detached element
	// 3) For body or html element, i.e. in case of the html node - it will return itself
	//
	// but those exceptions were never presented as a real life use-cases
	// and might be considered as more preferable results.
	//
	// This logic, however, is not guaranteed and can change at any point in the future
	offsetParent: function() {
		return this.map( function() {
			var offsetParent = this.offsetParent;

			while ( offsetParent && jQuery.css( offsetParent, "position" ) === "static" ) {
				offsetParent = offsetParent.offsetParent;
			}

			return offsetParent || documentElement$1;
		} );
	}
} );

// Create scrollLeft and scrollTop methods
jQuery.each( { scrollLeft: "pageXOffset", scrollTop: "pageYOffset" }, function( method, prop ) {
	var top = "pageYOffset" === prop;

	jQuery.fn[ method ] = function( val ) {
		return access( this, function( elem, method, val ) {

			// Coalesce documents and windows
			var win;
			if ( isWindow( elem ) ) {
				win = elem;
			} else if ( elem.nodeType === 9 ) {
				win = elem.defaultView;
			}

			if ( val === undefined ) {
				return win ? win[ prop ] : elem[ method ];
			}

			if ( win ) {
				win.scrollTo(
					!top ? val : win.pageXOffset,
					top ? val : win.pageYOffset
				);

			} else {
				elem[ method ] = val;
			}
		}, method, val, arguments.length );
	};
} );

// Create innerHeight, innerWidth, height, width, outerHeight and outerWidth methods
jQuery.each( { Height: "height", Width: "width" }, function( name, type ) {
	jQuery.each( {
		padding: "inner" + name,
		content: type,
		"": "outer" + name
	}, function( defaultExtra, funcName ) {

		// Margin is only for outerHeight, outerWidth
		jQuery.fn[ funcName ] = function( margin, value ) {
			var chainable = arguments.length && ( defaultExtra || typeof margin !== "boolean" ),
				extra = defaultExtra || ( margin === true || value === true ? "margin" : "border" );

			return access( this, function( elem, type, value ) {
				var doc;

				if ( isWindow( elem ) ) {

					// $( window ).outerWidth/Height return w/h including scrollbars (gh-1729)
					return funcName.indexOf( "outer" ) === 0 ?
						elem[ "inner" + name ] :
						elem.document.documentElement[ "client" + name ];
				}

				// Get document width or height
				if ( elem.nodeType === 9 ) {
					doc = elem.documentElement;

					// Either scroll[Width/Height] or offset[Width/Height] or client[Width/Height],
					// whichever is greatest
					return Math.max(
						elem.body[ "scroll" + name ], doc[ "scroll" + name ],
						elem.body[ "offset" + name ], doc[ "offset" + name ],
						doc[ "client" + name ]
					);
				}

				return value === undefined ?

					// Get width or height on the element, requesting but not forcing parseFloat
					jQuery.css( elem, type, extra ) :

					// Set width or height on the element
					jQuery.style( elem, type, value, extra );
			}, type, chainable ? margin : undefined, chainable );
		};
	} );
} );

jQuery.each( [
	"ajaxStart",
	"ajaxStop",
	"ajaxComplete",
	"ajaxError",
	"ajaxSuccess",
	"ajaxSend"
], function( _i, type ) {
	jQuery.fn[ type ] = function( fn ) {
		return this.on( type, fn );
	};
} );

jQuery.fn.extend( {

	bind: function( types, data, fn ) {
		return this.on( types, null, data, fn );
	},
	unbind: function( types, fn ) {
		return this.off( types, null, fn );
	},

	delegate: function( selector, types, data, fn ) {
		return this.on( types, selector, data, fn );
	},
	undelegate: function( selector, types, fn ) {

		// ( namespace ) or ( selector, types [, fn] )
		return arguments.length === 1 ?
			this.off( selector, "**" ) :
			this.off( types, selector || "**", fn );
	},

	hover: function( fnOver, fnOut ) {
		return this
			.on( "mouseenter", fnOver )
			.on( "mouseleave", fnOut || fnOver );
	}
} );

jQuery.each(
	( "blur focus focusin focusout resize scroll click dblclick " +
	"mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
	"change select submit keydown keypress keyup contextmenu" ).split( " " ),
	function( _i, name ) {

		// Handle event binding
		jQuery.fn[ name ] = function( data, fn ) {
			return arguments.length > 0 ?
				this.on( name, null, data, fn ) :
				this.trigger( name );
		};
	}
);

// Bind a function to a context, optionally partially applying any
// arguments.
// jQuery.proxy is deprecated to promote standards (specifically Function#bind)
// However, it is not slated for removal any time soon
jQuery.proxy = function( fn, context ) {
	var tmp, args, proxy;

	if ( typeof context === "string" ) {
		tmp = fn[ context ];
		context = fn;
		fn = tmp;
	}

	// Quick check to determine if target is callable, in the spec
	// this throws a TypeError, but we will just return undefined.
	if ( typeof fn !== "function" ) {
		return undefined;
	}

	// Simulated bind
	args = slice.call( arguments, 2 );
	proxy = function() {
		return fn.apply( context || this, args.concat( slice.call( arguments ) ) );
	};

	// Set the guid of unique handler to the same of original handler, so it can be removed
	proxy.guid = fn.guid = fn.guid || jQuery.guid++;

	return proxy;
};

jQuery.holdReady = function( hold ) {
	if ( hold ) {
		jQuery.readyWait++;
	} else {
		jQuery.ready( true );
	}
};

// Register as a named AMD module, since jQuery can be concatenated with other
// files that may use define, but not via a proper concatenation script that
// understands anonymous AMD modules. A named AMD is safest and most robust
// way to register. Lowercase jquery is used because AMD module names are
// derived from file names, and jQuery is normally delivered in a lowercase
// file name. Do this after creating the global so that if an AMD module wants
// to call noConflict to hide this version of jQuery, it will work.

// Note that for maximum portability, libraries that are not jQuery should
// declare themselves as anonymous modules, and avoid setting a global if an
// AMD loader is present. jQuery is a special case. For more information, see
// https://github.com/jrburke/requirejs/wiki/Updating-existing-libraries#wiki-anon

if ( typeof define === "function" && define.amd ) {
	define( "jquery", [], function() {
		return jQuery;
	} );
}

var

	// Map over jQuery in case of overwrite
	_jQuery = window.jQuery,

	// Map over the $ in case of overwrite
	_$ = window.$;

jQuery.noConflict = function( deep ) {
	if ( window.$ === jQuery ) {
		window.$ = _$;
	}

	if ( deep && window.jQuery === jQuery ) {
		window.jQuery = _jQuery;
	}

	return jQuery;
};

// Expose jQuery and $ identifiers, even in AMD
// (trac-7102#comment:10, gh-557)
// and CommonJS for browser emulators (trac-13566)
if ( typeof noGlobal === "undefined" ) {
	window.jQuery = window.$ = jQuery;
}

return jQuery;

} );

},{}]},{},[1]);
