chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target !== 'offscreen') {
    return;
  }

  switch (message.type) {
    case 'parse-dom': {
      // Handle both old format (string) and new format (object with domString and originalUrl)
      let domString, originalUrl;
      if (typeof message.data === 'string') {
        // Backward compatibility: old format where data is just the DOM string
        domString = message.data;
        originalUrl = null;
      } else {
        // New format: data is an object with domString and originalUrl
        domString = message.data.domString;
        originalUrl = message.data.originalUrl;
      }

      const article = await getArticleFromDom(domString, originalUrl);
      chrome.runtime.sendMessage({ type: 'parse-dom-result', data: article });
      break;
    }
    // case 'turndown-request': {
    //   const { content, options, article } = message.data;
    //   const result = turndown(content, options, article);
    //   chrome.runtime.sendMessage({ type: 'turndown-result', data: result });
    //   break;
    // }
    case 'turndown-request': {
      const { content, options, article } = message.data;
      // 确保 options 中包含 article
      const turndownOptions = { ...options, article, br: '\n' };
      const result = turndown(content, turndownOptions, article);
      chrome.runtime.sendMessage({ type: 'turndown-result', data: result });
      break;
    }

    case 'pre-download-images': {
      const { imageList, markdown, options } = message.data;
      // console.log('imageList = ', imageList);
      const result = await preDownloadImages(imageList, markdown, options);
      chrome.runtime.sendMessage({ type: 'pre-download-images-result', data: result });
      break;
    }
    case 'create-object-url': {
      const blob = message.data;
      const url = URL.createObjectURL(blob);
      chrome.runtime.sendMessage({ type: 'create-object-url-result', data: url });
      break;
    }
    case 'revoke-blob-url': {
      URL.revokeObjectURL(message.data);
      break;
    }
  }
});

TurndownService.prototype.defaultEscape = TurndownService.prototype.escape;

