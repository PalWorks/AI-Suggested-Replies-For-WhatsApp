// background.js - version 2025-08-05T00:44:54Z
import {strToBuf, b64ToBuf, fetchWithRetry} from './utils.js';

let decryptedApiKey = null;

async function requestPassphrase() {
  return chrome.runtime.sendMessage({type: 'requestPassphrase'});
}

async function getApiKey() {
  const {encryptApiKey, apiKey, encryptedApiKey, salt, iv} = await chrome.storage.local.get({
    encryptApiKey: false,
    apiKey: '',
    encryptedApiKey: '',
    salt: '',
    iv: ''
  });
  if (!encryptApiKey) return apiKey;
  if (decryptedApiKey) return decryptedApiKey;
  const passphrase = await requestPassphrase();
  if (!passphrase) throw new Error('Passphrase required');
  const keyMaterial = await crypto.subtle.importKey('raw', strToBuf(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    {name: 'PBKDF2', salt: b64ToBuf(salt), iterations: 100000, hash: 'SHA-256'},
    keyMaterial,
    {name: 'AES-GCM', length: 256},
    false,
    ['decrypt']
  );
  const decrypted = await crypto.subtle.decrypt({name: 'AES-GCM', iv: b64ToBuf(iv)}, key, b64ToBuf(encryptedApiKey));
  decryptedApiKey = new TextDecoder().decode(decrypted);
  return decryptedApiKey;
}


async function sendOpenAI(prompt, tabId) {
  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      chrome.tabs.sendMessage(tabId, {type: 'error', data: 'Please set your OpenAI API key in the extension options.'});
      return;
    }

    const response = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [{role: 'user', content: prompt}],
        temperature: 0.7,
        max_tokens: 150,
        stream: true
      })
    });

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
      chrome.tabs.sendMessage(tabId, {
        message: 'gptResponse',
        response: {text: data.choices[0].message.content}
      });
      chrome.tabs.sendMessage(tabId, {type: 'done'});
    }
  } catch (err) {
    chrome.tabs.sendMessage(tabId, {type: 'error'});
  }
}

function initExtension() {
  chrome.runtime.onMessage.addListener((request, sender) => {
    if (request.action === 'openOptionsPage') {
      chrome.runtime.openOptionsPage();
    } else if (request.message === 'sendChatToGpt') {
      sendOpenAI(request.prompt, sender.tab.id);
      return true;
    }
  });
}

initExtension();
