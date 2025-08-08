import {strToBuf, bufToB64, b64ToBuf, DEFAULT_PROMPT, getDefaultModel} from '../utils.js';

document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();
  reloadLogsAndSummary();
  setupNavigation();
});
document.getElementById('options-form').addEventListener('submit', saveOptions);
document.getElementById('download-csv').addEventListener('click', downloadCsv);
const clearLogsBtn = document.getElementById('clear-logs');
if (clearLogsBtn) {
  clearLogsBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove('history');
    reloadLogsAndSummary();
  });
}

const apiChoiceSelect = document.getElementById('api-choice');
const apiKeyInput = document.getElementById('api-key');
const modelInput = document.getElementById('model-name');
const toggleBtn = document.getElementById('toggle-api-key');
const eyeImg = toggleBtn.querySelector('img');
const showIcon = '../icons/Eye Icon - Show Password.svg';
const hideIcon = '../icons/Eye Icon - Hide Password.svg';
const feedbackBox = document.getElementById('api-key-feedback');
const saveBtn = document.getElementById('save-button');

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
  eyeImg.src = isText ? showIcon : hideIcon;
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
    setFeedback(res.ok ? 'Key verified' : 'Invalid key', res.ok ? 'success' : 'error');
  } catch {
    setFeedback('Error verifying key', 'error');
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
    const original = saveBtn.textContent;
    saveBtn.textContent = 'Saved';
    setTimeout(() => {
      saveBtn.textContent = original;
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

function renderSummary(logs) {
  const el = document.getElementById('llm-summary');
  if (!el) return;

  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  let filtered = logs.filter(l => (now - (l.ts || l.timestamp || 0)) <= sevenDays);
  if (!filtered.length) filtered = logs.slice(-100);

  const total = filtered.length;
  const errors = filtered.filter(l => l.status === 'error').length;
  const success = total - errors;
  const errorRate = total ? ((errors / total) * 100).toFixed(1) : '0.0';

  const nums = arr => arr.filter(v => typeof v === 'number' && !isNaN(v));
  const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  const durs = nums(filtered.map(l => l.durationMs || l.responseTime));
  const pTok = nums(filtered.map(l => l.tokensPrompt));
  const cTok = nums(filtered.map(l => l.tokensCompletion));
  const tTok = nums(filtered.map(l => l.tokensTotal));

  const data = [
    `Total: ${total}`,
    `Success: ${success}`,
    `Errors: ${errors}`,
    `Error Rate: ${errorRate}%`,
    `Avg Duration: ${avg(durs)} ms`,
    `Avg Tokens — P:${avg(pTok)} C:${avg(cTok)} T:${avg(tTok)}`
  ];

  el.innerHTML = data.map(txt => `<span class="chip">${txt}</span>`).join('');
}

function stripSystemPrompt(raw) {
  if (!raw) return '';
  const text = String(raw);
  const markers = [
    'Your task:',
    'Guidelines:',
    'Output format:',
    'As "Me", give an utterance'
  ];
  const chatMarker = 'chat history:';
  const chatIdx = text.toLowerCase().indexOf(chatMarker);
  if (chatIdx > -1) {
    return text.slice(chatIdx + chatMarker.length).trim();
  }
  let idx = -1;
  for (const m of markers) {
    const i = text.indexOf(m);
    if (i > -1) idx = Math.max(idx, i);
  }
  return idx > -1 ? text.slice(idx + 1).trim() : text;
}

function renderLlmHistoryTable(logs) {
  const tbody = document.querySelector('#history-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  logs.forEach(log => {
    const row = document.createElement('tr');

    const ts = document.createElement('td');
    ts.textContent = new Date(log.timestamp).toLocaleString();
    row.appendChild(ts);

    const model = document.createElement('td');
    model.textContent = log.model;
    row.appendChild(model);

    const pTok = document.createElement('td');
    pTok.textContent = log.tokensPrompt ?? '—';
    row.appendChild(pTok);

    const chatCell = document.createElement('td');
    chatCell.classList.add('chat-history-cell');
    const clean = stripSystemPrompt(log.prompt || '');
    chatCell.innerHTML = clean.split('\n').map(line => `<div>${line}</div>`).join('');
    row.appendChild(chatCell);

    const cTok = document.createElement('td');
    cTok.textContent = log.tokensCompletion;
    row.appendChild(cTok);

    const tTok = document.createElement('td');
    tTok.textContent = log.tokensTotal;
    row.appendChild(tTok);

    const resp = document.createElement('td');
    resp.textContent = log.responseTime;
    row.appendChild(resp);

    tbody.appendChild(row);
  });
}

async function reloadLogsAndSummary() {
  const {history = []} = await chrome.storage.local.get({history: []});
  renderSummary(history);
  renderLlmHistoryTable(history);
}

async function downloadCsv() {
  const {history = []} = await chrome.storage.local.get({history: []});
  const headers = ['Timestamp','Provider','Model','Prompt Tokens','Completion Tokens','Total Tokens','Response Time (ms)'];
  let csv = headers.join(',') + '\n';
  for (const item of history) {
    const row = [
      new Date(item.timestamp).toISOString(),
      item.provider,
      item.model,
      item.tokensPrompt ?? '—',
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
  const files = ['parser.js', 'uiStuff.js', 'improveDialog.js', 'contentScript.js'];
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

function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const iconItems = document.querySelectorAll('.icon-item');
  const sections = document.querySelectorAll('.tab-content');
  const sidebar = document.getElementById('sidebar');
  const menuToggle = document.getElementById('menu-toggle');

  function showTab(id) {
    sections.forEach(sec => {
      sec.classList.toggle('active', sec.id === id);
    });
    [...navItems, ...iconItems].forEach(item => {
      const active = item.dataset.tab === id;
      item.classList.toggle('active', active);
      if (active) {
        item.setAttribute('aria-current', 'page');
      } else {
        item.removeAttribute('aria-current');
      }
    });
  }

  [...navItems, ...iconItems].forEach(item => {
    item.addEventListener('click', () => {
      showTab(item.dataset.tab);
      if (window.innerWidth <= 600) {
        sidebar.classList.remove('open');
      }
    });
  });

  menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });
}
