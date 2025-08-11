import {strToBuf, bufToB64, b64ToBuf, DEFAULT_PROMPT, getDefaultModel, showToast, defaultBase, defaultAuth} from '../utils.js';

// --- Theme management: preference-aware (auto/light/dark) ---
let _osMediaQuery = null;

function setThemeAttr(mode) {
  document.documentElement.setAttribute('data-theme', mode);
}

function onOsThemeChange(e) {
  setThemeAttr(e.matches ? 'dark' : 'light');
}

function applyThemeFromPreference(pref) {
  // Clean up previous OS listeners
  if (_osMediaQuery) {
    try {
      _osMediaQuery.removeEventListener?.('change', onOsThemeChange);
      _osMediaQuery.removeListener?.(onOsThemeChange);
    } catch {}
    _osMediaQuery = null;
  }

  if (pref === 'light') {
    setThemeAttr('light');
    return;
  }
  if (pref === 'dark') {
    setThemeAttr('dark');
    return;
  }

  // Auto: follow OS
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  setThemeAttr(prefersDark ? 'dark' : 'light');

  try {
    _osMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    _osMediaQuery.addEventListener?.('change', onOsThemeChange);
    _osMediaQuery.addListener?.(onOsThemeChange); // legacy
  } catch {}
}

function nextTheme(pref) {
  if (pref === 'auto') return 'light';
  if (pref === 'light') return 'dark';
  return 'auto';
}

function labelFor(pref) {
  return `Theme: ${pref.charAt(0).toUpperCase()}${pref.slice(1)}`;
}

async function syncThemeToggleUi(pref) {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.setAttribute('aria-label', labelFor(pref));
  btn.title = labelFor(pref);
}

async function initThemeFromStorage() {
  const { themePreference = 'auto' } = await chrome.storage.sync.get({ themePreference: 'auto' });
  applyThemeFromPreference(themePreference);
  await syncThemeToggleUi(themePreference);

  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation(); // don’t trigger nav

      const { themePreference: cur = 'auto' } = await chrome.storage.sync.get({ themePreference: 'auto' });
      const next = nextTheme(cur);
      await chrome.storage.sync.set({ themePreference: next });
      applyThemeFromPreference(next);
      await syncThemeToggleUi(next);

      const name = next === 'auto' ? 'Auto theme' : (next === 'dark' ? 'Dark mode' : 'Light mode');
      try {
        const anchor = document.getElementById('theme-toggle');
        showToast(`${name} ON`, { anchor, align: 'right', duration: 1600, offset: 10 });
      } catch {}
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeFromStorage();
  restoreOptions();
  reloadLogsAndSummary();
  setupNavigation();
  loadReferences();
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
const contextLimitInput = document.getElementById('context-message-limit');
const endpointInput = document.getElementById('api-endpoint');
const authSchemeSelect = document.getElementById('auth-scheme');

let apiKeys = {};
let modelNames = {};
let encKeyB64 = '';
let validateTimeout;
let providerUrls = {};
let authSchemes = {};

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

authSchemeSelect.addEventListener('change', () => {
  toggleApiKeyRow();
  clearTimeout(validateTimeout);
  validateTimeout = setTimeout(validateApiKey, 300);
});

function showAuthRow(show) {
  const label = document.getElementById('auth-scheme-label') || document.querySelector('label[for="auth-scheme"]');
  const field = document.getElementById('auth-scheme-field') || document.getElementById('auth-scheme')?.closest('.stack') || document.getElementById('auth-scheme')?.parentElement;
  if (label) label.style.display = show ? '' : 'none';
  if (field) field.style.display = show ? '' : 'none';
}

function toggleApiKeyRow() {
  const keyLabel = document.querySelector('label[for="api-key"]');
  // The field container is the .stack right after the label
  const keyField = keyLabel ? keyLabel.nextElementSibling : null;

  const provider = apiChoiceSelect.value;
  const scheme = (provider === 'custom' ? (authSchemeSelect.value || 'none') : defaultAuth(provider));
  const needsKey = (scheme !== 'none');

  if (keyLabel) keyLabel.style.display = needsKey ? '' : 'none';
  if (keyField) keyField.style.display = needsKey ? '' : 'none';

  // Clear any validation text when hiding the key
  if (!needsKey) setFeedback('');
}

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

  const scheme = (provider === 'custom'
    ? (authSchemeSelect.value || 'none')
    : defaultAuth(provider));

  // For keyless custom endpoints, still try to fetch /models
  if (!apiKey && !(provider === 'custom' && scheme === 'none')) {
    setFeedback('', '');
    return;
  }

  let base = provider === 'custom'
    ? (endpointInput.value.trim() || providerUrls.custom || '')
    : defaultBase(provider);
  while (base.endsWith('/')) base = base.slice(0, -1);

  if (!base) {
    setFeedback('Enter a valid endpoint', 'error');
    return;
  }

  const url = `${base}/models`;
  const headers = {};
  if (scheme === 'bearer' && apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (scheme === 'x-api-key' && apiKey) headers['x-api-key'] = apiKey;
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://web.whatsapp.com';
    headers['X-Title'] = 'AI Suggested Replies For WhatsApp';
  }

  try {
    const res = await fetch(url, { headers });
    if (scheme === 'none') {
      setFeedback(res.ok ? 'Endpoint reachable' : `Endpoint error (${res.status})`, res.ok ? 'success' : 'error');
    } else {
      setFeedback(res.ok ? 'Key verified' : 'Invalid key', res.ok ? 'success' : 'error');
    }
  } catch (e) {
    setFeedback('Connection error (is the server running?)', 'error');
  }
}