async function getArticleFromDom(domString, originalUrl = null) {
  // parse the dom
  const parser = new DOMParser();
  const dom = parser.parseFromString(domString, "text/html");

  if (dom.documentElement.nodeName == "parsererror") {
    console.error("error while parsing");
  }
  // console.log("***** dom ******** =", dom.documentElement.outerHTML);

  // Set the base URI correctly if we have the original URL
  // This is crucial for proper relative link resolution
  if (originalUrl) {
    try {
      // Ensure we have a valid base element with the correct href
      let baseElement = dom.head?.querySelector('base');
      if (!baseElement) {
        baseElement = dom.createElement('base');
        if (dom.head) {
          dom.head.appendChild(baseElement);
        }
      }
      baseElement.href = originalUrl;

      // Also set the document's baseURI property if possible
      // Note: This might not work in all browsers, but we try anyway
      if (dom.baseURI !== originalUrl) {
        Object.defineProperty(dom, 'baseURI', {
          value: originalUrl,
          writable: false,
          configurable: true
        });
      }
    } catch (error) {
      console.warn('Failed to set base URI:', error);
    }
  }

  const math = {};

  const storeMathInfo = (el, mathInfo) => {
    let randomId = URL.createObjectURL(new Blob([]));
    randomId = randomId.substring(randomId.length - 36);
    el.id = randomId;
    math[randomId] = mathInfo;
  };

  // // 预处理表格，移除空的填充单元格
  // dom.body.querySelectorAll('table.ltx_equationgroup, table.ltx_eqn_table').forEach(table => {
  // table.querySelectorAll('td.ltx_eqn_center_padleft, td.ltx_eqn_center_padright').forEach(padCell => {
  //   padCell.remove(); // 删除空的填充单元格
  // });
  // });

  // Preprocess tables to remove empty padding cells and mark for retention
  dom.body.querySelectorAll('table.ltx_equationgroup, table.ltx_eqn_table, table.ltx_tabular').forEach(table => {
    // Remove padding cells1
    // Add class to increase retention probability
    table.classList.add('article-content');
    // Ensure table has a unique ID
    if (!table.id) {
      storeTableInfo(table);
    }
    // Wrap table in a div to boost content score
    const wrapper = dom.createElement('div');
    wrapper.className = 'article';
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });




  // 新增规则：处理 ztext-math 或 tex2jax_ignore math-holder 类中的公式
  dom.body.querySelectorAll('span.ztext-math, span.tex2jax_ignore.math-holder').forEach(mathNode => {
    try {
      // 从 data-tex 属性或 textContent 提取 LaTeX
      const tex = mathNode.getAttribute('data-tex') || mathNode.textContent.trim();
      // 判断是否为行内公式（ztext-math 默认行内，检查父节点或样式）
      const inline = mathNode.classList.contains('ztext-math') || !mathNode.closest('p[data-pid]')?.style?.display?.includes('block');

      if (!tex) {
        console.warn('Empty LaTeX content in span node:', mathNode);
        return;
      }

      const newNode = document.createElement(inline ? 'i' : 'p');
      newNode.textContent = tex;

      const parent = mathNode.parentNode;
      if (parent) {
        parent.insertBefore(newNode, mathNode.nextSibling);
        parent.removeChild(mathNode);
        storeMathInfo(newNode, { tex, inline });
      } else {
        console.warn('Parent node not found for span:', mathNode);
      }
    } catch (error) {
      console.error('Error processing span math node:', error);
    }
  });

  // 新增规则：匹配 MathJax 的 script 标签
  dom.body.querySelectorAll('script[type^="math/tex"]')?.forEach(script => {
    if (!script.id?.startsWith("MathJax-Element-")) return;

    const tex = script.textContent || "";
    const type = script.getAttribute("type") || "";
    const inline = !type.includes("mode=display");

    storeMathInfo(script, {
      tex,
      inline
    });
  });

  dom.body.querySelectorAll('script[id^=MathJax-Element-]')?.forEach(mathSource => {
    const type = mathSource.attributes.type.value
    storeMathInfo(mathSource, {
      tex: mathSource.innerText,
      inline: type ? !type.includes('mode=display') : false
    });
  });

  dom.body.querySelectorAll('[markdownload-latex]')?.forEach(mathJax3Node => {
    const tex = mathJax3Node.getAttribute('markdownload-latex')
    const display = mathJax3Node.getAttribute('display')
    const inline = !(display && display === 'true')

    const mathNode = document.createElement(inline ? "i" : "p")
    mathNode.textContent = tex;
    mathJax3Node.parentNode.insertBefore(mathNode, mathJax3Node.nextSibling)
    mathJax3Node.parentNode.removeChild(mathJax3Node)

    storeMathInfo(mathNode, {
      tex: tex,
      inline: inline
    });
  });

  dom.body.querySelectorAll('.katex-mathml')?.forEach(kaTeXNode => {
    storeMathInfo(kaTeXNode, {
      tex: kaTeXNode.querySelector('annotation').textContent,
      inline: true
    });
  });

  dom.body.querySelectorAll('.ltx_Math')?.forEach(mathNode => {
    let tex = '';
    const annotation = mathNode.querySelector('annotation[encoding="application/x-tex"]');

    if (annotation) {
      // 优先尝试从 annotation 标签获取
      tex = annotation.textContent.trim() || '';
    } else {
      // 回退逻辑：如果找不到 annotation，就从 math 元素自身的 alttext 属性获取
      tex = mathNode.getAttribute('alttext') || '';
      if (tex) {
        console.log('Fallback to alttext for math node:', mathNode.id);
      }
    }

    if (tex) {
      // --- 统一的文本清理逻辑 ---
      // tex = tex.replace(/\\displaystyle\\s*/g, ''); // 移除 \displaystyle
      // tex = tex.replace(/%.*$/gm, '');             // 移除 LaTeX 注释
      // tex = tex.replace(/\\s+/g, ' ').trim();       // 将多个空白替换为单个空格
      // tex = tex.replace(/\\s*=\\s*/g, ' = ');       // 规范化等号两边的空格
      tex = tex.replace(/\\displaystyle\s*/g, '')
        .replace(/\%\s*\n/g, '');
      // --------------------------

      const isInline = mathNode.getAttribute('display') === 'inline';
      // console.log('Found ltx_Math node:', { id: mathNode.id, tex, inline: isInline });
      storeMathInfo(mathNode, {
        tex,
        inline: isInline
      });
    } else {
      // 只有在 annotation 和 alttext 都失败时才警告
      console.warn('No TeX content could be found in math node:', mathNode);
    }
  });

  dom.body.querySelectorAll('[class*=highlight-text],[class*=highlight-source]')?.forEach(codeSource => {
    const language = codeSource.className.match(/highlight-(?:text|source)-([a-z0-9]+)/)?.[1]
    if (codeSource.firstChild.nodeName == "PRE") {
      codeSource.firstChild.id = `code-lang-${language}`
    }
  });

  dom.body.querySelectorAll('[class*=language-]')?.forEach(codeSource => {
    const language = codeSource.className.match(/language-([a-z0-9]+)/)?.[1]
    codeSource.id = `code-lang-${language}`;
  });

  dom.body.querySelectorAll('pre br')?.forEach(br => {
    // we need to keep <br> tags because they are removed by Readability.js
    br.outerHTML = '<br-keep></br-keep>';
  });

  dom.body.querySelectorAll('.codehilite > pre')?.forEach(codeSource => {
    if (codeSource.firstChild.nodeName !== 'CODE' && !codeSource.className.includes('language')) {
      codeSource.id = `code-lang-text`;
    }
  });

  dom.body.querySelectorAll('h1, h2, h3, h4, h5, h6')?.forEach(header => {
    // Readability.js will strip out headings from the dom if certain words appear in their className
    // See: https://github.com/mozilla/readability/issues/807  
    header.className = '';
    header.outerHTML = header.outerHTML;
  });

  // Prevent Readability from removing the <html> element if has a 'class' attribute
  // which matches removal criteria.
  // Note: The document element is guaranteed to be the HTML tag because the 'text/html'
  // mime type was used when the DOM was created.
  dom.documentElement.removeAttribute('class')

  // simplify the dom into an article

  // console.log('before Readability (dom.baseURI):', dom.baseURI);
  console.log('hello ');
  (function fixArxivBase(dom) {
    if (!dom.baseURI.includes('arxiv.org')) return;

    let base = dom.querySelector('base');
    const fixedBase = dom.baseURI.endsWith('/') ? dom.baseURI : dom.baseURI + '/';

    if (base) {
      const currentHref = base.getAttribute('href');
      if (currentHref && !currentHref.endsWith('/')) {
        base.setAttribute('href', currentHref + '/');
      }
    } else {
      base = dom.createElement('base');
      base.setAttribute('href', fixedBase);
      dom.head.insertBefore(base, dom.head.firstChild);
    }
  })(dom);
  // console.log('before Readability (dom.baseURI):', dom.baseURI);

  function preprocessChatGPTPage(dom) {
    // 1. Create a new, clean document to build our article in
    const newDoc = document.implementation.createHTMLDocument(dom.title);

    // 2. Find ALL message elements (both user and assistant)
    const allMessageElements = dom.querySelectorAll('[data-message-author-role]');

    if (allMessageElements.length === 0) {
      console.warn("No conversation messages found. Readability will not find any content.");
      return dom; // Return original dom if no messages are found
    }

    // 3. Create a main container for the article content in the new document
    const articleContainer = newDoc.createElement('div');
    articleContainer.id = 'readability-content'; // A strong hint for Readability

    // 4. Loop through all messages and add them to our container
    allMessageElements.forEach(msgElement => {
      const role = msgElement.getAttribute('data-message-author-role');

      // Create a wrapper for this entire conversational turn
      const turnWrapper = newDoc.createElement('div');
      turnWrapper.style.marginBottom = '24px'; // Add visual separation

      // Create and append the speaker label (e.g., "You:" or "ChatGPT:")
      const speakerLabel = newDoc.createElement('h5');
      speakerLabel.textContent = role === 'user' ? 'You:' : 'ChatGPT:';
      speakerLabel.style.fontWeight = 'bold';
      speakerLabel.style.marginTop = '0';
      speakerLabel.style.marginBottom = '8px';
      turnWrapper.appendChild(speakerLabel);

      // --- NEW: Find and append all images in the message ---
      const imageElements = msgElement.querySelectorAll('img');
      if (imageElements.length > 0) {
        imageElements.forEach(img => {
          const clonedImg = img.cloneNode(true);
          // Optional: Add some styling to make images display nicely
          clonedImg.style.maxWidth = '100%';
          clonedImg.style.height = 'auto';
          clonedImg.style.display = 'block';
          clonedImg.style.marginBottom = '10px';
          turnWrapper.appendChild(clonedImg);
        });
      }

      // Find and append the text content of the message
      const textContentContainer = msgElement.querySelector('.whitespace-pre-wrap, .markdown.prose');
      if (textContentContainer) {
        turnWrapper.appendChild(textContentContainer.cloneNode(true));
      }

      // Add the fully constructed "turn" to our main article container
      articleContainer.appendChild(turnWrapper);
    });

    // 5. Replace the body of our new document with the curated article container
    newDoc.body.innerHTML = ''; // Clear any default body content
    newDoc.body.appendChild(articleContainer);

    // 6. Return the new, simplified document for Readability to parse
    console.log("Created a simplified DOM with the full conversation (including images) for Readability.");
    return newDoc;
  }


  function preprocessGrokPage(dom) {
    // Create a new, clean document
    const newDoc = document.implementation.createHTMLDocument(dom.title);

    // Find all conversation turn elements
    const turnElements = dom.querySelectorAll('.relative:nth-child(n)');

    if (turnElements.length === 0) {
      console.warn("No conversation turns found. Readability will not find any content.");
      return dom;
    }

    // Create main container for Readability
    const articleContainer = newDoc.createElement('div');
    articleContainer.id = 'readability-content';

    // Clone and append all turn elements directly
    turnElements.forEach(turnElement => {
      console.log("turnElement = ", turnElement.outerHTML);
      const clonedTurn = turnElement.cloneNode(true);
      articleContainer.appendChild(clonedTurn);
    });

    // Replace body with curated content
    newDoc.body.innerHTML = '';
    newDoc.body.appendChild(articleContainer);
    console.log("Created a simplified DOM with conversation turns for Readability.");
    return newDoc;
  }


  // --- MAIN LOGIC ---


  // We'll work on a clone to avoid changing the live page
  let docToParse = dom.cloneNode(true);

  // Check which site we are on
  const isChatGPTPage = docToParse.baseURI && docToParse.baseURI.includes("chatgpt.com");
  const isGrokPage = docToParse.baseURI && docToParse.baseURI.includes("grok.com");

  if (isChatGPTPage) {
    console.log("ChatGPT page detected. Preprocessing...");
    docToParse = preprocessChatGPTPage(docToParse);
  } else if (isGrokPage) {
    console.log("Grok page detected. Preprocessing...");
    docToParse = preprocessGrokPage(docToParse);
  }

  // Pass the final, clean document to Readability
  // console.log('Final HTML being passed to Readability:', docToParse.documentElement.outerHTML);
  const article = new Readability(docToParse).parse();

  // console.log('Parsed Article Content:', article ? article.content : 'null');

  // console.log('after Readability:', article);

  // get the base uri from the dom and attach it as important article info
  // Use originalUrl if available, otherwise fall back to dom.baseURI
  // IMPORTANT: dom.baseURI in offscreen context might be chrome-extension:// protocol
  // so we need to be careful about using it
  let effectiveBaseURI;

  // console.log('originalUrl:', originalUrl);
  // First priority: Use originalUrl if it's a valid URL string
  if (originalUrl && typeof originalUrl === 'string' && originalUrl.trim() !== '') {
    try {
      // Test if originalUrl is a valid URL
      const testUrl = new URL(originalUrl);
      effectiveBaseURI = originalUrl;
    } catch (error) {
      // Handle invalid URL
    }
  }
  // console.log('effectiveBaseURI:', effectiveBaseURI);
  // Second priority: Use dom.baseURI if it's not a chrome-extension URL
  if (!effectiveBaseURI && dom.baseURI && !dom.baseURI.startsWith('chrome-extension://')) {
    try {
      new URL(dom.baseURI);
      effectiveBaseURI = dom.baseURI;
    } catch (error) {
      // Handle invalid URL
    }
  }
  // console.log('dom.baseURI:', dom.baseURI);

  // Third priority: Check for base element in the DOM
  if (!effectiveBaseURI) {
    const baseElement = dom.head?.querySelector('base');

    if (baseElement && baseElement.href && !baseElement.href.startsWith('chrome-extension://')) {
      try {
        new URL(baseElement.href);
        effectiveBaseURI = baseElement.href;
      } catch (error) {
        // Handle invalid URL
      }
    }
  }

  // Fourth priority: Try to extract URL from the DOM content (meta tags, etc.)
  if (!effectiveBaseURI && dom.head) {
    const canonicalLink = dom.head.querySelector('link[rel="canonical"]');
    if (canonicalLink && canonicalLink.href) {
      try {
        const canonicalUrl = new URL(canonicalLink.href);
        effectiveBaseURI = canonicalUrl.origin + canonicalUrl.pathname;
      } catch (error) {
        // Handle invalid URL
      }
    }
  }

  // Last resort: Use a reasonable fallback based on common patterns
  if (!effectiveBaseURI) {
    // Try to determine if this looks like a GitHub page or other common site
    const title = dom.title || '';
    if (title.includes('GitHub') || dom.querySelector('meta[property="og:site_name"][content*="GitHub"]')) {
      effectiveBaseURI = 'https://github.com/';
    } else {
      effectiveBaseURI = 'https://example.com/';
    }
  }

  article.baseURI = effectiveBaseURI;

  // also grab the page title
  article.pageTitle = dom.title;

  // and some URL info - use the effective base URI for consistency
  try {
    const url = new URL(effectiveBaseURI);
    article.hash = url.hash;
    article.host = url.host;
    article.origin = url.origin;
    article.hostname = url.hostname;
    article.pathname = url.pathname;
    article.port = url.port;
    article.protocol = url.protocol;
    article.search = url.search;
  } catch (error) {
    // Fallback to dom.baseURI if originalUrl parsing fails
    try {
      const fallbackUrl = new URL(dom.baseURI);
      article.hash = fallbackUrl.hash;
      article.host = fallbackUrl.host;
      article.origin = fallbackUrl.origin;
      article.hostname = fallbackUrl.hostname;
      article.pathname = fallbackUrl.pathname;
      article.port = fallbackUrl.port;
      article.protocol = fallbackUrl.protocol;
      article.search = fallbackUrl.search;
    } catch (fallbackError) {
      // Handle both errors
    }
  }

  // Add original URL information if provided
  if (originalUrl) {
    article.originalUrl = originalUrl;
  }

  // make sure the dom has a head
  if (dom.head) {
    // and the keywords, should they exist, as an array
    article.keywords = dom.head.querySelector('meta[name="keywords"]')?.content?.split(',')?.map(s => s.trim());

    // add all meta tags, so users can do whatever they want
    dom.head.querySelectorAll('meta[name][content], meta[property][content]')?.forEach(meta => {
      const key = (meta.getAttribute('name') || meta.getAttribute('property'))
      const val = meta.getAttribute('content')
      if (key && val && !article[key]) {
        article[key] = val;
      }
    })
  }

  article.math = math

  // return the article
  return article;
}

