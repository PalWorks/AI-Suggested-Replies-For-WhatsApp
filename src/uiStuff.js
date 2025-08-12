// Creates a styled action button used for AI features
// label - text shown on the button (defaults to "Suggest Response")
// id - optional id for future lookups
function createGptButton(label = 'Suggest Response', id) {
  const gptButton = document.createElement('button');
  gptButton.type = 'button';
  gptButton.id = id || '';
  gptButton.innerHTML = `<span class="gptbtn-text">${label}</span><span class="spinner"></span>`;
  gptButton.className = 'gptbtn wa-reply-btn';
  return {
    gptButton,
    setBusy(value) {
      if (value) {
        const rect = gptButton.getBoundingClientRect();
        // Lock current footprint so the spinner centers correctly
        gptButton.style.minWidth = Math.ceil(rect.width) + 'px';
        gptButton.style.minHeight = Math.ceil(rect.height) + 'px';
        gptButton.classList.add('loading');
      } else {
        gptButton.classList.remove('loading');
        gptButton.style.minWidth = '';
        gptButton.style.minHeight = '';
      }
    }
  };
}

function createButtonEmpty(title) {
  const buttonElement = document.createElement('button');
  buttonElement.innerHTML = '<button class="svlsagor"><span><svg viewBox="0 0 24 24" width="20" height="20" preserveAspectRatio="xMidYMid meet"></svg></span></button>';
  buttonElement.setAttribute('title', title);
  // Make inline SVG honor theme color
  buttonElement.style.color = 'var(--gpt-icon-color)';
  const svg = buttonElement.querySelector('svg');
  const inner = buttonElement.querySelector('button');
  if (inner) {
    inner.style.display = 'flex';
    inner.style.alignItems = 'center';
    inner.style.justifyContent = 'center';
    inner.style.width = '24px';
    inner.style.height = '24px';
    inner.style.padding = '0';
    inner.style.border = 'none';
    inner.style.background = 'transparent';
    inner.style.color = 'var(--gpt-icon-color)';
  }
  return {svg, buttonElement};
}

function createAndAddOptionsButton(newButtonContainer) {
  const {
    svg: svgElement,
    buttonElement: optionsButton
  } = createButtonEmpty('Options');
  fetch(chrome.runtime.getURL('icons/SettingsGear2.svg'))
    .then(r => r.text())
    .then(svg => {
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const srcSvg = doc.querySelector('svg');
      if (!srcSvg) return;

      // Set viewBox
      const vb = srcSvg.getAttribute('viewBox') || '0 0 24 24';
      svgElement.setAttribute('viewBox', vb);

      // Helper to normalize colors to currentColor
      function normalize(el) {
        const fill = el.getAttribute && el.getAttribute('fill');
        const stroke = el.getAttribute && el.getAttribute('stroke');

        // If the element has a fill color (not none), make it themable
        if (fill && fill !== 'none') el.setAttribute('fill', 'currentColor');
        // If the element has a stroke color (not none), make it themable
        if (stroke && stroke !== 'none') {
          el.setAttribute('stroke', 'currentColor');
          // Preserve stroke width/linecap/linejoin if present
        }

        // Recursively normalize children
        for (const child of el.children || []) normalize(child);
      }

      // Clone children from source <svg> into our target svg
      srcSvg.querySelectorAll(':scope > *').forEach(node => {
        const cloned = node.cloneNode(true);
        normalize(cloned);
        svgElement.appendChild(cloned);
      });
    });
  optionsButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({action: 'openOptionsPage'}, response => {
      if (chrome.runtime.lastError || !response) {
        console.error('Failed to open options page', chrome.runtime.lastError);
      }
    });
  });
  newButtonContainer.appendChild(optionsButton);
}

function creatCopyButton(newFooter, newButtonContainer) {
  const {
    svg: svgElement,
    buttonElement: copyButton
  } = createButtonEmpty('Insert suggestion into reply box');
  fetch(chrome.runtime.getURL('icons/Box-arrow-in-up-left.svg'))
    .then(r => r.text())
    .then(svg => {
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const svgNode = doc.querySelector('svg');
      if (!svgNode) return;
      const viewBox = svgNode.getAttribute('viewBox') || '0 0 16 16';
      svgElement.setAttribute('viewBox', viewBox);
      svgNode.querySelectorAll('path').forEach(path => {
        path.setAttribute('fill', 'currentColor');
        svgElement.appendChild(path);
      });
    });
  newButtonContainer.appendChild(copyButton);
  return copyButton;
}