async function saveOptions(e) {
  e.preventDefault();
  const provider = apiChoiceSelect.value;
  const apiKey = apiKeyInput.value.trim();
  const modelName = modelInput.value.trim();
  const promptTemplate = document.getElementById('prompt-template').value;
  const showAdvancedImprove = document.getElementById('show-advanced-improve').checked;
  const contextLimit = Math.min(100, Math.max(1, parseInt(contextLimitInput.value, 10) || 10));
  const endpoint = endpointInput?.value?.trim() || '';
  const authScheme = authSchemeSelect?.value || 'bearer';

  if (provider === 'custom') {
    if (endpoint) providerUrls.custom = endpoint;
    else delete providerUrls.custom;
    authSchemes.custom = authScheme;
  }

  const key = await getOrCreateEncKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  let encrypted;
  if (apiKey && !(provider === 'custom' && authScheme === 'none')) {
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
    showAdvancedImprove,
    providerUrls,
    authSchemes
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
  chrome.storage.sync.set({contextMessageLimit: contextLimit});

  if (provider === 'custom' && endpoint) {
    chrome.runtime.sendMessage({ message: 'providerChanged', providerUrl: endpoint }, () => {});
  }
}

async function loadProviderFields(provider) {
  apiKeyInput.value = '';
  modelInput.value = modelNames[provider] || '';
  modelInput.placeholder = getDefaultModel(provider);
  endpointInput.value = '';
  authSchemeSelect.value = 'bearer';

  if (provider === 'custom') {
    endpointInput.readOnly = false;
    authSchemeSelect.disabled = false;
    endpointInput.value = providerUrls.custom || '';
    authSchemeSelect.value = authSchemes.custom || 'none';
    showAuthRow(true);
  } else {
    endpointInput.readOnly = true;
    authSchemeSelect.disabled = true;
    endpointInput.value = defaultBase(provider);
    authSchemeSelect.value = defaultAuth(provider);
    showAuthRow(false);
  }

  toggleApiKeyRow();

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
    encKey: '',
    providerUrls: {},
    authSchemes: {}
  });
  apiKeys = items.apiKeys;
  modelNames = items.modelNames;
  encKeyB64 = items.encKey;
  providerUrls = items.providerUrls || {};
  authSchemes = items.authSchemes || {};
  apiChoiceSelect.value = items.apiChoice;
  document.getElementById('prompt-template').value = items.promptTemplate;
  document.getElementById('show-advanced-improve').checked = items.showAdvancedImprove;
  const syncItems = await chrome.storage.sync.get({contextMessageLimit: 10});
  contextLimitInput.value = syncItems.contextMessageLimit;
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

  el.innerHTML = data.map(txt => `<span class="summary-chip">${txt}</span>`).join('');
}