// function to convert the article content to markdown using Turndown
function turndown(content, options, article) {

  if (options.turndownEscape) TurndownService.prototype.escape = TurndownService.prototype.defaultEscape;
  else TurndownService.prototype.escape = s => s;

  var turndownService = new TurndownService(options);

  turndownService.use(turndownPluginGfm.gfm)

  turndownService.keep(['iframe', 'sub', 'sup', 'u', 'ins', 'del', 'small', 'big']);

  let imageList = {};
  // add an image rule
  turndownService.addRule('images', {
    filter: function (node, tdopts) {
      // if we're looking at an img node with a src
      if (node.nodeName == 'IMG' && node.getAttribute('src')) {
        // console.log("node =",  node)
        // get the original src
        let src = node.getAttribute('src')
        // set the new src
        const validatedSrc = validateUri(src, article.baseURI, article); // Pass article to validateUri
        node.setAttribute('src', validatedSrc);

        // if we're downloading images, there's more to do.
        if (options.downloadImages) {
          // generate a file name for the image
          // console.log("options.downloadImages, src = ", src);
          let imageFilename = getImageFilename(src, options, article, false); // Pass article to getImageFilename
          // console.log("imageFilename =",  imageFilename)
          if (!imageList[src] || imageList[src] != imageFilename) {
            // if the imageList already contains this file, add a number to differentiate
            let i = 1;
            while (Object.values(imageList).includes(imageFilename)) {
              const parts = imageFilename.split('.');
              if (i == 1) parts.splice(parts.length - 1, 0, i++);
              else parts.splice(parts.length - 2, 1, i++);
              imageFilename = parts.join('.');
            }
            // console.log("imageFilename =",  imageFilename)
            // console.log("src =",  src)

            // add it to the list of images to download later
            imageList[src] = imageFilename;
          }
          // check if we're doing an obsidian style link
          const obsidianLink = options.imageStyle.startsWith("obsidian");
          // figure out the (local) src of the image
          const localSrc = options.imageStyle === 'obsidian-nofolder'
            // if using "nofolder" then we just need the filename, no folder
            ? imageFilename.substring(imageFilename.lastIndexOf('/') + 1)
            // otherwise we may need to modify the filename to uri encode parts for a pure markdown link
            : imageFilename.split('/').map(s => obsidianLink ? s : encodeURI(s)).join('/')

          // set the new src attribute to be the local filename
          if (options.imageStyle != 'originalSource' && options.imageStyle != 'base64') node.setAttribute('src', localSrc);
          // pass the filter if we're making an obsidian link (or stripping links)
          return true;
        }
        else {
          // 如果不下载图片，保持原始URL不变
          // validatedSrc已经在上面设置过了，这里不需要再修改
          return true;
        }
      }
      // don't pass the filter, just output a normal markdown link
      return false;
    },
    replacement: function (content, node, tdopts) {
      // if we're stripping images, output nothing
      if (options.imageStyle == 'noImage') return '';
      // if this is an obsidian link, so output that
      else if (options.imageStyle.startsWith('obsidian')) return `![[${node.getAttribute('src')}]]`;
      // otherwise, a normal markdown link
      else {
        var alt = cleanAttribute(node.getAttribute('alt'));
        var src = node.getAttribute('src') || '';
        var title = cleanAttribute(node.getAttribute('title'));
        var titlePart = title ? ' "' + title + '"' : '';
        if (options.imageRefStyle == 'referenced') {
          var id = this.references.length + 1;
          this.references.push('[fig' + id + ']: ' + src + titlePart);
          return '![' + alt + '][fig' + id + ']';
        }
        else return src ? '![' + alt + ']' + '(' + src + titlePart + ')' : ''
      }
    },
    references: [],
    append: function (options) {
      var references = '';
      if (this.references.length) {
        references = '\n\n' + this.references.join('\n') + '\n\n';
        this.references = []; // Reset references
      }
      return references
    }

  });

  // add a rule for links
  turndownService.addRule('links', {
    filter: (node, tdopts) => {
      // check that this is indeed a link
      if (node.nodeName == 'A' && node.getAttribute('href')) {
        // get the href
        const href = node.getAttribute('href');

        // Use the enhanced validateUri function with proper baseURI
        // The article.baseURI should now contain the originalUrl if available
        const validatedHref = validateUri(href, article.baseURI, article); // Pass article to validateUri

        // set the new href
        node.setAttribute('href', validatedHref);

        // if we are to strip links, the filter needs to pass
        return options.linkStyle == 'stripLinks';
      }
      // we're not passing the filter, just do the normal thing.
      return false;
    },
    // if the filter passes, we're stripping links, so just return the content
    replacement: (content, node, tdopts) => content
  });

  // handle multiple lines math
  turndownService.addRule('mathjax', {
    filter(node, options) {
      return article.math.hasOwnProperty(node.id);
    },
    replacement(content, node, options) {
      const math = article.math[node.id];
      let tex = math.tex.trim().replaceAll('\xa0', '');
      // console.log(" replacement *** ", tex)
      if (math.inline) {
        tex = tex.replaceAll('\n', ' ');
        return `$${tex}$`;
      }
      else
        return `$\n${tex}\n$`;
    }
  });

  function repeat(character, count) {
    return Array(count + 1).join(character);
  }

  function convertToFencedCodeBlock(node, options) {
    // Restore the <br> tags that were preserved through Readability
    let html = node.innerHTML.replaceAll('<br-keep></br-keep>', '<br>');
    // Replace <br> tags with actual newlines
    html = html.replace(/<br\s*\/?>/gi, '\n');

    // To safely get the text content while preserving newlines,
    // we can create a temporary element.
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const code = tempDiv.textContent || tempDiv.innerText || '';
    
    const langMatch = node.id?.match(/code-lang-(.+)/);
    const language = langMatch?.length > 0 ? langMatch[1] : '';

    const fenceChar = options.fence.charAt(0);
    let fenceSize = 3;
    const fenceInCodeRegex = new RegExp('^' + fenceChar + '{3,}', 'gm');

    let match;
    while ((match = fenceInCodeRegex.exec(code))) {
      if (match[0].length >= fenceSize) {
        fenceSize = match[0].length + 1;
      }
    }

    const fence = repeat(fenceChar, fenceSize);

    return (
      '\n\n' + fence + language + '\n' +
      code.replace(/\n$/, '') +
      '\n' + fence + '\n\n'
    )
  }

  turndownService.addRule('fencedCodeBlock', {
    filter: function (node, options) {
      return (
        options.codeBlockStyle === 'fenced' &&
        node.nodeName === 'PRE' &&
        node.firstChild &&
        node.firstChild.nodeName === 'CODE'
      );
    },
    replacement: function (content, node, options) {
      return convertToFencedCodeBlock(node.firstChild, options);
    }
  });

  // handle <pre> as code blocks
  turndownService.addRule('pre', {
    filter: (node, tdopts) => {
      return node.nodeName == 'PRE'
        && (!node.firstChild || node.firstChild.nodeName != 'CODE')
        && !node.querySelector('img');
    },
    replacement: (content, node, tdopts) => {
      return convertToFencedCodeBlock(node, tdopts);
    }
  });

  let markdown = options.frontmatter + turndownService.turndown(content)
    + options.backmatter;

  // strip out non-printing special characters which CodeMirror displays as a red dot
  // see: https://codemirror.net/doc/manual.html#option_specialChars
  markdown = markdown.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028\u2029\ufeff\ufff9-\ufffc]/g, '');

  return { markdown: markdown, imageList: imageList };
}