function createDeleteButton(newFooter, newButtonContainer) {
  const {
    svg: svgElement,
    buttonElement: deleteButton
  } = createButtonEmpty('Delete suggestion');
  fetch(chrome.runtime.getURL('icons/DeleteBin.svg'))
    .then(r => r.text())
    .then(svg => {
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const svgNode = doc.querySelector('svg');
      if (!svgNode) return;
      const viewBox = svgNode.getAttribute('viewBox') || '0 0 20 20';
      svgElement.setAttribute('viewBox', viewBox);
      svgNode.querySelectorAll('path').forEach(path => {
        path.setAttribute('fill', 'currentColor');
        svgElement.appendChild(path);
      });
    });
  deleteButton.style.display = 'none';
  newButtonContainer.appendChild(deleteButton);
  return deleteButton;
}

function createGptFooter(footer, mainNode, notConfigured = false) {
    // Clone the footer and get the main container
    const newFooter = footer.cloneNode(true);
    const mainContainerRef = footer.querySelector('.copyable-area');
    const mainContainer = newFooter.querySelector('.copyable-area');
    const inputContainer = mainContainer.querySelector('.lexical-rich-text-input');
    const inputContainerRef = mainContainerRef.querySelector('.lexical-rich-text-input');

    // Create primary "Suggest Response" button and improvement button
    const gptButtonObject = createGptButton('Suggest Response', 'ai-reply-btn');
    const improveButtonObject = createGptButton('Improve my response', 'improve-response-btn');
    const setupButtonObject = createGptButton('Setup AI Smart Reply Suggestions', 'setup-ai-btn');
    setupButtonObject.gptButton.classList.add('setup-ai-btn');
    setupButtonObject.gptButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({action: 'openOptionsPage'});
    });

    function createButtonContainer() {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'custom-button-container';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.alignItems = 'center';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.padding = '0 8px';
        return buttonContainer;
    }

// Create button container for our custom buttons
    const buttonContainer = createButtonContainer();
    const buttonContainer2 = createButtonContainer();

    let mainFooterContainer = inputContainer.parentNode;
    let elementCount = mainFooterContainer.childElementCount;
    let isWindows = elementCount === 2; // on windows the layout is different from the one on Mac (Unfortunately); on windows the attachment and speech button are outside of the main container area
    if (isWindows) {
        // mainContainerRef.childNodes[0].childNodes[0].childNodes[0].childNodes[0]
        let windowsOuterContainer = inputContainer.parentNode.parentNode.parentNode;
        windowsOuterContainer.removeChild(windowsOuterContainer.firstChild);
        mainFooterContainer.removeChild(mainFooterContainer.firstChild);
        let windowsOuterContainer2 = inputContainer.parentNode.parentNode;
        windowsOuterContainer2.removeChild(windowsOuterContainer2.lastChild);
    } else {
        mainFooterContainer.removeChild(mainFooterContainer.firstChild);
        mainFooterContainer.removeChild(mainFooterContainer.firstChild);
        mainFooterContainer.removeChild(mainFooterContainer.lastChild);
    }
    mainFooterContainer.insertBefore(buttonContainer, inputContainer);
    mainFooterContainer.append(buttonContainer2);
    // Add buttons to container in a single row
    buttonContainer.appendChild(gptButtonObject.gptButton);
    buttonContainer.appendChild(improveButtonObject.gptButton);
    buttonContainer.appendChild(setupButtonObject.gptButton);

    if (notConfigured) {
        gptButtonObject.gptButton.disabled = true;
        improveButtonObject.gptButton.disabled = true;
        const lbl = gptButtonObject.gptButton.querySelector('.gptbtn-text');
        if (lbl) lbl.textContent = 'Set up AI Suggestions';
    } else {
        setupButtonObject.gptButton.style.display = 'none';
    }

    // Create and add delete button
    const deleteButton = createDeleteButton(newFooter, buttonContainer2);
    // Create and add copy button
    const copyButton = creatCopyButton(newFooter, buttonContainer2);

    // Create and add options button
    createAndAddOptionsButton(buttonContainer2);

    // Insert our button container before the input area

    // Remove unnecessary elements

    // Remove hint text using DOM traversal without class names
    // Find the hint text element (sibling with aria-hidden="true")
    const hintTextContainer = inputContainer.querySelector('div[aria-hidden="true"]');
    if (hintTextContainer) {
        hintTextContainer.remove();
    }

    // Insert the new footer after the original
    footer.parentNode.insertBefore(newFooter, footer.nextSibling);

    // Scroll to bottom after insertion
    requestAnimationFrame(() => {
        const chatContainer = mainNode.querySelector('[role="application"]');
        if (chatContainer) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    });

    // Disable editing in the new footer
    const contentEditable = newFooter.querySelector('[contenteditable="true"]');
    if (contentEditable) {
        contentEditable.setAttribute('contenteditable', 'false');
    }

    return {
        newFooter,
        gptButtonObject,
        improveButtonObject,
        copyButton,
        deleteButton,
        setupButtonObject
    };
}

