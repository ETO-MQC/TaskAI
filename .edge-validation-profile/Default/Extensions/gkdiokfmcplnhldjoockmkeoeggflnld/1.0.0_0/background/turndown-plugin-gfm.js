var turndownPluginGfm = (function (exports) {
  'use strict';

  var highlightRegExp = /highlight-(?:text|source)-([a-z0-9]+)/;

  function cell(content, node) {
    var index = indexOf.call(node.parentNode.childNodes, node);
    var prefix = ' ';
    if (index === 0) prefix = '| ';
    return prefix + content + ' |';
  }

  function highlightedCodeBlock(turndownService) {
    turndownService.addRule('highlightedCodeBlock', {
      filter: function (node) {
        var firstChild = node.firstChild;
        return (
          node.nodeName === 'DIV' &&
          highlightRegExp.test(node.className) &&
          firstChild &&
          firstChild.nodeName === 'PRE'
        )
      },
      replacement: function (content, node, options) {
        var className = node.className || '';
        var language = (className.match(highlightRegExp) || [null, ''])[1];

        return (
          '\n\n' + options.fence + language + '\n' +
          node.firstChild.textContent +
          '\n' + options.fence + '\n\n'
        )
      }
    });
  }

  function strikethrough(turndownService) {
    turndownService.addRule('strikethrough', {
      filter: ['del', 's', 'strike'],
      replacement: function (content) {
        return '~' + content + '~'
      }
    });
  }

  var indexOf = Array.prototype.indexOf;
  var every = Array.prototype.every;
  var rules = {};

  rules.tableCell = {
  filter: ['th', 'td'],
  replacement: function (content, node, options) {
    if (!content.trim() && !node.querySelector('.ltx_Math') && !node.querySelector('[id]')) {
      return '';
    }
    const mathNode = node.querySelector('.ltx_Math');
    if (mathNode) {
      const annotation = mathNode.querySelector('annotation[encoding="application/x-tex"]');
      if (annotation) {
        let tex = annotation.textContent.trim().replace(/\xa0/g, '').replace(/\\displaystyle\s*/g, '');
        const isInline = mathNode.getAttribute('display') === 'inline';
        // 公式编号处理
        const eqno = node.parentNode.querySelector('.ltx_eqn_eqno .ltx_tag_equation')?.textContent || '';
        if (eqno && !isInline) {
          // 显示公式带编号，直接返回公式和 \tag，不作为表格单元格
          return `$$${tex} \\tag{${eqno.trim()}}$$`;
        }
        tex = tex.replace(/\n/g, ' ').replace(/(\w)\s*=\s*(\w)/, '$1 = $2');
        return cell(isInline ? `$${tex}$` : `$$${tex}$$`, node);
      }
    }
    // 公式编号单元格单独处理
    if (node.classList.contains('ltx_eqn_eqno')) {
      return ''; // 忽略编号单元格，编号已在上一步处理
    }
    const mathNodeWithId = node.querySelector('[id]');
    if (mathNodeWithId && options.article && options.article.math && options.article.math[mathNodeWithId.id]) {
      const mathInfo = options.article.math[mathNodeWithId.id];
      let tex = mathInfo.tex.trim().replace(/\xa0/g, '').replace(/\n/g, ' ').replace(/\\displaystyle\s*/g, '');
      tex = tex.replace(/(\w)\s*=\s*(\w)/, '$1 = $2');
      return cell(mathInfo.inline ? `$${tex}$` : `$$${tex}$$`, node);
    }
    return cell(content.trim() || ' ', node);
  }
};

  rules.tableRow = {
    filter: 'tr',
    replacement: function (content, node) {
      // 过滤掉空的单元格，包括特定的填充单元格
      const cells = Array.from(node.childNodes)
        .filter(child => child.nodeName === 'TH' || child.nodeName === 'TD')
        .map(child => {
          const cellContent = child.textContent.trim();
          const hasMath = child.querySelector('.ltx_Math') || child.querySelector('[id]');
          return (cellContent || hasMath) && !child.classList.contains('ltx_eqn_center_padleft') && !child.classList.contains('ltx_eqn_center_padright') ? child : null;
        })
        .filter(child => child !== null);

      let contentCells = content.split('|').map(c => c.trim()).filter(c => c);
      let borderCells = '';

      if (cells.length > 0) {
        const alignMap = { left: ':--', right: '--:', center: ':-:' };
        borderCells = cells
          .map(cellNode => {
            const align = (cellNode.getAttribute('align') || '').toLowerCase();
            const border = alignMap[align] || '---';
            return cell(border, cellNode);
          })
          .join('');
        // 确保 contentCells 与 cells 数量一致
        while (contentCells.length < cells.length) contentCells.push('');
        while (contentCells.length > cells.length) contentCells.pop();
      }

      // 确保每行以 | 开始和结束，仅一个 |
      return '\n|' + contentCells.join('|') + '|';
    }
  };

  rules.table = {
    filter: function (node) {
      return node.nodeName === 'TABLE';
    },
    replacement: function (content) {
      // 移除多余空行并清理首尾
      content = content.replace(/\n\n+/g, '\n').replace(/^\n+|\n+$/g, '');
      // 确保分隔符行与数据行列数匹配
      const rows = content.trim().split('\n');
      if (rows.length >= 1) {
        const firstRowCells = rows[0].split('|').filter(c => c.trim()).length;
        if (firstRowCells > 0) {
          const separator = Array(firstRowCells).fill('---').join('|');
          // 仅在没有分隔符行时插入，或修正现有分隔符
          if (!rows.some(row => row.includes('---'))) {
            rows.splice(1, 0, '|' + separator + '|');
          } else {
            rows.forEach((row, index) => {
              if (row.includes('---')) {
                const parts = row.split('|').filter(c => c.trim());
                if (parts.length !== firstRowCells) {
                  rows[index] = '|' + Array(firstRowCells).fill('---').join('|') + '|';
                }
              }
            });
          }
          content = rows.join('\n');
        }
      }
      return content ? '\n\n' + content + '\n\n' : '';
    }
  };

  rules.tableSection = {
    filter: ['thead', 'tbody', 'tfoot'],
    replacement: function (content) {
      return content
    }
  };

  function isHeadingRow(tr) {
    var parentNode = tr.parentNode;
    return (
      parentNode.nodeName === 'THEAD' ||
      (
        parentNode.firstChild === tr &&
        (parentNode.nodeName === 'TABLE' || isFirstTbody(parentNode)) &&
        every.call(tr.childNodes, function (n) { return n.nodeName === 'TH' })
      )
    )
  }

  function isFirstTbody(element) {
    var previousSibling = element.previousSibling;
    return (
      element.nodeName === 'TBODY' && (
        !previousSibling ||
        (
          previousSibling.nodeName === 'THEAD' &&
          /^\s*$/i.test(previousSibling.textContent)
        )
      )
    )
  }

  function tables(turndownService) {
    for (var key in rules) turndownService.addRule(key, rules[key]);
  }

  function taskListItems(turndownService) {
    turndownService.addRule('taskListItems', {
      filter: function (node) {
        return node.type === 'checkbox' && node.parentNode.nodeName === 'LI'
      },
      replacement: function (content, node) {
        return (node.checked ? '[x]' : '[ ]') + ' '
      }
    });
  }

  function gfm(turndownService) {
    turndownService.use([
      highlightedCodeBlock,
      strikethrough,
      tables,
      taskListItems
    ]);
  }

  exports.gfm = gfm;
  exports.highlightedCodeBlock = highlightedCodeBlock;
  exports.strikethrough = strikethrough;
  exports.tables = tables;
  exports.taskListItems = taskListItems;
  exports.cell = cell;

  return exports;

}({}));
