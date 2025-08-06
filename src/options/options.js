import {strToBuf, bufToB64, b64ToBuf, DEFAULT_PROMPT, getDefaultModel} from '../utils.js';

document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();
  renderHistory();
});
document.getElementById('options-form').addEventListener('submit', saveOptions);
document.getElementById('download-csv').addEventListener('click', downloadCsv);

const apiChoiceSelect = document.getElementById('api-choice');
const apiKeyInput = document.getElementById('api-key');
const modelInput = document.getElementById('model-name');
const toggleBtn = document.getElementById('toggle-api-key');
const feedbackBox = document.getElementById('api-key-feedback');

let apiKeys = {};
let modelNames = {};
let encKeyB64 = '';
let validateTimeout;

apiChoiceSelect.addEventListener('change', () => {
  loadProviderFields(apiChoiceSelect.value);
  clearTimeout(validateTimeout);
  validateTimeout = setTimeout(validateApiKey, 500);
});

apiKeyInput.addEventListener('input', () => {
  clearTimeout(validateTimeout);
  validateTimeout = setTimeout(validateApiKey, 500);
});

toggleBtn.addEventListener('click', () => {
  const isText = apiKeyInput.type === 'text';
  apiKeyInput.type = isText ? 'password' : 'text';
  toggleBtn.textContent = isText ? '👁' : '🙈';
  toggleBtn.setAttribute('aria-label', isText ? 'Show API key' : 'Hide API key');
});

function setFeedback(message, type) {
  feedbackBox.textContent = message;
  feedbackBox.classList.remove('success', 'error');
  apiKeyInput.classList.remove('success', 'error');
  if (!message) {
    feedbackBox.style.display = 'none';
    return;
  }
  feedbackBox.style.display = 'block';
  if (type) {
    feedbackBox.classList.add(type);
    apiKeyInput.classList.add(type);
  }
}

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
  const provider = apiChoiceSelect.value;
  if (!apiKey) {
    setFeedback('', '');
    return;
  }
  let url;
  let headers = {};
  if (provider === 'openrouter') {
    url = 'https://openrouter.ai/api/v1/models';
    headers = {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://web.whatsapp.com',
      'X-Title': 'AI Suggested Replies For WhatsApp'
    };
  } else if (provider === 'anthropic') {
    url = 'https://api.anthropic.com/v1/models';
    headers = {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    };
  } else if (provider === 'mistral') {
    url = 'https://api.mistral.ai/v1/models';
    headers = {Authorization: `Bearer ${apiKey}`};
  } else {
    url = 'https://api.openai.com/v1/models';
    headers = {Authorization: `Bearer ${apiKey}`};
  }
  try {
    const res = await fetch(url, {headers});
    setFeedback(res.ok ? 'Key verified' : 'Key not verified', res.ok ? 'success' : 'error');
  } catch {
    setFeedback('Key not verified', 'error');
  }
}

async function saveOptions(e) {
  e.preventDefault();
  const provider = apiChoiceSelect.value;
  const apiKey = apiKeyInput.value.trim();
  const modelName = modelInput.value.trim();
  const promptTemplate = document.getElementById('prompt-template').value;
  const showAdvancedImprove = document.getElementById('show-advanced-improve').checked;

  const key = await getOrCreateEncKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  let encrypted;
  if (apiKey) {
    encrypted = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, strToBuf(apiKey));
    apiKeys[provider] = {encryptedKey: bufToB64(encrypted), iv: bufToB64(iv)};
  } else {
    delete apiKeys[provider];
  }
  if (modelName) {
    modelNames[provider] = modelName;
  } else {
    delete modelNames[provider];
  }

  const prev = await chrome.storage.local.get({showAdvancedImprove: false});
  const storeObj = {
    apiChoice: provider,
    apiKeys,
    modelNames,
    promptTemplate,
    showAdvancedImprove
  };

  chrome.storage.local.set(storeObj, () => {
    if (showAdvancedImprove && !prev.showAdvancedImprove) {
      refreshWhatsAppTabs();
    }
    const alertBox = document.querySelector('.toast');
    alertBox.style.display = 'block';
    setTimeout(() => {
      alertBox.style.display = 'none';
      window.close();
    }, 2000);
  });
}

async function loadProviderFields(provider) {
  apiKeyInput.value = '';
  modelInput.value = modelNames[provider] || '';
  modelInput.placeholder = getDefaultModel(provider);
  if (!apiKeys[provider] || !encKeyB64) return;
  try {
    const key = await crypto.subtle.importKey('raw', b64ToBuf(encKeyB64), 'AES-GCM', false, ['decrypt']);
    const {encryptedKey, iv} = apiKeys[provider];
    const decrypted = await crypto.subtle.decrypt({name: 'AES-GCM', iv: b64ToBuf(iv)}, key, b64ToBuf(encryptedKey));
    apiKeyInput.value = new TextDecoder().decode(decrypted);
  } catch {
    apiKeyInput.value = '';
  }
}

async function restoreOptions() {
  const items = await chrome.storage.local.get({
    apiChoice: 'openai',
    apiKeys: {},
    modelNames: {},
    promptTemplate: DEFAULT_PROMPT,
    showAdvancedImprove: false,
    encKey: ''
  });
  apiKeys = items.apiKeys;
  modelNames = items.modelNames;
  encKeyB64 = items.encKey;
  apiChoiceSelect.value = items.apiChoice;
  document.getElementById('prompt-template').value = items.promptTemplate;
  document.getElementById('show-advanced-improve').checked = items.showAdvancedImprove;
  await loadProviderFields(items.apiChoice);
  validateApiKey();
}

async function renderHistory() {
  const {history = []} = await chrome.storage.local.get({history: []});
  const tbody = document.querySelector('#history-table tbody');
  tbody.innerHTML = '';
  for (const item of history) {
    const tr = document.createElement('tr');
    const cells = [
      new Date(item.timestamp).toLocaleString(),
      item.provider,
      item.model,
      item.prompt,
      item.tokensPrompt,
      item.tokensCompletion,
      item.tokensTotal,
      item.responseTime
    ];
    for (const cell of cells) {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

async function downloadCsv() {
  const {history = []} = await chrome.storage.local.get({history: []});
  const headers = ['timestamp','provider','model','prompt','tokensPrompt','tokensCompletion','tokensTotal','responseTime'];
  let csv = headers.join(',') + '\n';
  for (const item of history) {
    const row = [
      new Date(item.timestamp).toISOString(),
      item.provider,
      item.model,
      item.prompt,
      item.tokensPrompt,
      item.tokensCompletion,
      item.tokensTotal,
      item.responseTime
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    csv += row + '\n';
  }
  const blob = new Blob([csv], {type: 'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'history.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function refreshWhatsAppTabs() {
  const files = ['parser.js', 'uiStuff.js', 'confirmDialog.js', 'improveDialog.js', 'contentScript.js'];
  chrome.tabs.query({url: 'https://web.whatsapp.com/*'}, tabs => {
    for (const tab of tabs) {
      chrome.scripting.executeScript({target: {tabId: tab.id}, files}, () => {
        if (chrome.runtime.lastError) {
          chrome.tabs.reload(tab.id);
        }
      });
    }
  });
}
