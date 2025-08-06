// contentScript.js - version 2025-08-05T00:44:54Z
'use strict';

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
  --gpt-btn-bg: #007bff;
  --gpt-btn-text: #fff;
  --gpt-btn-spinner-border: rgba(255, 255, 255, 0.3);
  --gpt-btn-spinner-top: #fff;
  --message-spinner-border: rgba(0, 0, 0, 0.1);
  --message-spinner-top: #54656F;
}

@media (prefers-color-scheme: dark) {
  :root {
    --gpt-btn-bg: #0056b3;
    --gpt-btn-text: #fff;
    --gpt-btn-spinner-border: rgba(255, 255, 255, 0.3);
    --gpt-btn-spinner-top: #fff;
    --message-spinner-border: rgba(255, 255, 255, 0.1);
    --message-spinner-top: #d1d7db;
  }
}

.gptbtn {
  position: relative;
  display: inline-block;
  padding: 12px 24px;
  font-size: 16px;
  font-weight: bold;
  text-align: center;
  text-decoration: none;
  color: var(--gpt-btn-text);
  background-color: var(--gpt-btn-bg);
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.gptbtn .gptbtn-text {
  z-index: 1;
}

.gptbtn .spinner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 20px;
  height: 20px;
  border: 3px solid var(--gpt-btn-spinner-border);
  border-top-color: var(--gpt-btn-spinner-top);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  z-index: 0;
  opacity: 0;
  pointer-events: none;
}

.gptbtn.loading .gptbtn-text {
  opacity: 0;
  pointer-events: none;
}

.gptbtn.loading .spinner {
  opacity: 1;
  pointer-events: auto;
}