function cleanAttribute(attribute) {
  return attribute ? attribute.replace(/(\n+\s*)+/g, '\n') : ''
}

// URL parsing cache to avoid repeated parsing of the same URLs
const urlParseCache = new Map();

// Safe URL parsing function to handle malformed URLs with caching
function safeUrlParse(urlString, baseUrl = null) {
  // Create cache key
  const cacheKey = baseUrl ? `${urlString}|${baseUrl}` : urlString;

  // Check cache first
  if (urlParseCache.has(cacheKey)) {
    return urlParseCache.get(cacheKey);
  }

  let result = null;
  try {
    if (baseUrl) {
      result = new URL(urlString, baseUrl);
    } else {
      result = new URL(urlString);
    }
  } catch (error) {
    // Handle error
  }

  // Cache the result (including null for failed parses)
  urlParseCache.set(cacheKey, result);

  // Limit cache size to prevent memory leaks
  if (urlParseCache.size > 1000) {
    const firstKey = urlParseCache.keys().next().value;
    urlParseCache.delete(firstKey);
  }

  return result;
}

// Helper function to check if a link is a pure anchor link (starts with #)
function isAnchorLink(href) {
  if (!href || typeof href !== 'string') {
    return false;
  }
  return href.startsWith('#') && href.length > 1;
}