function formatISOWithTZ(timestamp, timeZone = 'Asia/Kolkata') {
  const d = new Date(timestamp);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(d).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  const utc = new Date(d.toLocaleString('en-US', {timeZone: 'UTC'}));
  const tz = new Date(d.toLocaleString('en-US', {timeZone}));
  const offsetMin = Math.round((tz - utc) / 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const pad = n => String(Math.trunc(Math.abs(n))).padStart(2, '0');
  const hh = pad(offsetMin / 60);
  const mm = pad(offsetMin % 60);
  const yyyy = parts.year;
  const mo = parts.month;
  const da = parts.day;
  const h = parts.hour;
  const mi = parts.minute;
  const s = parts.second;
  return `${yyyy}-${mo}-${da}T${h}:${mi}:${s}${sign}${hh}:${mm}`;
}

function renderLlmHistoryTable(logs) {
  const tbody = document.querySelector('#history-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  logs.forEach(log => {
    const row = document.createElement('tr');

    const ts = document.createElement('td');
    ts.textContent = formatISOWithTZ(log.ts ?? log.timestamp, 'Asia/Kolkata');
    row.appendChild(ts);

    const model = document.createElement('td');
    model.textContent = log.model || '';
    row.appendChild(model);

    const inputChat = (log.inputChatData || log.chatHistory || log.chat || '').trim();
    const outputResp = (log.outputResponse || log.reply || log.output || '').trim();

    const inputTd = document.createElement('td');
    inputTd.innerHTML = `<div class="cell-scroll">${
      inputChat.split('\n').map(l => `<div>${l}</div>`).join('')
    }</div>`;
    row.appendChild(inputTd);

    const outTd = document.createElement('td');
    outTd.innerHTML = `<div class="cell-scroll">${
      outputResp ? outputResp : '<em>—</em>'
    }</div>`;
    row.appendChild(outTd);

    const p = document.createElement('td');
    p.textContent = (log.tokensPrompt ?? '—');
    row.appendChild(p);

    const c = document.createElement('td');
    c.textContent = (log.tokensCompletion ?? '—');
    row.appendChild(c);

    const t = document.createElement('td');
    t.textContent = (log.tokensTotal ?? '—');
    row.appendChild(t);

    const rt = document.createElement('td');
    rt.textContent = (log.durationMs ?? log.responseTime ?? '—');
    row.appendChild(rt);

    tbody.appendChild(row);
  });
}

async function loadReferences() {
  try {
    const res = await fetch('references.json');
    if (!res.ok) return;
    const data = await res.json();
    renderReferencesTable(data);
  } catch {}
}

function renderReferencesTable(rows) {
  const tbody = document.querySelector('#references-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  rows.forEach(r => {
    const tr = document.createElement('tr');

    const tdProv = document.createElement('td');
    tdProv.textContent = r.provider || '';
    tr.appendChild(tdProv);

    const tdModel = document.createElement('td');
    tdModel.textContent = r.model || '';
    tr.appendChild(tdModel);

    const tdDate = document.createElement('td');
    tdDate.textContent = r.releaseDate || '';
    tr.appendChild(tdDate);

    const tdEp = document.createElement('td');
    const a = document.createElement('a');
    a.href = r.apiEndpoint || '';
    a.textContent = r.apiEndpoint || '';
    a.target = '_blank';
    a.rel = 'noopener';
    tdEp.appendChild(a);
    tr.appendChild(tdEp);

    tbody.appendChild(tr);
  });
}

const CSV_HEADERS = [
  'Timestamp',
  'Model',
  'Input Chat Data',
  'Output Response',
  'Prompt Tokens',
  'Completion Tokens',
  'Total Tokens',
  'Response Time (ms)'
];

function toCsvRows(logs) {
  return logs.map(log => ({
    Timestamp: formatISOWithTZ(log.ts ?? log.timestamp, 'Asia/Kolkata'),
    Model: log.model || '',
    'Input Chat Data': (log.inputChatData || log.chatHistory || log.chat || '').replace(/\r?\n/g, ' ↵ '),
    'Output Response': (log.outputResponse || log.reply || log.output || ''),
    'Prompt Tokens': (log.tokensPrompt ?? ''),
    'Completion Tokens': (log.tokensCompletion ?? ''),
    'Total Tokens': (log.tokensTotal ?? ''),
    'Response Time (ms)': (log.durationMs ?? log.responseTime ?? '')
  }));
}

async function reloadLogsAndSummary() {
  const {history = []} = await chrome.storage.local.get({history: []});
  renderSummary(history);
  renderLlmHistoryTable(history);
}

async function downloadCsv() {
  const {history = []} = await chrome.storage.local.get({history: []});
  const rows = toCsvRows(history);
  let csv = CSV_HEADERS.join(',') + '\n';
  for (const row of rows) {
    csv += CSV_HEADERS.map(h => `"${String(row[h]).replace(/"/g, '""')}"`).join(',') + '\n';
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
  const iconItems = document.querySelectorAll('.icon-item[data-tab]'); // only tabs
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
