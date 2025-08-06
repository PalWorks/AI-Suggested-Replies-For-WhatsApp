function createGptButton() {
  const gptButton = document.createElement('button');
  gptButton.type = 'button';
  gptButton.innerHTML = '<span class="gptbtn-text">Generate Response</span>\n' +
    '  <span class="spinner"></span>\n';
  gptButton.className = 'gptbtn';

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const baseBg = prefersDark ? '#005C4B' : '#D9FDD3';
  const hoverBg = prefersDark ? '#1F7767' : '#BCE5A7';
  const textColor = prefersDark ? '#E9EDEF' : '#54656F';

  gptButton.style.backgroundColor = baseBg;
  gptButton.style.color = textColor;
  gptButton.style.padding = '10px';
  gptButton.style.border = 'none';
  gptButton.style.borderRadius = '5px';

  // Add hover effect
  gptButton.style.transition = 'background-color 0.3s ease';
  gptButton.style.cursor = 'pointer';

  gptButton.addEventListener('mouseover', () => {
    gptButton.style.backgroundColor = hoverBg;
  });

  gptButton.addEventListener('mouseout', () => {
    gptButton.style.backgroundColor = baseBg;
  });

  // Add pressed effect
  gptButton.style.boxShadow = 'inset 0 0 5px rgba(0, 0, 0, 0.2)';

  gptButton.addEventListener('mousedown', () => {
    gptButton.style.boxShadow = 'inset 0 0 10px rgba(0, 0, 0, 0.4)';
  });

  gptButton.addEventListener('mouseup', () => {
    gptButton.style.boxShadow = 'inset 0 0 5px rgba(0, 0, 0, 0.2)';
  });
  return {
    gptButton,
    setBusy(value) {
      if (value) {
        gptButton.classList.add('loading');
      } else {
        gptButton.classList.remove('loading');
      }
    }
  };
}

function createButton(pathVariable, title) {
    const buttonElement = document.createElement("button");
    buttonElement.innerHTML = "<button class=\"svlsagor\"><span><svg viewBox=\"0 0 24 24\" height=\"24\" width=\"24\" preserveAspectRatio=\"xMidYMid meet\"><path fill=\"green\"></path></svg></span></button>";
    buttonElement.querySelector('path').setAttribute('d', pathVariable)
    buttonElement.setAttribute('title', title)
    return buttonElement;
}

function createButtonEmpty(title) {
    const buttonElement = document.createElement("button");
    buttonElement.innerHTML = "<button class=\"svlsagor\"><span><svg viewBox=\"0 0 24 24\" height=\"24\" width=\"24\" preserveAspectRatio=\"xMidYMid meet\"></svg></span></button>";
    buttonElement.setAttribute('title', title)
    const svg = buttonElement.querySelector('svg')
    return {svg, buttonElement};
}

function createAndAddOptionsButton(newButtonContainer) {
    const optionsButton = createButton('m9.25 22-.4-3.2q-.325-.125-.612-.3-.288-.175-.563-.375L4.7 19.375l-2.75-4.75 2.575-1.95Q4.5 12.5 4.5 12.337v-.675q0-.162.025-.337L1.95 9.375l2.75-4.75 2.975 1.25q.275-.2.575-.375.3-.175.6-.3l.4-3.2h5.5l.4 3.2q.325.125.613.3.287.175.562.375l2.975-1.25 2.75 4.75-2.575 1.95q.025.175.025.337v.675q0 .163-.05.338l2.575 1.95-2.75 4.75-2.95-1.25q-.275.2-.575.375-.3.175-.6.3l-.4 3.2Zm2.8-6.5q1.45 0 2.475-1.025Q15.55 13.45 15.55 12q0-1.45-1.025-2.475Q13.5 8.5 12.05 8.5q-1.475 0-2.488 1.025Q8.55 10.55 8.55 12q0 1.45 1.012 2.475Q10.575 15.5 12.05 15.5Zm0-2q-.625 0-1.062-.438-.438-.437-.438-1.062t.438-1.062q.437-.438 1.062-.438t1.063.438q.437.437.437 1.062t-.437 1.062q-.438.438-1.063.438ZM12 12Zm-1 8h1.975l.35-2.65q.775-.2 1.438-.588.662-.387 1.212-.937l2.475 1.025.975-1.7-2.15-1.625q.125-.35.175-.738.05-.387.05-.787t-.05-.788q-.05-.387-.175-.737l2.15-1.625-.975-1.7-2.475 1.05q-.55-.575-1.212-.963-.663-.387-1.438-.587L13 4h-1.975l-.35 2.65q-.775.2-1.437.587-.663.388-1.213.938L5.55 7.15l-.975 1.7 2.15 1.6q-.125.375-.175.75-.05.375-.05.8 0 .4.05.775t.175.75l-2.15 1.625.975 1.7 2.475-1.05q.55.575 1.213.962.662.388 1.437.588Z', 'Options');
    optionsButton.addEventListener('click', () => {
        try {
            chrome.runtime.sendMessage({action: 'openOptionsPage'});
        } catch (e) {// ignore, sometimes happens when reloading the extension, but don't want to see it pop up in the console
        }
    });
    newButtonContainer.appendChild(optionsButton);
}

function creatCopyButton(newFooter, newButtonContainer) {
    const {
        svg: svgElement,
        buttonElement: copyButton
    } = createButtonEmpty('Copy chat suggestion');
    svgElement.innerHTML = '<path d="M3,13c0-2.45,1.76-4.47,4.08-4.91L5.59,9.59L7,11l4-4.01L7,3L5.59,4.41l1.58,1.58l0,0.06C3.7,6.46,1,9.42,1,13 c0,3.87,3.13,7,7,7h3v-2H8C5.24,18,3,15.76,3,13z"/><path d="M13,13v7h9v-7H13z M20,18h-5v-3h5V18z"/><rect height="7" width="9" x="13" y="4"/>\n'
    newFooter.querySelectorAll('.selectable-text.copyable-text')[0];
    copyButton.style.marginRight = '10px';
    newButtonContainer.appendChild(copyButton);
    return copyButton;
}

function createGptFooter(footer, mainNode) {
    // Clone the footer and get the main container
    const newFooter = footer.cloneNode(true);
    const mainContainerRef = footer.querySelector('.copyable-area');
    const mainContainer = newFooter.querySelector('.copyable-area');
    const inputContainer = mainContainer.querySelector('.lexical-rich-text-input');
    const inputContainerRef = mainContainerRef.querySelector('.lexical-rich-text-input');

    // Create GPT button
    const gptButtonObject = createGptButton();

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
    elementCount = mainFooterContainer.childElementCount
    isWindows = elementCount === 2 // on windows the layout is different from the one on Mac (Unfortunately); on windows the attachment and speech button are outside of the main container area
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
    // Add GPT button to container
    buttonContainer.appendChild(gptButtonObject.gptButton);

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
        copyButton
    };
}