.selectable-text.copyable-text {
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.selectable-text.copyable-text .spinner {
  display: block;
  width: 24px;
  height: 24px;
  border: 3px solid var(--message-spinner-border);
  border-top-color: var(--message-spinner-top);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  margin: 8px auto;
  position: relative;
  transform-origin: center;
}
`;
document.head.appendChild(style);

// let apiKey;
let sendHistory = false;
let apiKey = null;
let streamingText = '';

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.apiKey) {
      apiKey = changes.apiKey.newValue;
    }
    if (changes.sendHistory) {
      const {oldValue, newValue} = changes.sendHistory;
      sendHistory = newValue;
      if (newValue === 'auto' && oldValue !== 'auto') {
        triggerEvent();
      }
    }
  }
});

function readData() {
  try {
    chrome.storage.local.get(
      {
        apiKey: '',
        sendHistory: 'manual',
      },
      result => {
        apiKey = result.apiKey;
        sendHistory = result.sendHistory;
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
    let promptPrefix1 = "You are an excellent chat-turn completer for Whatsapp. Your own turns in the provided chat-history are prefixed by 'Me: ', the turns of others by '<integer>: '. In a one-on-one coversation the other's turn is prefixed by '1: '.";
    if (lastIsMine) {
        promptCenter = 'Complete the following chat by providing a second message for my double-texting sequence. Do not react but continue the thought, elaborate, or add a supplementary point, without repeating the last utterance.';
    } else {
        promptCenter = 'As "Me", give an utterance completing the following chat conversation flow.';
    }

    const result = await new Promise((resolve) => {
        chrome.storage.local.get({
            toneOfVoice: 'Use Emoji and my own writing style. Be concise.'
        }, resolve);
    });

    const tone_of_voice = result.toneOfVoice;
    let prompt = promptPrefix1 + ' ' + promptCenter + ' ' + tone_of_voice + '\n\n' + "chat history:\n" + chatHistoryShort + "\n\n" + mePrefix;
    return prompt;
}

function extractConversation(node) {
    return parseHtml(node);
}

function showPromptEditor() {
  chrome.storage.local.get({toneOfVoice: 'Use Emoji and my own writing style. Be concise.'}, ({toneOfVoice}) => {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '20%';
    overlay.style.left = '50%';
    overlay.style.transform = 'translateX(-50%)';
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    overlay.style.background = prefersDark ? '#1e1e1e' : '#fff';
    overlay.style.color = prefersDark ? '#fff' : '#000';
    overlay.style.border = prefersDark ? '1px solid #444' : '1px solid #ccc';
    overlay.style.padding = '10px';
    overlay.style.zIndex = '10000';
    const textarea = document.createElement('textarea');
    textarea.rows = 4;
    textarea.style.width = '200px';
    if (prefersDark) {
      textarea.style.background = '#2b2b2b';
      textarea.style.color = '#fff';
      textarea.style.border = '1px solid #444';
    }
    textarea.value = toneOfVoice;
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset to default';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    saveBtn.addEventListener('click', () => {
      chrome.storage.local.set({toneOfVoice: textarea.value});
      document.body.removeChild(overlay);
    });
    resetBtn.addEventListener('click', () => {
      textarea.value = 'Use Emoji and my own writing style. Be concise.';
    });
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
    });
    overlay.appendChild(textarea);
    overlay.appendChild(saveBtn);
    overlay.appendChild(resetBtn);
    overlay.appendChild(cancelBtn);
    document.body.appendChild(overlay);
  });
}

let globalGptButtonObject;

function gptButtonClicked() {
    chrome.storage.local.get({
        askedForPermission: false,
    }, (result) => {
        if (!result.askedForPermission) {
            let message = "<ul>" +
                "<li>The last 10 messages of your chat-conversation will be sent to openai, each time you press this button.</li>" +
                "<li>They are handled by openai according to their <a href='https://openai.com/policies/api-data-usage-policies' target='_blank'>api-documentation</a> and <a href='https://openai.com/policies/privacy-policy' target='_blank'>privacy policy</a>.</li>" +
                "<li>This is less secure than the end-to-end encryption that <a href='https://faq.whatsapp.com/820124435853543/?helpref=uf_share' target='_blank'>WhatsApp(tm) uses</a>.</li>" +
                "</ul><br><br>" +
                "<p style=\"display: inline-block; text-align: center; width: 100%;\">Are you ok with that?</p>"
            confirmDialog(message).then((result) => {
                if (result) {
                    chrome.storage.local.set({
                        askedForPermission: true,
                    }, () => {
                    })
                    triggerEvent()
                }
            })
        } else {
            triggerEvent()
        }
    })
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

chrome.storage.local.onChanged.addListener((changes) => {
    if (changes.sendHistory || changes.apiKey || changes.apiChoice) {
        location.reload();
    }
});

function injectUI(addedNode) {
    const mainNode = addedNode;
    globalMainNode = addedNode;
    readData();
    const footer = mainNode.getElementsByTagName('footer')[0];
    footer.querySelectorAll('.selectable-text.copyable-text')[0];
// Create a new footer element with the same HTML content as the original
    const {
        newFooter,
        gptButtonObject,
        copyButton
    } = createGptFooter(footer, addedNode);
    globalGptButtonObject = gptButtonObject;
    newFooterParagraph = newFooter.querySelectorAll('.selectable-text.copyable-text')[0];
    maybeShowOptionsHintInResponseField();
    copyButton.addEventListener('click', () => {
        copyToSendField(newFooterParagraph.textContent);
    });
    const buttonContainer = copyButton.parentNode;
    const editButton = document.createElement('button');
    editButton.textContent = 'Edit Prompt';
    editButton.style.marginRight = '10px';
    editButton.style.fontSize = '12px';
    editButton.addEventListener('click', showPromptEditor);
    buttonContainer.insertBefore(editButton, copyButton);
    const privacyNotice = document.createElement('div');
    privacyNotice.style.fontSize = '10px';
    privacyNotice.style.color = '#54656F';
    privacyNotice.style.position = 'relative';
  privacyNotice.textContent = 'Messages are sent to the configured AI provider for processing ';
    const infoIcon = document.createElement('span');
    infoIcon.textContent = 'ℹ️';
    infoIcon.style.cursor = 'pointer';
    privacyNotice.appendChild(infoIcon);
    const tooltip = document.createElement('div');
    tooltip.style.position = 'absolute';
    tooltip.style.bottom = '100%';
    tooltip.style.left = '0';
    tooltip.style.background = '#fff';
    tooltip.style.border = '1px solid #ccc';
    tooltip.style.padding = '4px';
    tooltip.style.display = 'none';
    tooltip.style.zIndex = '1000';
    tooltip.style.fontSize = '10px';
  tooltip.innerHTML = 'Messages are sent to your configured AI provider for processing. <a href="#" id="privacy-link">Options</a>';
    privacyNotice.appendChild(tooltip);
    infoIcon.addEventListener('mouseenter', () => tooltip.style.display = 'block');
    infoIcon.addEventListener('mouseleave', () => tooltip.style.display = 'none');
    tooltip.addEventListener('mouseleave', () => tooltip.style.display = 'none');
    tooltip.querySelector('#privacy-link').addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.sendMessage({action: 'openOptionsPage'});
    });
    newFooter.appendChild(privacyNotice);
    parseHtmlFunction = async function () {
        const {chatHistoryShort, lastIsMine} = extractConversation(addedNode);
        let prompt = await createPrompt(lastIsMine, chatHistoryShort);
        gptButtonObject.setBusy(true);
        streamingText = '';
        writeTextToSuggestionField('', true);
        await chrome.runtime.sendMessage({
            message: "sendChatToGpt",
            prompt: prompt,
        });
    };
    if (sendHistory === 'auto') {
        triggerEvent()
    }
    const gptButton = gptButtonObject.gptButton;
    gptButton.addEventListener('click', () => {
        gptButtonClicked();

    });
}

const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
        // Check if a node was added
        if (mutation.type === 'childList') {
            // Get the added node's ID
            mutation.addedNodes.forEach(function (addedNode) {
                const addedNodeId = addedNode.id
                if (addedNodeId === 'main') {
                    injectUI(addedNode);
                } else if (addedNode.role === 'row') { // when chat messages come in (or are sent out by me)
                    if (sendHistory === 'auto') {
                        triggerEvent()
                    }
                }
            })
        }
    })
});

let confirmVisible = false;

function initExtension() {
    readData();
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

initExtension();

async function writeTextToSuggestionField(response, isLoading = false) {
    try {
        if (isLoading) {
            newFooterParagraph.style.whiteSpace = 'nowrap';
            newFooterParagraph.style.display = 'flex';
            newFooterParagraph.style.alignItems = 'center';
            newFooterParagraph.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display: inline-block; vertical-align: middle;">
                    <style>
                        .spinner {
                            transform-origin: center;
                            animation: spin 0.6s linear infinite;
                        }
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    </style>
                    <circle class="spinner" cx="12" cy="12" r="10" stroke="#54656F" stroke-width="3" fill="none" stroke-dasharray="15, 85" stroke-dashoffset="0"/>
                </svg>`;
        } else {
            newFooterParagraph.style.whiteSpace = 'normal';
            newFooterParagraph.style.display = 'block';
            newFooterParagraph.innerHTML = response;
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
    globalGptButtonObject.setBusy(false);
  } else if (request.type === 'error') {
    globalGptButtonObject.setBusy(false);
    writeTextToSuggestionField(request.data || 'Failed to generate reply');
    if (showToast) showToast(request.data || 'Failed to generate reply');
  } else if (request.type === 'showToast') {
    if (showToast) showToast(request.message);
  } else if (request.message === 'gptResponse') {
    const response = request.response;
    globalGptButtonObject.setBusy(false);
    if (response.error !== null && response.error !== undefined) {
      writeTextToSuggestionField(response.error.message);
      return;
    }
    writeTextToSuggestionField(response.text.replace(/^Me:\s*/, ''));
  }
  return true;
});