// Helper function to check if a link is relative to the current page with an anchor
function isRelativeToCurrentPage(href) {
  if (!href || typeof href !== 'string') {
    return false;
  }

  // Check for patterns like "page.html#section" or "./page.html#section" or "../page.html#section"
  // but not absolute URLs or protocol-relative URLs
  if (href.includes('://') || href.startsWith('//')) {
    return false;
  }

  // Check if it contains an anchor
  const hashIndex = href.indexOf('#');
  if (hashIndex === -1) {
    return false;
  }

  // If it starts with #, it's a pure anchor link
  if (hashIndex === 0) {
    return true;
  }

  // Check if the part before # is a relative path
  const pathPart = href.substring(0, hashIndex);
  return !pathPart.startsWith('/') && !pathPart.includes('://');
}

// Helper function to validate anchor link validity
function validateAnchorLink(href, baseURI) {
  if (!href || typeof href !== 'string') {
    return false;
  }

  try {
    // Pure anchor links are always valid if they have content after #
    if (isAnchorLink(href)) {
      return href.length > 1; // Must have content after #
    }

    // For relative links with anchors, validate the base part
    if (isRelativeToCurrentPage(href)) {
      const hashIndex = href.indexOf('#');
      if (hashIndex > 0) {
        // Validate that we can construct a valid URL with the base URI
        const pathPart = href.substring(0, hashIndex);
        const baseUrl = new URL(baseURI);
        new URL(pathPart, baseUrl);
        return true;
      }
      return hashIndex === 0 && href.length > 1;
    }

    // For other types of links, try to parse as URL
    new URL(href);
    return true;
  } catch (error) {
    return false;
  }
}

