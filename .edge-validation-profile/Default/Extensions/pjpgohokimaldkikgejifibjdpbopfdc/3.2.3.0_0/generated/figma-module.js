(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
(
  () => {
    setInterval(() => {
      if (!window.figma) {
        return;
      }

      pollFigmaViewport();
      pollFigmaTextNodes();
    }, 100);

    window.addEventListener(
      'sapling-figma-edit-accepted',
      e => {
        const {figmaId, updatedText} = e.detail;
        updateFigmaTextNodeCharacters(figmaId, updatedText);
      }
    )

    // We should know when the viewport changes
    // (zoom, pan)
    let figmaViewport = null;
    // We should have all text on the current page
    let figmaTextNodes = null;

    function pollFigmaViewport() {
      const { bounds, zoom } = figma.viewport;
      const canvasRect = document.getElementsByTagName('canvas')[0]
        .getBoundingClientRect()
        .toJSON();
      let currentViewport = { viewportBounds: bounds, zoom, canvasRect };

      if (JSON.stringify(figmaViewport) === JSON.stringify(currentViewport)) {
        return;
      }

      figmaViewport = currentViewport;
      window.dispatchEvent(new CustomEvent(
        'sapling-figma-viewport-updated',
        { detail: { figmaViewport, figmaTextNodes } },
      ));
    }

    function pollFigmaTextNodes() {
      let allTextNodes = figma.currentPage.selection.filter(
        node => node.type === 'TEXT',
      );

      let currentTextNodes = allTextNodes.map(c => {
        const {
          characters,
          absoluteBoundingBox,
          id,
          listSpacing,
          textAlignHorizontal,
          textAlignVertical,
          paragraphSpacing,
          paragraphIndent,
        } = c;
        const textSegments = c.getStyledTextSegments([
          'listOptions',
          'fontName',
          'fontSize',
          'fontWeight',
          'textCase',
          'lineHeight',
          'letterSpacing',
        ]);

        return {
          characters,
          textBounds: absoluteBoundingBox,
          figmaId: id,
          style: {
            textAlignHorizontal,
            textAlignVertical,
            paragraphSpacing,
            paragraphIndent,
            listSpacing,
            textSegments,
          }
        };
      });

      if (JSON.stringify(figmaTextNodes) === JSON.stringify(currentTextNodes)) {
        return;
      }

      figmaTextNodes = currentTextNodes;
      window.dispatchEvent(new CustomEvent(
        'sapling-figma-text-nodes-updated',
        { detail: { figmaTextNodes } },
      ));
    }

    function updateFigmaTextNodeCharacters(figmaId, updatedText) {
      let selectedNode = figma.currentPage.selection.filter(
        c => c.id === figmaId,
      )[0];

      const currentCharacters = selectedNode.characters.trim();
      const styledTextSegments = selectedNode.getStyledTextSegments(['fontName']);
      const promises = styledTextSegments.map(segment => {
        const { fontName: {family, style} } = segment;
        return figma.loadFontAsync({family, style});
      });

      let editPosition = 0;
      while (updatedText[editPosition] === currentCharacters[editPosition]) {
        editPosition++;
      }
      const lengthDiff = updatedText.length - currentCharacters.length;

      // We need to pick the segment whose style we will preserve
      let editedSegmentIndex;
      for (let i=0; i < styledTextSegments.length; i++) {
        const segment = styledTextSegments[i];
        const { start, end } = segment;
        if (editPosition >= start && editPosition < end) {
          editedSegmentIndex = i;
          break;
        }
      }

      // If its the last segment, we go till the end
      // Otherwise, find where the original text starts in updatedText
      let updatedSliceEnd;
      let originalDeleteLength;
      if (editedSegmentIndex === styledTextSegments.length - 1) {
        updatedSliceEnd = updatedText.length;
        originalDeleteLength = currentCharacters.length - editPosition;
      } else {
        // Move back from the end of both characters till we find a difference
        let i = updatedText.length - 1, j = currentCharacters.length - 1;
        for (; updatedText[i] === currentCharacters[j]; i--, j--) {}
        updatedSliceEnd = i;
        if (j < editPosition) {
          // This looks like a pure deletion
          originalDeleteLength = -1 * lengthDiff;
        } else {
          originalDeleteLength = j - editPosition + 1;
        }
      }
      const textToInsert = updatedText.slice(editPosition, updatedSliceEnd);

      Promise.all(promises).then(() => {
        selectedNode.insertCharacters(editPosition, textToInsert, 'AFTER');
        selectedNode.deleteCharacters(
          editPosition + textToInsert.length,
          editPosition + textToInsert.length + originalDeleteLength,
        );
      });
    }
  }
)();
},{}]},{},[1]);
