// background.js - version 2025-08-05T00:44:54Z
import {b64ToBuf, fetchWithRetry, appendGenerationHistory} from './utils.js';
import {logToGitHub} from './logger.js';

let decryptedApiKey = null;

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.encryptedApiKey || changes.apiKey)) {
    decryptedApiKey = null;
  }
});

async function getApiKey() {
  const {apiKey, encryptedApiKey, iv, encKey} = await chrome.storage.local.get({
    apiKey: '',
    encryptedApiKey: '',
    iv: '',
    encKey: ''
  });
  if (encryptedApiKey && iv && encKey) {
    if (decryptedApiKey) return decryptedApiKey;
    const key = await crypto.subtle.importKey('raw', b64ToBuf(encKey), 'AES-GCM', false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({name: 'AES-GCM', iv: b64ToBuf(iv)}, key, b64ToBuf(encryptedApiKey));
    decryptedApiKey = new TextDecoder().decode(decrypted);
    return decryptedApiKey;
  }
  return apiKey;
}


async function sendLLM(prompt, tabId) {
  try {
    const apiKey = await getApiKey();
    const {apiChoice, modelChoice} = await chrome.storage.local.get({apiChoice: 'openai', modelChoice: 'gpt-4o-mini'});
    if (!apiKey) {
      chrome.tabs.sendMessage(tabId, {type: 'error', data: 'Please set your API key in the extension options.'});
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
    } else if (apiChoice === 'claude') {
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
    let fullText = '';
    let usageData;

    if (apiChoice === 'claude') {
      const data = await response.json();
      const text = data.content?.[0]?.text || '';
      usageData = data.usage;
      chrome.tabs.sendMessage(tabId, {
        message: 'gptResponse',
        response: {text}
      });
      chrome.tabs.sendMessage(tabId, {type: 'done'});
      fullText = text;
      await appendGenerationHistory({
        provider: apiChoice,
        model: modelChoice,
        timestamp: Date.now(),
        tokens: usageData,
        reply: fullText
      });
      return;
    }

    if (response.body && response.body.getReader) {
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
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) {
              fullText += token;
              chrome.tabs.sendMessage(tabId, {type: 'token', data: token});
            }
            if (parsed.usage) {
              usageData = parsed.usage;
            }
          } catch (e) {
            // ignore parse errors
          }
        }
      }
      chrome.tabs.sendMessage(tabId, {type: 'done'});
      await appendGenerationHistory({
        provider: apiChoice,
        model: modelChoice,
        timestamp: Date.now(),
        tokens: usageData,
        reply: fullText
      });
    } else {
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';
      usageData = data.usage;
      chrome.tabs.sendMessage(tabId, {
        message: 'gptResponse',
        response: {text}
      });
      chrome.tabs.sendMessage(tabId, {type: 'done'});
      fullText = text;
      await appendGenerationHistory({
        provider: apiChoice,
        model: modelChoice,
        timestamp: Date.now(),
        tokens: usageData,
        reply: fullText
      });
    }
  } catch (err) {
    chrome.tabs.sendMessage(tabId, {type: 'error', data: err.message});
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
    }
  });
}

initExtension();