function validateUri(href, baseURI, article = null) { // Add article as a parameter
  // CRITICAL FIX: If baseURI starts with chrome-extension://, try to extract a proper base
  if (baseURI && baseURI.startsWith('chrome-extension://')) {
    // Try to extract domain from article properties or use a fallback
    if (article && article.originalUrl) { // Use the passed article parameter
      try {
        // Try to use originalUrl as baseURI
        const url = new URL(article.originalUrl);
        baseURI = url.origin + '/';
      } catch (e) {
        // If parsing fails, try other methods
      }
    }

    // If originalUrl didn't work, try other article properties
    if (baseURI.startsWith('chrome-extension://')) {
      if (article && article.origin) { // Use the passed article parameter
        baseURI = article.origin + '/';
      } else if (article && article.hostname) { // Use the passed article parameter
        baseURI = 'https://' + article.hostname + '/';
      } else if (article && article.baseURI && !article.baseURI.startsWith('chrome-extension://')) { // Use the passed article parameter
        baseURI = article.baseURI;
      } else {
        // Last resort - try to extract domain from canonical link or meta tags
        try {
          // Ensure article.content exists before using it
          const domContent = (article && article.content) ? article.content : '';
          const dom = document.implementation.createHTMLDocument();
          dom.documentElement.innerHTML = domContent;

          // Try canonical link
          const canonicalLink = dom.querySelector('link[rel="canonical"]');
          if (canonicalLink && canonicalLink.href) {
            const url = new URL(canonicalLink.href);
            baseURI = url.origin + '/';
          }
          // Try og:url meta tag
          else {
            const ogUrl = dom.querySelector('meta[property="og:url"]');
            if (ogUrl && ogUrl.content) {
              const url = new URL(ogUrl.content);
              baseURI = url.origin + '/';
            }
          }
        } catch (e) {
          // If all else fails, use a generic fallback
          baseURI = 'https://example.com/';
        }
      }
    }
  }

  // Special handling for chrome-extension:// links
  if (href && href.startsWith('chrome-extension://')) {
    // Extract the path part after the extension ID
    const pathMatch = href.match(/chrome-extension:\/\/[^\/]+(.+)/);
    if (pathMatch && pathMatch[1]) {
      const path = pathMatch[1];

      // Try to construct a URL using the baseURI
      if (baseURI) {
        try {
          // Remove leading slash if baseURI ends with slash
          if (path.startsWith('/') && baseURI.endsWith('/')) {
            return baseURI + path.substring(1);
          }
          return baseURI + path;
        } catch (e) {
          // If construction fails, continue with other methods
        }
      }
    }

    // We already handled this case above, no need to duplicate code
  }


  // Special handling for anchor links
  if (isAnchorLink(href)) {
    // For pure anchor links (#section), return directly without any conversion
    return href;
  }

  if (isRelativeToCurrentPage(href)) {
    const hashIndex = href.indexOf('#');
    if (hashIndex > 0) {
      // For relative links with anchors, extract and preserve the anchor part
      const pathPart = href.substring(0, hashIndex);
      const anchorPart = href.substring(hashIndex);

      try {
        // Validate the path part can be resolved
        const baseUrl = safeUrlParse(baseURI);
        if (baseUrl) {
          const resolvedUrl = safeUrlParse(pathPart, baseUrl);
          if (resolvedUrl) {
            // Return the relative format with anchor preserved
            return pathPart + anchorPart;
          }
        }
        // If path resolution fails, return as-is
        return href;
      } catch (error) {
        return href;
      }
    } else if (hashIndex === 0) {
      // Pure anchor link, return as-is
      return href;
    }
  }

  // Original logic for other types of links with enhanced error handling
  const parsedUrl = safeUrlParse(href);
  if (parsedUrl) {
    // If it's already a valid absolute URL, return as-is
    return href;
  } else {
    // if it's not a valid url, that likely means we have to prepend the base uri
    const baseUrl = safeUrlParse(baseURI);
    if (!baseUrl) {
      return href; // Return original href if base URI is invalid
    }

    try {
      // if the href starts with '/', we need to go from the origin
      if (href.startsWith('/')) {
        href = baseUrl.origin + href;
      }
      // otherwise we need to go from the local folder
      else {
        href = baseUrl.href + (baseUrl.href.endsWith('/') ? '' : '/') + href;
      }
    } catch (error) {
      return href; // Return original href on error
    }
  }
  return href;
}

