(async () => {
  // contentScript.js - version 2025-08-05T00:44:54Z
  'use strict';
  const {extensionEnabled = true} = await chrome.storage.local.get({extensionEnabled: true});
  // Apply extension theme when explicitly set (overrides WA/OS); 'auto' keeps defaults
  let themeMode = 'auto';
  try {
    const { themePreference = 'auto' } = await chrome.storage.sync.get({ themePreference: 'auto' });
    themeMode = themePreference || 'auto';
  } catch {}
  if (themeMode === 'light' || themeMode === 'dark') {
    document.documentElement.setAttribute('data-gpt-theme', themeMode);
  } else {
    document.documentElement.removeAttribute('data-gpt-theme');
  }
  if (!extensionEnabled) return;
  try {
    const { apiChoice = 'openai', providerUrls = {} } =
      await chrome.storage.local.get({ apiChoice: 'openai', providerUrls: {} });
    if (apiChoice === 'custom') {
      const base = (providerUrls.custom || '').trim();
      const valid = base && /^https?:\/\//i.test(base) && /^\/v1\/?$/.test(new URL(base).pathname);
      if (!valid) {
        console.warn('Extension passive mode: Custom provider not configured or invalid base; skipping UI injection.');
        return;
      }
    }
  } catch (e) {
    console.warn('Extension passive mode due to config parse error:', e);
    return;
  }
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

  .wa-reply-btn {
    background: #fafafa !important;
  }

  .wa-reply-btn:disabled {
    background: #fafafa !important;
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
  position: absolute;
  inset: 0;
  margin: auto;
  display: none; /* visible only in loading state */
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

.gpt-error-banner {
  background: #dc2626;
  color: #fff;
  padding: 8px 12px;
  border-radius: 4px;
  margin-bottom: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
}

.gpt-error-banner .gpt-error-actions {
  display: flex;
  gap: 8px;
  margin-left: 12px;
}

.gpt-error-banner .gpt-error-retry {
  background: #fff;
  color: #dc2626;
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  font-weight: bold;
}

.gpt-error-banner .gpt-error-retry:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.gpt-error-banner .gpt-error-close {
  cursor: pointer;
  font-weight: bold;
  background: transparent;
  border: none;
  color: #fff;
  font-size: 16px;
  line-height: 1;
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
// Append cross-theme icon filter variables used by our WA icons
style.textContent += `
:root { --icon-filter: none; }
/* WhatsApp toggles dark mode via body.dark */
body.dark { --icon-filter: invert(1) brightness(1.2); }
/* Fallback when WA hasn't set body.dark but OS prefers dark */
@media (prefers-color-scheme: dark) {
  body:not(.dark) { --icon-filter: invert(1) brightness(1.2); }
}
/* Extension theme overrides (take precedence when attribute is present) */
[data-gpt-theme="dark"] {
  --icon-filter: invert(1) brightness(1.2);
  --gpt-btn-spinner-border: rgba(255,255,255,.1);
  --gpt-btn-spinner-top: #d1d7db;
  --message-spinner-border: rgba(255,255,255,.1);
  --message-spinner-top: #d1d7db;
}
[data-gpt-theme="light"] {
  --icon-filter: none;
  --gpt-btn-spinner-border: rgba(0,0,0,.1);
  --gpt-btn-spinner-top: #54656F;
  --message-spinner-border: rgba(0,0,0,.1);
  --message-spinner-top: #54656F;
}
`;
document.head.appendChild(style);

  // Map in-flight requests so tokens/done/error land in the right chat
  const pendingRequests = new Map(); // requestId -> { paragraphEl, buttonObject, streamingText, timeoutId }
  function makeRequestId() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  function startTimeoutFor(requestId) {
    const id = setTimeout(() => {
      const entry = pendingRequests.get(requestId);
      if (!entry) return;
      const { buttonObject, paragraphEl } = entry;
      if (buttonObject) buttonObject.setBusy(false);
      if (paragraphEl) paragraphEl.textContent = 'No response from server. Please try again.';
      pendingRequests.delete(requestId);
      if (showToast) showToast('No response from server. Please try again.');
    }, 25000);
    const entry = pendingRequests.get(requestId) || {};
    entry.timeoutId = id;
    pendingRequests.set(requestId, entry);
  }
  function clearTimeoutFor(requestId) {
    const entry = pendingRequests.get(requestId);
    if (entry?.timeoutId) clearTimeout(entry.timeoutId);
    if (entry) entry.timeoutId = null;
  }

  let errorBanner;

  function hideErrorBanner() {
    if (errorBanner) {
      errorBanner.remove();
      errorBanner = null;
    }
  }

  function showErrorBanner(message) {
    hideErrorBanner();
    if (!newFooterParagraph) return;
    errorBanner = document.createElement('div');
    errorBanner.className = 'gpt-error-banner';
    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    const actions = document.createElement('span');
    actions.className = 'gpt-error-actions';
    const retryBtn = document.createElement('button');
    retryBtn.className = 'gpt-error-retry';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', () => {
      if (retryBtn.disabled) return;
      retryBtn.disabled = true;
      hideErrorBanner();
      if (lastPrompt && lastButtonObject) {
        sendPrompt(lastPrompt, lastButtonObject, lastInputChatData);
      }
    });
    const closeBtn = document.createElement('button');
    closeBtn.className = 'gpt-error-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', hideErrorBanner);
    actions.appendChild(retryBtn);
    actions.appendChild(closeBtn);
    errorBanner.appendChild(msgSpan);
    errorBanner.appendChild(actions);
    newFooterParagraph.parentNode.insertBefore(errorBanner, newFooterParagraph);
  }

  let loaderTimeoutId;

  function clearLoaderTimeout() {
    if (loaderTimeoutId) {
      clearTimeout(loaderTimeoutId);
      loaderTimeoutId = null;
    }
  }

  function startLoaderTimeout() {
    clearLoaderTimeout();
    loaderTimeoutId = setTimeout(() => {
      loaderTimeoutId = null;
      if (activeButtonObject) activeButtonObject.setBusy(false);
      writeTextToSuggestionField('No response from server. Please try again.');
      if (showToast) showToast('No response from server. Please try again.');
    }, 25000);
  }

  const MESSAGING_ERROR = 'Unable to communicate with the extension backend. Please refresh the page.';

  function handleMessagingError() {
    clearLoaderTimeout();
    if (activeButtonObject) activeButtonObject.setBusy(false);
    writeTextToSuggestionField('');
    showErrorBanner(MESSAGING_ERROR);
    if (showToast) showToast(MESSAGING_ERROR);
  }

function readData() {
  try {
    chrome.storage.local.get(
      {showAdvancedImprove: false},
      result => {
        showAdvancedImprove = result.showAdvancedImprove;
      }
    );
    chrome.storage.sync.get(
      {contextMessageLimit: 10},
      result => {
        contextMessageLimit = Math.min(100, Math.max(1, parseInt(result.contextMessageLimit, 10) || 10));
        window.contextMessageLimit = contextMessageLimit;
        if (observedChatContainer) {
          cachedMessages = extractRecentMessages({limit: contextMessageLimit, filtered: true});
        }
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

let parseHtmlFunction;

let cachedMessages = [];
let chatObserver;
let observedChatContainer;
let contextMessageLimit = 10;
let lastInputChatData = '';

function attachChatObserver(containerEl) {
  if (!containerEl) return;
  if (chatObserver) chatObserver.disconnect();
  chatObserver = new MutationObserver(() => {
    cachedMessages = extractRecentMessages({limit: contextMessageLimit, filtered: true});
  });
  chatObserver.observe(containerEl, {childList: true, subtree: true});
  cachedMessages = extractRecentMessages({limit: contextMessageLimit, filtered: true});
  observedChatContainer = containerEl;
}

function triggerEvent() {
    if (delayTimer) {
        clearTimeout(delayTimer);
    }
    delayTimer = setTimeout(parseHtmlFunction, 100); // Change 1000 to the delay time you want (in milliseconds)
}

let globalMainNode;
let newFooterParagraph;
let globalDeleteButton;

async function createPrompt(lastIsMine, chatHistoryShort, meta = {}) {
  const { chatType = 'dm', participants = [] } = meta;
  const mePrefix = 'Me: ';
  const promptCenter = lastIsMine
    ? 'There is no new partner message after my last one. Write a very brief, polite nudge from Me to elicit a reply (no new topics or plans).'
    : 'Write what Me should send next in direct reply to the most recent partner message.';

  const metaBlock =
    `\nChat metadata:\n- chat.type: ${chatType}\n- participants: ${participants.join(', ') || '(one-to-one)'}\n`;

  const { DEFAULT_PROMPT } = await import(chrome.runtime.getURL('utils.js'));
  const result = await new Promise(resolve => {
    chrome.storage.local.get({ promptTemplate: DEFAULT_PROMPT }, resolve);
  });
  const promptTemplate = result.promptTemplate;

  const prompt = `${promptTemplate}\n${promptCenter}${metaBlock}\nChat history:\n${chatHistoryShort}\n\n${mePrefix}`;
  return { prompt, metaBlock };
}

function extractConversation(node) {
  if (cachedMessages.length) {
    const chatHistoryShort = cachedMessages.join('\n\n');
    const lastExpr = cachedMessages[cachedMessages.length - 1] || '';
    const lastIsMine = lastExpr.includes('Me:');

    const participants = Array.from(new Set(
      cachedMessages
        .map(line => {
          const m = line.match(/^([^:]+):\s/);
          const name = m ? m[1].trim() : '';
          return name && name !== 'Me' ? name : null;
        })
        .filter(Boolean)
    ));
    const chatType = participants.length > 1 ? 'group' : 'dm';

    return {chatHistoryShort, lastIsMine, chatType, participants};
  }
  return parseHtml(node);
}

let globalGptButtonObject;
let globalImproveButtonObject;
let activeButtonObject; // Tracks which button initiated the current request
let showAdvancedImprove = false;
let lastPrompt;
let lastButtonObject;

// Helper to call the provided callback without extra confirmation
function withPermission(callback) {
  callback();
}

function sendPrompt(prompt, buttonObject, inputChatData) {
  const requestId = makeRequestId();
  lastPrompt = prompt;
  lastButtonObject = buttonObject;
  lastInputChatData = inputChatData || '';

  // Register routing for THIS chat’s UI elements
  pendingRequests.set(requestId, {
    paragraphEl: newFooterParagraph,
    buttonObject,
    streamingText: ''
  });

  activeButtonObject = buttonObject;
  buttonObject.setBusy(true);
  writeTextToSuggestionField('', true);
  startLoaderTimeout(); // keep your existing global as a safety timeout too
  startTimeoutFor(requestId); // request-scoped

  chrome.runtime.sendMessage(
    {
      message: 'sendChatToGpt',
      prompt,
      inputChatData,
      requestId
    },
    response => {
      if (chrome.runtime.lastError || !response) {
        clearTimeoutFor(requestId);
        const entry = pendingRequests.get(requestId);
        if (entry?.buttonObject) entry.buttonObject.setBusy(false);
        if (entry?.paragraphEl) entry.paragraphEl.textContent = '';
        pendingRequests.delete(requestId);
        handleMessagingError();
      }
    }
  );
}

// Triggered when the main "Suggest Response" button is clicked
function gptButtonClicked() {
  withPermission(() => {
    hideErrorBanner();
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
    hideErrorBanner();
    const { chatHistoryShort, chatType, participants } = extractConversation(globalMainNode);
    if (showAdvancedImprove) {
      const dialogResult = await showImproveDialog(chatHistoryShort, draft);
      if (!dialogResult) {
        return;
      }
      const { draft: userDraft, style, tone, instructions } = dialogResult;
      const { DEFAULT_PROMPT } = await import(chrome.runtime.getURL('utils.js'));
      const { promptTemplate } = await new Promise(resolve => {
        chrome.storage.local.get({ promptTemplate: DEFAULT_PROMPT }, resolve);
      });
      const parts = [`${promptTemplate}`, `Response style: ${style}`, `Tone: ${tone}`];
      if (instructions) parts.push(`Additional instructions: ${instructions}`);
      parts.push(`Chat metadata: chat.type=${chatType}; participants=${participants.join(', ') || '(one-to-one)'}`);
      parts.push(`\nChat history:\n${chatHistoryShort}\n\nMy draft:\n${userDraft}`);
      const prompt = parts.join('\n');
      const inputLog = `chat.type=${chatType}; participants=${participants.join(', ')}\n\n${chatHistoryShort}`;
      sendPrompt(prompt, globalImproveButtonObject, inputLog);
    } else {
      const { DEFAULT_PROMPT } = await import(chrome.runtime.getURL('utils.js'));
      const result = await new Promise(resolve => {
        chrome.storage.local.get({
          promptTemplate: DEFAULT_PROMPT
        }, resolve);
      });
      const template = result.promptTemplate;
      const parts = [
        `${template}`,
        `Chat metadata: chat.type=${chatType}; participants=${participants.join(', ') || '(one-to-one)'}`,
        'Here is my drafted response to the above chat. Please rewrite it to be clearer, more concise, and polite, while retaining my intent.',
        `\nchat history:\n${chatHistoryShort}\n\nmy draft:\n${draft}`
      ];
      const prompt = parts.join('\n');
      const inputLog = `chat.type=${chatType}; participants=${participants.join(', ')}\n\n${chatHistoryShort}`;
      sendPrompt(prompt, globalImproveButtonObject, inputLog);
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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.contextMessageLimit) {
    contextMessageLimit = Math.min(100, Math.max(1, parseInt(changes.contextMessageLimit.newValue, 10) || 10));
    window.contextMessageLimit = contextMessageLimit;
    if (observedChatContainer) {
      cachedMessages = extractRecentMessages({limit: contextMessageLimit, filtered: true});
    }
  }
});

function injectUI(mainNode) {
  const footer = mainNode.getElementsByTagName('footer')[0];
  if (!footer || mainNode.querySelector('.gptbtn')) {
    return;
  }
  globalMainNode = mainNode;
  const chatContainer = mainNode.querySelector('[role="region"]');
  if (chatContainer) attachChatObserver(chatContainer);
  readData();
// Create a new footer element with the same HTML content as the original
    const {
        newFooter,
        gptButtonObject,
        improveButtonObject,
        copyButton,
        deleteButton
      } = createGptFooter(footer, mainNode);
    globalGptButtonObject = gptButtonObject;
    globalImproveButtonObject = improveButtonObject;
    globalDeleteButton = deleteButton;
    newFooterParagraph = newFooter.querySelectorAll('.selectable-text.copyable-text')[0];
    newFooterParagraph.classList.add('gpt-message');
    maybeShowOptionsHintInResponseField();
    copyButton.addEventListener('click', () => {
        copyToSendField(newFooterParagraph.textContent);
    });
    deleteButton.addEventListener('click', () => {
      writeTextToSuggestionField('');
    });
    updateDeleteButtonVisibility();
    // Removed legacy privacy notice to streamline the suggestion bar UI
    parseHtmlFunction = async function () {
      const { chatHistoryShort, lastIsMine, chatType, participants } = extractConversation(mainNode);
      const { prompt, metaBlock } = await createPrompt(lastIsMine, chatHistoryShort, { chatType, participants });
      const logInput = `chat.type=${chatType}; participants=${participants.join(', ')}\n\n${chatHistoryShort}`;
      sendPrompt(prompt, gptButtonObject, logInput);
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
      if (main) {
        const container = main.querySelector('[role="region"]');
        if (container && container !== observedChatContainer) {
          attachChatObserver(container);
        }
        if (!main.querySelector('.gptbtn')) {
          injectUI(main);
        }
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

function updateDeleteButtonVisibility() {
  if (globalDeleteButton) {
    const hasText = !!(newFooterParagraph && newFooterParagraph.textContent.trim());
    globalDeleteButton.style.display = hasText ? 'block' : 'none';
  }
}

async function writeTextToSuggestionField(response, isLoading = false) {
  try {
    if (isLoading) {
      // Clear text while loading; button spinner handles visual feedback
      newFooterParagraph.textContent = '';
    } else {
      newFooterParagraph.textContent = response;
    }
    updateDeleteButtonVisibility();
  } catch (e) {
    console.error(e);
    if (showToast) showToast('Failed to update suggestion');
  }
}

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Clear per-request timeout when any terminal/streaming message arrives
    if (
      ['token', 'done', 'error'].includes(request.type) ||
      request.message === 'gptResponse'
    ) {
      if (request.requestId) clearTimeoutFor(request.requestId);
      clearLoaderTimeout();
    }

    const id = request.requestId;
    const entry = id ? pendingRequests.get(id) : null;

    if (request.type === 'token') {
      hideErrorBanner();
      if (entry) {
        entry.streamingText += request.data;
        if (entry.paragraphEl) entry.paragraphEl.textContent = entry.streamingText;
      }
    } else if (request.type === 'done') {
      if (entry?.buttonObject) entry.buttonObject.setBusy(false);
      pendingRequests.delete(id);
    } else if (request.type === 'error') {
      if (entry?.buttonObject) entry.buttonObject.setBusy(false);
      if (entry?.paragraphEl) entry.paragraphEl.textContent = '';
      const msg = request.error || request.data || 'Failed to generate reply';
      showErrorBanner(msg);
      if (showToast) showToast(msg);
      pendingRequests.delete(id);
    } else if (request.type === 'showToast') {
      if (showToast) showToast(request.message);
    } else if (request.message === 'gptResponse') {
      hideErrorBanner();
      if (entry?.buttonObject) entry.buttonObject.setBusy(false);
      if (entry?.paragraphEl && request.response?.text) {
        entry.paragraphEl.textContent = request.response.text.replace(/^Me:\s*/, '');
      }
      pendingRequests.delete(id);
    }

    sendResponse({received: true});
  });

})();
