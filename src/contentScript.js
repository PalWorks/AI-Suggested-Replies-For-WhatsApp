(() => {
  // contentScript.js - version 2025-08-05T00:44:54Z
  'use strict';
  if (window.__gptContentScriptLoaded) return;
  window.__gptContentScriptLoaded = true;

  let showToast;
  import(chrome.runtime.getURL('utils.js')).then(m => {
    showToast = m.showToast;
  });

// Content script file will run in the context of web page.
// With content script you can manipulate the web pages using
// Document Object Model (DOM).
// You can also pass information to the parent extension.

// Injected by background.js using chrome.scripting.executeScript

// For more information on Content Scripts,
// See https://developer.chrome.com/extensions/content_scripts

const style = document.createElement('style');
style.textContent = `
/* Theme variables */
:root {
  --gpt-btn-spinner-border: rgba(0, 0, 0, 0.1);
  --gpt-btn-spinner-top: #54656F;
  --message-spinner-border: rgba(0, 0, 0, 0.1);
  --message-spinner-top: #54656F;
}

@media (prefers-color-scheme: dark) {
  :root {
    --gpt-btn-spinner-border: rgba(255, 255, 255, 0.1);
    --gpt-btn-spinner-top: #d1d7db;
    --message-spinner-border: rgba(255, 255, 255, 0.1);
    --message-spinner-top: #d1d7db;
  }
}

.gptbtn {
  position: relative;
  display: inline-flex; /* Flex ensures spinner/text are centered */
  align-items: center;
  justify-content: center;
  padding: 12px 24px;
  font-size: 16px;
  font-weight: bold;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.gptbtn .gptbtn-text {
  display: inline-block; /* Allows width to be reserved when hidden */
}

/* Keep label space reserved so button size stays consistent */
.gptbtn.loading .gptbtn-text {
  visibility: hidden; /* Hide label but retain width */
}

.gptbtn .spinner {
  width: 20px;
  height: 20px;
  border: 3px solid var(--gpt-btn-spinner-border);
  border-top-color: var(--gpt-btn-spinner-top);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  position: absolute; /* Overlay spinner in the center */
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: none; /* Only visible while loading */
}

.gptbtn.loading .spinner {
  display: block; /* Show centered spinner */
}

.gptbtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.wa-reply-btn {
  border-radius: 42px !important;
  background: #fff !important;
  color: #222 !important;
  font-weight: 400 !important;
  font-size: 14px !important;
  border: 1.5px solid #e2e2e2 !important;
  box-shadow: none;
  padding: 6px 20px !important;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}

.wa-reply-btn:hover,
.wa-reply-btn:focus {
  background: #e7f6ee !important;
  color: #075e54 !important;
  border-color: #b3e2cd !important;
}

.gpt-message {
  /* Maintain consistent height for the suggestion bar */
  min-height: 24px;
  padding: 8px 0;
  display: block;
  white-space: pre-wrap;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* message spinner removed; buttons now show their own loader */
`;
document.head.appendChild(style);

let streamingText = '';



function readData() {
  try {
    chrome.storage.local.get(
      {showAdvancedImprove: false},
      result => {
        showAdvancedImprove = result.showAdvancedImprove;
      }
    );
  } catch (e) {
    console.error('Error reading storage:', e);
    if (showToast) showToast('Error reading storage');
  }
}

async function copyToSendField(text) {
  try {
    const textareaEl = globalMainNode.querySelector('[contenteditable="true"]');
    textareaEl.focus();
    document.execCommand('insertText', false, text);
  } catch (e) {
    if (showToast) showToast('Failed to copy text');
  }
}

let delayTimer;

let parseHtmlFunction

function triggerEvent() {
    if (delayTimer) {
        clearTimeout(delayTimer);
    }
    delayTimer = setTimeout(parseHtmlFunction, 100); // Change 1000 to the delay time you want (in milliseconds)
}

let globalMainNode;
let newFooterParagraph;

async function createPrompt(lastIsMine, chatHistoryShort) {
    let promptCenter;
    let mePrefix = 'Me: ';
    if (lastIsMine) {
        promptCenter = 'Complete the following chat by providing a second message for my double-texting sequence. Do not react but continue the thought, elaborate, or add a supplementary point, without repeating the last utterance.';
    } else {
        promptCenter = 'As "Me", give an utterance completing the following chat conversation flow.';
    }

    const {DEFAULT_PROMPT} = await import(chrome.runtime.getURL('utils.js'));
    const result = await new Promise(resolve => {
        chrome.storage.local.get({
            promptTemplate: DEFAULT_PROMPT
        }, resolve);
    });

    const promptTemplate = result.promptTemplate;
    const prompt = `${promptTemplate}\n${promptCenter}\n\nchat history:\n${chatHistoryShort}\n\n${mePrefix}`;
    return prompt;
}

function extractConversation(node) {
  return parseHtml(node);
}

let globalGptButtonObject;
let globalImproveButtonObject;
let activeButtonObject; // Tracks which button initiated the current request
let showAdvancedImprove = false;

// Helper to call the provided callback without extra confirmation
function withPermission(callback) {
  callback();
}

// Triggered when the main "Suggest Response" button is clicked
function gptButtonClicked() {
  withPermission(() => {
    triggerEvent();
  });
}

// Reads the current draft text from WhatsApp's input box
function getDraftText() {
  const textareaEl = globalMainNode.querySelector('[contenteditable="true"]');
  return textareaEl ? textareaEl.textContent.trim() : '';
}

// Enable/disable the "Improve my response" button based on input presence
function updateImproveButtonState() {
  const button = globalImproveButtonObject && globalImproveButtonObject.gptButton;
  if (!button) return;
  const hasText = getDraftText().length > 0;
  button.disabled = !hasText;
}

// Handles "Improve my response" button clicks
async function improveButtonClicked() {
  const draft = getDraftText();
  if (!showAdvancedImprove && !draft) {
    // Guard against empty input and inform the user why we cannot improve
    if (showToast) showToast('Please enter a message to improve');
    return;
  }
  withPermission(async () => {
    const {chatHistoryShort} = extractConversation(globalMainNode);
    if (showAdvancedImprove) {
      const dialogResult = await showImproveDialog(chatHistoryShort, draft);
      if (!dialogResult) {
        return;
      }
      const {draft: userDraft, style, tone, instructions} = dialogResult;
      const {DEFAULT_PROMPT} = await import(chrome.runtime.getURL('utils.js'));
      const {promptTemplate} = await new Promise(resolve => {
        chrome.storage.local.get({promptTemplate: DEFAULT_PROMPT}, resolve);
      });
      const parts = [`${promptTemplate}`, `Response style: ${style}`, `Tone: ${tone}`];
      if (instructions) parts.push(`Additional instructions: ${instructions}`);
      parts.push(`\nChat history:\n${chatHistoryShort}\n\nMy draft:\n${userDraft}`);
      const prompt = parts.join('\n');
      activeButtonObject = globalImproveButtonObject;
      activeButtonObject.setBusy(true);
      streamingText = '';
      writeTextToSuggestionField('', true);
      await chrome.runtime.sendMessage({
        message: 'sendChatToGpt',
        prompt
      });
    } else {
      const {DEFAULT_PROMPT} = await import(chrome.runtime.getURL('utils.js'));
      const result = await new Promise(resolve => {
        chrome.storage.local.get({
          promptTemplate: DEFAULT_PROMPT
        }, resolve);
      });
      const template = result.promptTemplate;
      const prompt = `${template}\nHere is my drafted response to the above chat. Please rewrite it to be clearer, more concise, and polite, while retaining my intent.\n\nchat history:\n${chatHistoryShort}\n\nmy draft:\n${draft}`;
      activeButtonObject = globalImproveButtonObject;
      activeButtonObject.setBusy(true);
      streamingText = '';
      writeTextToSuggestionField('', true);
      await chrome.runtime.sendMessage({
        message: 'sendChatToGpt',
        prompt
      });
    }
  });
}

function maybeShowOptionsHintInResponseField() {
    chrome.storage.local.get({
        optionsHintShown: 0,
    }, (result) => {
        if (result.optionsHintShown < 3) {
            const path = '<path d="m9.25 22-.4-3.2q-.325-.125-.612-.3-.288-.175-.563-.375L4.7 19.375l-2.75-4.75 2.575-1.95Q4.5 12.5 4.5 12.337v-.675q0-.162.025-.337L1.95 9.375l2.75-4.75 2.975 1.25q.275-.2.575-.375.3-.175.6-.3l.4-3.2h5.5l.4 3.2q.325.125.613.3.287.175.562.375l2.975-1.25 2.75 4.75-2.575 1.95q.025.175.025.337v.675q0 .163-.05.338l2.575 1.95-2.75 4.75-2.95-1.25q-.275.2-.575.375-.3.175-.6.3l-.4 3.2Zm2.8-6.5q1.45 0 2.475-1.025Q15.55 13.45 15.55 12q0-1.45-1.025-2.475Q13.5 8.5 12.05 8.5q-1.475 0-2.488 1.025Q8.55 10.55 8.55 12q0 1.45 1.012 2.475Q10.575 15.5 12.05 15.5Zm0-2q-.625 0-1.062-.438-.438-.437-.438-1.062t.438-1.062q.437-.438 1.062-.438t1.063.438q.437.437.437 1.062t-.437 1.062q-.438.438-1.063.438ZM12 12Zm-1 8h1.975l.35-2.65q.775-.2 1.438-.588.662-.387 1.212-.937l2.475 1.025.975-1.7-2.15-1.625q.125-.35.175-.738.05-.387.05-.787t-.05-.788q-.05-.387-.175-.737l2.15-1.625-.975-1.7-2.475 1.05q-.55-.575-1.212-.963-.663-.387-1.438-.587L13 4h-1.975l-.35 2.65q-.775.2-1.437.587-.663.388-1.213.938L5.55 7.15l-.975 1.7 2.15 1.6q-.125.375-.175.75-.05.375-.05.8 0 .4.05.775t.175.75l-2.15 1.625.975 1.7 2.475-1.05q.55.575 1.213.962.662.388 1.437.588Z\"/>'

            const optionsButton = "<svg style=\"display: inline; vertical-align: middle;\" viewBox=\"0 0 24 24\" height=\"24\" width=\"24\" preserveAspectRatio=\"xMidYMid meet\">" + path + " </svg>"
            newFooterParagraph.innerHTML = "<p>use the options button " + optionsButton + " to make GPT answers appear here automatically.</p>"
            chrome.storage.local.set({
                optionsHintShown: result + 1,
            }, () => {
            })
        }
    })
}

chrome.storage.local.onChanged.addListener(changes => {
  if (changes.apiKeys || changes.apiChoice) {
    location.reload();
  }
});

function injectUI(mainNode) {
  const footer = mainNode.getElementsByTagName('footer')[0];
  if (!footer || mainNode.querySelector('.gptbtn')) {
    return;
  }
  globalMainNode = mainNode;
  readData();
// Create a new footer element with the same HTML content as the original
    const {
        newFooter,
        gptButtonObject,
        improveButtonObject,
        copyButton
      } = createGptFooter(footer, mainNode);
    globalGptButtonObject = gptButtonObject;
    globalImproveButtonObject = improveButtonObject;
    newFooterParagraph = newFooter.querySelectorAll('.selectable-text.copyable-text')[0];
    newFooterParagraph.classList.add('gpt-message');
    maybeShowOptionsHintInResponseField();
    copyButton.addEventListener('click', () => {
        copyToSendField(newFooterParagraph.textContent);
    });
    // Removed legacy privacy notice to streamline the suggestion bar UI
    parseHtmlFunction = async function () {
        const {chatHistoryShort, lastIsMine} = extractConversation(mainNode);
        let prompt = await createPrompt(lastIsMine, chatHistoryShort);
        activeButtonObject = gptButtonObject;
        activeButtonObject.setBusy(true);
        streamingText = '';
        writeTextToSuggestionField('', true);
        await chrome.runtime.sendMessage({
            message: "sendChatToGpt",
            prompt: prompt,
        });
    };
  const gptButton = gptButtonObject.gptButton;
  gptButton.addEventListener('click', () => {
    gptButtonClicked();
  });
  const improveButton = improveButtonObject.gptButton;
  improveButton.addEventListener('click', improveButtonClicked);

  // Watch input changes to toggle the "Improve my response" button
  const textarea = mainNode.querySelector('[contenteditable="true"]');
  if (textarea) {
    // React to typing, pasting, and other edits in real time
    ['input', 'keyup', 'paste', 'cut'].forEach(evt =>
      textarea.addEventListener(evt, updateImproveButtonState)
    );
    // Observe programmatic changes to the draft text
    const observer = new MutationObserver(updateImproveButtonState);
    observer.observe(textarea, {childList: true, characterData: true, subtree: true});
    textarea.__improveObserver = observer; // keep reference to avoid GC
    updateImproveButtonState();
  }
}

const observer = new MutationObserver(mutations => {
  mutations.forEach(mutation => {
    if (mutation.type === 'childList') {
      const main = document.getElementById('main');
      if (main && !main.querySelector('.gptbtn')) {
        injectUI(main);
      }
      mutation.addedNodes.forEach(node => {
        if (node.getAttribute && node.getAttribute('role') === 'row') {
          // auto-trigger removed
        }
      });
    }
  });
});


function initExtension() {
  readData();
  const main = document.getElementById('main');
  if (main) {
    injectUI(main);
  }
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

initExtension();

async function writeTextToSuggestionField(response, isLoading = false) {
  try {
    if (isLoading) {
      // Clear text while loading; button spinner handles visual feedback
      newFooterParagraph.textContent = '';
    } else {
      newFooterParagraph.textContent = response;
    }
  } catch (e) {
    console.error(e);
    if (showToast) showToast('Failed to update suggestion');
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'token') {
    streamingText += request.data;
    writeTextToSuggestionField(streamingText);
  } else if (request.type === 'done') {
    if (activeButtonObject) activeButtonObject.setBusy(false);
  } else if (request.type === 'error') {
    if (activeButtonObject) activeButtonObject.setBusy(false);
    writeTextToSuggestionField(request.data || 'Failed to generate reply');
    if (showToast) showToast(request.data || 'Failed to generate reply');
  } else if (request.type === 'showToast') {
    if (showToast) showToast(request.message);
  } else if (request.message === 'gptResponse') {
    const response = request.response;
    if (activeButtonObject) activeButtonObject.setBusy(false);
    if (response.error !== null && response.error !== undefined) {
      writeTextToSuggestionField(response.error.message);
      return;
    }
    writeTextToSuggestionField(response.text.replace(/^Me:\s*/, ''));
  }
  return true;
});

})();