function getImageFilename(src, options, article, prependFilePath = true) {
  console.log(`getImageFilename called with src: ${src}`);
  const slashPos = src.lastIndexOf('/');
  const queryPos = src.indexOf('?');
  let filename = src.substring(slashPos + 1, queryPos > 0 ? queryPos : src.length);
  console.log(`Initial filename extracted: ${filename}`);

  // 确保 imagePrefix 是安全的，避免使用过长的标题
  let imagePrefix = '';
  if (options.imagePrefix && typeof options.imagePrefix === 'string') {
    console.log(`Original imagePrefix: ${options.imagePrefix}`);
    // 限制前缀长度并清理不安全字符
    imagePrefix = generateValidFileName(options.imagePrefix.substring(0, 20), options.disallowedChars);
    if (imagePrefix && !imagePrefix.endsWith('/')) {
      imagePrefix += '/';
    }
    console.log(`Processed imagePrefix: ${imagePrefix}`);
  }

  if (filename.includes(';base64,')) {
    // this is a base64 encoded image, so what are we going to do for a filename here?
    filename = 'image.' + filename.substring(0, filename.indexOf(';'));
  }

  let extension = filename.substring(filename.lastIndexOf('.'));
  if (extension == filename) {
    // there is no extension, so we need to figure one out
    // Try to guess from URL parameters first (like wx_fmt=gif)
    let guessedExtension = '.idunno';

    // Check for format hints in URL parameters
    const urlParams = new URLSearchParams(src.substring(src.indexOf('?') + 1));
    const formatParam = urlParams.get('wx_fmt') || urlParams.get('format') || urlParams.get('fmt');
    if (formatParam) {
      // Validate the format parameter against known image formats
      const validFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
      if (validFormats.includes(formatParam.toLowerCase())) {
        guessedExtension = '.' + formatParam.toLowerCase();
        console.log(`Guessed image format from URL parameter: ${formatParam}`);
      }
    }

    // for now, give it the guessed extension and we'll verify it later during download
    filename = filename + guessedExtension;
    extension = guessedExtension;
  }

  // Check if filename is too long or contains problematic characters
  const baseName = filename.substring(0, filename.lastIndexOf('.'));
  const maxSafeLength = 60; // More conservative limit for better compatibility

  if (baseName.length > maxSafeLength || /[^\w\-_.]/.test(baseName)) {
    // Generate UUID-based filename for problematic cases
    const uuid = generateUUID();
    filename = uuid + extension;
    console.log(`Using UUID filename for problematic image: ${src} -> ${filename}`);
  } else {
    filename = generateValidFileName(filename, options.disallowedChars);
  }

  const finalFilename = imagePrefix + filename;

  // 确保最终文件名不为空
  if (!finalFilename || finalFilename.trim() === '' || finalFilename === '/') {
    const uuid = generateUUID();
    const fallbackFilename = `image-${uuid}.png`;
    console.log(`Empty filename detected, using fallback: ${fallbackFilename}`);
    return fallbackFilename;
  }

  return finalFilename;
}

