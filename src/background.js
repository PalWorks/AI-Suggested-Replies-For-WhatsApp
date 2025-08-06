// background.js - version 2025-08-05T00:44:54Z
import {b64ToBuf, fetchWithRetry, showToast, getDefaultModel} from './utils.js';
import {logToGitHub} from './logger.js';

const CONTENT_SCRIPTS = ['parser.js', 'uiStuff.js', 'confirmDialog.js', 'improveDialog.js', 'contentScript.js'];

let decryptedApiKeys = {};

async function addHistory(entry) {
  const {history = []} = await chrome.storage.local.get({history: []});
  history.push(entry);
  if (history.length > 100) {
    history.splice(0, history.length - 100);
  }
  await chrome.storage.local.set({history});
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.apiKeys) {
    decryptedApiKeys = {};
  }
});

async function getApiKey(provider) {
  const {apiKeys = {}, encKey = ''} = await chrome.storage.local.get({apiKeys: {}, encKey: ''});
  const entry = apiKeys[provider];
  if (!entry || !entry.encryptedKey || !entry.iv || !encKey) return '';
  if (decryptedApiKeys[provider]) return decryptedApiKeys[provider];
  const key = await crypto.subtle.importKey('raw', b64ToBuf(encKey), 'AES-GCM', false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({name: 'AES-GCM', iv: b64ToBuf(entry.iv)}, key, b64ToBuf(entry.encryptedKey));
  const decoded = new TextDecoder().decode(decrypted);
  decryptedApiKeys[provider] = decoded;
  return decoded;
}


async function sendLLM(prompt, tabId) {
  const startTime = Date.now();
  try {
    const {apiChoice, modelNames = {}} = await chrome.storage.local.get({apiChoice: 'openai', modelNames: {}});
    const modelChoice = modelNames[apiChoice] || getDefaultModel(apiChoice);
    const apiKey = await getApiKey(apiChoice);
    if (!apiKey) {
      const msg = 'Please set your API key in the extension options.';
      chrome.tabs.sendMessage(tabId, {type: 'error', data: msg});
      showToast(msg);
      return;
    }

    let url;
    let headers = {'Content-Type': 'application/json'};
    let body;
    const basePayload = {
      messages: [{role: 'user', content: prompt}],
      temperature: 0.7,
      max_tokens: 150,
      stream: true
    };

    if (apiChoice === 'openrouter') {
      url = 'https://openrouter.ai/api/v1/chat/completions';
      headers.Authorization = `Bearer ${apiKey}`;
      headers['HTTP-Referer'] = 'https://web.whatsapp.com';
      headers['X-Title'] = 'AI Suggested Replies For WhatsApp';
      body = JSON.stringify({...basePayload, model: modelChoice});
    } else if (apiChoice === 'anthropic') {
      url = 'https://api.anthropic.com/v1/messages';
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      };
      body = JSON.stringify({
        model: modelChoice,
        messages: [{role: 'user', content: prompt}],
        max_tokens: 150
      });
    } else if (apiChoice === 'mistral') {
      url = 'https://api.mistral.ai/v1/chat/completions';
      headers.Authorization = `Bearer ${apiKey}`;
      body = JSON.stringify({...basePayload, model: modelChoice});
    } else {
      url = 'https://api.openai.com/v1/chat/completions';
      headers.Authorization = `Bearer ${apiKey}`;
      body = JSON.stringify({...basePayload, model: modelChoice});
    }

    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers,
      body
    }, 3, [500, 1000, 2000], fetch, logToGitHub);

    let usage;

    if (apiChoice === 'anthropic') {
      const data = await response.json();
      const text = data.content?.[0]?.text || '';
      usage = data.usage;
      chrome.tabs.sendMessage(tabId, {
        message: 'gptResponse',
        response: {text}
      });
      chrome.tabs.sendMessage(tabId, {type: 'done'});
    } else if (response.body && response.body.getReader) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      while (true) {
        const {value, done} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.usage) {
              usage = parsed.usage;
            }
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) {
              chrome.tabs.sendMessage(tabId, {type: 'token', data: token});
            }
          } catch (e) {
            // ignore parse errors
          }
        }
      }
      chrome.tabs.sendMessage(tabId, {type: 'done'});
    } else {
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';
      usage = data.usage;
      chrome.tabs.sendMessage(tabId, {
        message: 'gptResponse',
        response: {text}
      });
      chrome.tabs.sendMessage(tabId, {type: 'done'});
    }

    const endTime = Date.now();
    const tokensPrompt = usage?.prompt_tokens || usage?.input_tokens || 0;
    const tokensCompletion = usage?.completion_tokens || usage?.output_tokens || 0;
    const tokensTotal = usage?.total_tokens || tokensPrompt + tokensCompletion;
    await addHistory({
      timestamp: Date.now(),
      provider: apiChoice,
      model: modelChoice,
      prompt,
      tokensPrompt,
      tokensCompletion,
      tokensTotal,
      responseTime: endTime - startTime
    });
  } catch (err) {
    chrome.tabs.sendMessage(tabId, {type: 'error', data: err.message});
    showToast(err.message);
    logToGitHub(`LLM request failed: ${err.message}\n${err.stack || ''}`).catch(() => {});
  }
}

function initExtension() {
  chrome.runtime.onMessage.addListener((request, sender) => {
    if (request.action === 'openOptionsPage') {
      chrome.runtime.openOptionsPage();
    } else if (request.message === 'sendChatToGpt') {
      sendLLM(request.prompt, sender.tab.id);
      return true;
    } else if (request.message === 'providerChanged' && request.providerUrl) {
      chrome.permissions.request({origins: [request.providerUrl]});
    }
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('https://web.whatsapp.com/')) {
      chrome.scripting.executeScript({
        target: {tabId},
        files: CONTENT_SCRIPTS
      });
    }
  });

  chrome.tabs.query({url: 'https://web.whatsapp.com/*'}, tabs => {
    for (const tab of tabs) {
      chrome.scripting.executeScript({
        target: {tabId: tab.id},
        files: CONTENT_SCRIPTS
      });
    }
  });
}

initExtension();
