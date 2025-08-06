import {strToBuf, bufToB64, b64ToBuf, DEFAULT_PROMPT} from '../utils.js';

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('options-form').addEventListener('submit', saveOptions);

const apiKeyInput = document.getElementById('api-key');
const apiChoiceSelect = document.getElementById('api-choice');
const modelChoiceSelect = document.getElementById('model-choice');
const toggleBtn = document.getElementById('toggle-api-key');
const statusIcon = document.getElementById('api-key-status');

let validateTimeout;

apiKeyInput.addEventListener('input', () => {
  clearTimeout(validateTimeout);
  validateTimeout = setTimeout(validateApiKey, 500);
});

apiChoiceSelect.addEventListener('change', () => {
  clearTimeout(validateTimeout);
  validateTimeout = setTimeout(validateApiKey, 500);
});

toggleBtn.addEventListener('click', () => {
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
});


const chatHistoryWarningAlert = document.getElementById('chatHistoryWarningAlert');

const closeAlertButton = document.querySelector('#hideHistoryWarningAlert');

function showCustomAlert() {
    chatHistoryWarningAlert.style.visibility = 'visible';
}

function hideCustomAlert() {
    chatHistoryWarningAlert.style.visibility = 'hidden';
}

closeAlertButton.addEventListener('click', function () {
    hideCustomAlert();
});

document.getElementById('send-history-auto').addEventListener('click', function () {
    showCustomAlert();
});

async function getOrCreateEncKey() {
  const {encKey} = await chrome.storage.local.get({encKey: ''});
  if (encKey) {
    return crypto.subtle.importKey('raw', b64ToBuf(encKey), 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  const key = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, true, ['encrypt', 'decrypt']);
  const raw = await crypto.subtle.exportKey('raw', key);
  await chrome.storage.local.set({encKey: bufToB64(raw)});
  return key;
}

async function validateApiKey() {
  const apiKey = apiKeyInput.value.trim();
  const apiChoice = apiChoiceSelect.value;
  if (!apiKey) {
    statusIcon.textContent = '';
    return;
  }
  let url;
  let headers = {};
  if (apiChoice === 'openrouter') {
    url = 'https://openrouter.ai/api/v1/models';
    headers = {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://web.whatsapp.com',
      'X-Title': 'AI Suggested Replies For WhatsApp'
    };
  } else if (apiChoice === 'claude') {
    url = 'https://api.anthropic.com/v1/models';
    headers = {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    };
  } else if (apiChoice === 'mistral') {
    url = 'https://api.mistral.ai/v1/models';
    headers = {Authorization: `Bearer ${apiKey}`};
  } else {
    url = 'https://api.openai.com/v1/models';
    headers = {Authorization: `Bearer ${apiKey}`};
  }
  try {
    const res = await fetch(url, {headers});
    statusIcon.textContent = res.ok ? '✅' : '❌';
  } catch {
    statusIcon.textContent = '❌';
  }
}

async function saveOptions(e) {
  e.preventDefault();
  const apiKey = document.getElementById('api-key').value;
  const sendHistory = document.querySelector('input[name="send-history"]:checked').value;
  const toneOfVoice = document.getElementById('tone-of-voice').value;
  const promptTemplate = document.getElementById('prompt-template').value;
  const apiChoice = apiChoiceSelect.value;
  const modelChoice = modelChoiceSelect.value;

  const key = await getOrCreateEncKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, strToBuf(apiKey));

  const storeObj = {
    sendHistory: sendHistory,
    apiChoice: apiChoice,
    modelChoice: modelChoice,
    toneOfVoice: toneOfVoice,
    promptTemplate: promptTemplate,
    encryptedApiKey: bufToB64(encrypted),
    iv: bufToB64(iv),
    apiKey: ''
  };

  chrome.storage.local.set(storeObj, () => {
    const alertBox = document.querySelector('.toast');
    alertBox.style.display = 'block';
    setTimeout(function () {
      alertBox.style.display = 'none';
      window.close();
    }, 2000);
  });
}

async function restoreOptions() {
  const items = await chrome.storage.local.get({
    apiKey: '',
    encryptedApiKey: '',
    iv: '',
    encKey: '',
    sendHistory: 'manual',
    apiChoice: 'openai',
    modelChoice: 'gpt-4o-mini',
    toneOfVoice: 'Use Emoji and my own writing style. Be concise.',
    promptTemplate: DEFAULT_PROMPT
  });
  if (items.encryptedApiKey && items.iv && items.encKey) {
    try {
      const key = await crypto.subtle.importKey('raw', b64ToBuf(items.encKey), 'AES-GCM', false, ['decrypt']);
      const decrypted = await crypto.subtle.decrypt({name: 'AES-GCM', iv: b64ToBuf(items.iv)}, key, b64ToBuf(items.encryptedApiKey));
      apiKeyInput.value = new TextDecoder().decode(decrypted);
    } catch {
      apiKeyInput.value = '';
    }
  } else {
    apiKeyInput.value = items.apiKey;
  }
  document.getElementById('tone-of-voice').value = items.toneOfVoice;
  document.getElementById('prompt-template').value = items.promptTemplate;
  apiChoiceSelect.value = items.apiChoice;
  modelChoiceSelect.value = items.modelChoice;

  const sendHistoryRadio = document.querySelector(`input[name="send-history"][value="${items.sendHistory}"]`);
  if (sendHistoryRadio) {
    sendHistoryRadio.checked = true;
  }
  validateApiKey();
}