// Generate a simple UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// function to turn the title into a valid file name
function generateValidFileName(title, disallowedChars = null) {
  if (!title) return title;
  else title = title + '';
  // remove < > : " / \ | ? * 
  var illegalRe = /[\/\?<>\\:\*\|":]/g;
  // and non-breaking spaces (thanks @Licat)
  var name = title.replace(illegalRe, "").replace(new RegExp('\u00A0', 'g'), ' ')
    // collapse extra whitespace
    .replace(new RegExp(/\s+/, 'g'), ' ')
    // remove leading/trailing whitespace that can cause issues when using {pageTitle} in a download path
    .trim();

  if (disallowedChars) {
    for (let c of disallowedChars) {
      if (`[\\^$.|?*+()`.includes(c)) c = `\\${c}`;
      name = name.replace(new RegExp(c, 'g'), '');
    }
  }

  // Limit filename length to avoid filesystem limitations
  // Windows has a 255 character limit for filenames
  const maxLength = 200; // Leave some room for extensions and paths
  if (name.length > maxLength) {
    // Try to preserve the file extension if it exists
    const lastDotIndex = name.lastIndexOf('.');
    if (lastDotIndex > 0 && lastDotIndex > name.length - 10) {
      // Extension exists and is reasonable length
      const extension = name.substring(lastDotIndex);
      const baseName = name.substring(0, lastDotIndex);
      name = baseName.substring(0, maxLength - extension.length) + extension;
    } else {
      // No extension or extension is too long, just truncate
      name = name.substring(0, maxLength);
    }
    console.log(`Filename truncated to ${name.length} characters: ${name}`);
  }

  // 确保不返回空字符串
  if (!name || name.trim() === '') {
    console.log('generateValidFileName: Empty name detected, using fallback');
    return 'unnamed-file';
  }

  return name;
}

async function preDownloadImages(imageList, markdown, options, article) { // Add article as a parameter
  let newImageList = {};
  console.log('preDownloadImages input imageList:', imageList);
  await Promise.all(Object.entries(imageList).map(async ([src, filename]) => {
    try {
      console.log(`Processing image: src=${src}, filename=${filename}`);
      // Convert chrome-extension URLs to proper URLs before fetching
      let fetchUrl = src;
      console.log(`fetchUrl =  ${fetchUrl}`);
      if (src.startsWith('chrome-extension://')) {
        // Use the same logic as validateUri to convert chrome-extension URLs
        // Generic pattern for GitHub-like paths
        const githubPathMatch = src.match(/\/([^\/]+)\/([^\/]+)\/(raw|blob)\/([^\/]+)\/(.+)/);
        if (githubPathMatch) {
          const user = githubPathMatch[1];
          const repo = githubPathMatch[2];
          const type = githubPathMatch[3]; // raw or blob
          const branch = githubPathMatch[4]; // master, main, etc.
          const path = githubPathMatch[5]; // file path

          // Convert to GitHub URL
          fetchUrl = `https://github.com/${user}/${repo}/${type}/${branch}/${path}`;
          console.log('Converting image URL for fetch:', src, '->', fetchUrl);
        } else {
          // Use validateUri to correctly resolve the chrome-extension URL
          fetchUrl = validateUri(src, article.baseURI, article); // Pass article to validateUri
          console.log('Converting image URL using validateUri:', src, '->', fetchUrl);
        }
      }

      const response = await fetch(fetchUrl);
      const blob = await response.blob();

      if (options.imageStyle == 'base64') {
        const reader = new FileReader();
        await new Promise((resolve, reject) => {
          reader.onloadend = resolve;
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        markdown = markdown.replaceAll(src, reader.result);
      } else {
        let newFilename = filename;

        // Check if we need to update the file extension based on actual MIME type
        if (blob.type && mimedb[blob.type]) {
          let correctExtension = mimedb[blob.type];

          // Handle special case for JPEG (mimedb uses "jpeg" but we prefer "jpg")
          if (correctExtension === 'jpeg') {
            correctExtension = 'jpg';
          }

          if (correctExtension) {
            // Get the current extension
            const currentExtension = newFilename.substring(newFilename.lastIndexOf('.') + 1).toLowerCase();

            // Always update if current extension is 'idunno', or if there's a mismatch
            if (currentExtension === 'idunno' || currentExtension !== correctExtension) {
              const oldExtension = currentExtension;
              newFilename = newFilename.substring(0, newFilename.lastIndexOf('.')) + '.' + correctExtension;

              if (oldExtension === 'idunno') {
                console.log(`Determined image format from MIME type: ${blob.type} -> .${correctExtension}`);
              } else if (oldExtension !== correctExtension) {
                console.log(`Image format corrected: .${oldExtension} -> .${correctExtension} (MIME: ${blob.type})`);
              }
            }

            // Update markdown references if filename changed
            if (newFilename !== filename) {
              console.log(`Updating markdown references: ${filename} -> ${newFilename}`);

              if (!options.imageStyle.startsWith("obsidian")) {
                // For standard markdown links, we need to handle URL encoding
                const oldEncodedPath = filename.split('/').map(s => encodeURI(s)).join('/');
                const newEncodedPath = newFilename.split('/').map(s => encodeURI(s)).join('/');

                // Try multiple replacement patterns to ensure we catch all references
                markdown = markdown.replaceAll(oldEncodedPath, newEncodedPath);
                markdown = markdown.replaceAll(filename, newFilename);

                // Also handle cases where the filename might appear without encoding
                const oldFilenameOnly = filename.substring(filename.lastIndexOf('/') + 1);
                const newFilenameOnly = newFilename.substring(newFilename.lastIndexOf('/') + 1);
                if (oldFilenameOnly !== newFilenameOnly) {
                  markdown = markdown.replaceAll(oldFilenameOnly, newFilenameOnly);
                }
              } else {
                // For Obsidian links, replace both full path and filename only
                markdown = markdown.replaceAll(filename, newFilename);

                // Handle obsidian-nofolder case where only filename is used
                if (options.imageStyle === 'obsidian-nofolder') {
                  const oldFilenameOnly = filename.substring(filename.lastIndexOf('/') + 1);
                  const newFilenameOnly = newFilename.substring(newFilename.lastIndexOf('/') + 1);
                  if (oldFilenameOnly !== newFilenameOnly) {
                    markdown = markdown.replaceAll(`![[${oldFilenameOnly}]]`, `![[${newFilenameOnly}]]`);
                  }
                }
              }
            }
          }
        }

        const blobUrl = URL.createObjectURL(blob);
        console.log(`Created blob URL: ${blobUrl} -> filename: ${newFilename}`);
        newImageList[blobUrl] = newFilename;
      }
    } catch (error) {
      console.error('A network error occurred attempting to download ' + src, error);
      // 即使下载失败，也要确保有一个有效的文件名
      console.log(`Download failed for ${src}, using original filename: ${filename}`);
    }
  }));

  console.log("newImageList = ", newImageList)
  return { imageList: newImageList, markdown: markdown };
}
