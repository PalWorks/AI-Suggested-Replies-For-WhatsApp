// background.js - version 2025-08-05T00:44:54Z
import {b64ToBuf, fetchWithRetry, showToast, getDefaultModel, fetchWithTimeout} from './utils.js';
import {logToGitHub} from './logger.js';

const MESSAGING_ERROR = 'Unable to communicate with the extension backend. Please refresh the page.';

function safeSendTabMessage(tabId, message) {
  chrome.tabs.sendMessage(tabId, message, response => {
    if (chrome.runtime.lastError || !response) {
      chrome.tabs.sendMessage(tabId, {type: 'error', error: MESSAGING_ERROR}, () => {
        if (chrome.runtime.lastError) {
          console.error('Failed to send fallback error', chrome.runtime.lastError);
        }
      });
    }
  });
}

function sanitizeBaseEndpoint(raw) {
  if (!raw) return '';
  try {
    const u = new URL(String(raw).trim());
    u.pathname = '/v1';
    u.search = '';
    u.hash = '';
    return `${u.origin}/v1`;
  } catch { return ''; }
}

const CONTENT_SCRIPTS = ['parser.js', 'uiStuff.js', 'improveDialog.js', 'contentScript.js'];

let decryptedApiKeys = {};
let extensionEnabled = true;

async function loadExtensionEnabled() {
  const {extensionEnabled: stored = true} = await chrome.storage.local.get({extensionEnabled: true});
  extensionEnabled = stored;
}

async function addHistory(entry) {
  const {history = []} = await chrome.storage.local.get({history: []});
  history.push(entry);
  if (history.length > 100) {
    history.splice(0, history.length - 100);
  }
  await chrome.storage.local.set({history});
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.apiKeys) {
      decryptedApiKeys = {};
    }
    if (changes.extensionEnabled) {
      extensionEnabled = changes.extensionEnabled.newValue;
      if (!extensionEnabled) {
        chrome.tabs.query({url: 'https://web.whatsapp.com/*'}, tabs => {
          for (const tab of tabs) {
            chrome.tabs.reload(tab.id);
          }
        });
      } else {
        chrome.tabs.query({url: 'https://web.whatsapp.com/*'}, tabs => {
          for (const tab of tabs) {
            chrome.scripting.executeScript({
              target: {tabId: tab.id},
              files: CONTENT_SCRIPTS
            });
          }
        });
      }
    }
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


async function sendLLM(prompt, tabId, inputChatData, requestId) {
  const startTime = Date.now();
  let firstTokenAt = 0;
  let outputText = '';
  try {
    const { apiChoice, modelNames = {}, providerUrls = {}, authSchemes = {} } =
      await chrome.storage.local.get({ apiChoice: 'openai', modelNames: {}, providerUrls: {}, authSchemes: {} });

    const modelChoice = modelNames[apiChoice] || getDefaultModel(apiChoice);
    const scheme = (apiChoice === 'custom') ? (authSchemes.custom || 'none') : 'bearer';

    // Only some cases require a key
    const requiresKey = (apiChoice !== 'custom') || (scheme !== 'none');
    const apiKey = requiresKey ? await getApiKey(apiChoice) : '';

    if (requiresKey && !apiKey) {
      const msg = 'Please set your API key in the extension options.';
      safeSendTabMessage(tabId, {type: 'error', error: msg, requestId});
      safeSendTabMessage(tabId, {type: 'showToast', message: msg, requestId});
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
      stream: true,
      stream_options: {include_usage: true}
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
    } else if (apiChoice === 'custom') {
      let base = providerUrls.custom || '';
      base = sanitizeBaseEndpoint(base);
      if (!base) throw new Error('Custom endpoint missing');
      url = `${base}/chat/completions`;
      if (scheme === 'bearer' && apiKey) headers.Authorization = `Bearer ${apiKey}`;
      if (scheme === 'x-api-key' && apiKey) headers['x-api-key'] = apiKey;
      body = JSON.stringify({ ...basePayload, model: modelChoice });
    } else {
      url = 'https://api.openai.com/v1/chat/completions';
      headers.Authorization = `Bearer ${apiKey}`;
      body = JSON.stringify({...basePayload, model: modelChoice});
    }

    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers,
      body
    }, 3, [500, 1000, 2000], fetchWithTimeout, logToGitHub);

    let usage;

    if (apiChoice === 'anthropic') {
      const data = await response.json().catch(() => {
        throw new Error('Unexpected API response');
      });
      if (data.error) {
        throw new Error(data.error.message || data.error);
      }
      const text = data.content?.[0]?.text;
      if (!text) {
        throw new Error('Unexpected API response');
      }
      usage = data.usage;
      if (!firstTokenAt) firstTokenAt = Date.now();
      outputText = text;
      safeSendTabMessage(tabId, {
        message: 'gptResponse',
        response: {text},
        requestId
      });
      safeSendTabMessage(tabId, {type: 'done', requestId});
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
              usage = {
                prompt_tokens: parsed.usage.prompt_tokens ?? 0,
                completion_tokens: parsed.usage.completion_tokens ?? 0,
                total_tokens: parsed.usage.total_tokens ?? 0
              };
            }
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) {
              if (!firstTokenAt) firstTokenAt = Date.now();
              outputText += token;
              safeSendTabMessage(tabId, {type: 'token', data: token, requestId});
            }
          } catch (e) {
            // ignore parse errors
          }
        }
      }
      safeSendTabMessage(tabId, {type: 'done', requestId});
    } else {
      const data = await response.json().catch(() => {
        throw new Error('Unexpected API response');
      });
      if (data.error) {
        throw new Error(data.error.message || data.error);
      }
      const text = data.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error('Unexpected API response');
      }
      usage = data.usage;
      if (!firstTokenAt) firstTokenAt = Date.now();
      outputText = text;
      safeSendTabMessage(tabId, {
        message: 'gptResponse',
        response: {text},
        requestId
      });
      safeSendTabMessage(tabId, {type: 'done', requestId});
    }

    const endTime = Date.now();
    const ttfbMs = Math.max(0, (firstTokenAt || endTime) - startTime);
    const tokensPrompt = usage?.prompt_tokens || usage?.input_tokens || 0;
    const tokensCompletion = usage?.completion_tokens || usage?.output_tokens || 0;
    const tokensTotal = usage?.total_tokens || tokensPrompt + tokensCompletion;
    const genMs = Math.max(0, endTime - (firstTokenAt || endTime));
    const tokensPerSec = (tokensCompletion > 0 && genMs > 0) ? (tokensCompletion / (genMs / 1000)) : 0;

    await addHistory({
      ts: Date.now(),
      provider: apiChoice,
      model: modelChoice,
      inputChatData,
      outputResponse: outputText,
      prompt,
      tokensPrompt,
      tokensCompletion,
      tokensTotal,
      ttfbMs,
      durationMs: endTime - startTime,
      genMs,
      tokensPerSec,
      status: 'success'
    });
  } catch (err) {
    let msg = '';
    if (err.name === 'AbortError') {
      msg = 'Request timed out';
    } else {
      const m = String(err.message || '').match(/HTTP\s+(\d{3})/i);
      if (m) {
        const code = parseInt(m[1], 10);
        msg = statusToUserMessage(code);
      } else if (/Failed to fetch/i.test(String(err.message)) || err instanceof TypeError) {
        // Network/CORS failures or server down
        msg = 'Cannot reach server — check that your endpoint is correct (include /v1) and that the server is running.';
      } else if (err.message === 'Unexpected API response') {
        msg = 'Unexpected API response — check model name and endpoint.';
      } else {
        msg = `Unknown error: ${err.message || err}`;
      }
    }
    safeSendTabMessage(tabId, { type: 'error', error: msg, requestId });
    safeSendTabMessage(tabId, { type: 'showToast', message: msg, requestId });
    showToast(msg);
    logToGitHub(`LLM request failed: ${msg}\n${err.stack || ''}`).catch(() => {});
  }
}

function statusToUserMessage(status) {
  switch (status) {
    case 400: return 'Bad request — often wrong model name or invalid body. Check “Model Name” in Options.';
    case 401: return 'Unauthorized — invalid API key or auth required. If using local server, pick “No Auth header”.';
    case 402: return 'Payment required / quota exceeded — check your provider plan/credits.';
    case 403: return 'Forbidden — key lacks permission for this model/endpoint.';
    case 404: return 'Endpoint not found — verify API Endpoint and make sure it ends with /v1 (e.g., http://localhost:1234/v1).';
    case 408: return 'Server timeout — the provider took too long to respond.';
    case 429: return 'Rate limit exceeded — slow down or use a less busy model.';
    default:
      if (status >= 500 && status <= 599) return 'Provider server error — try again in a moment.';
      return `HTTP ${status} — unexpected response from provider.`;
  }
}

async function initExtension() {
  await loadExtensionEnabled();
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'openOptionsPage') {
      chrome.runtime.openOptionsPage();
      sendResponse({received: true});
    } else if (request.message === 'sendChatToGpt') {
      sendLLM(request.prompt, sender.tab.id, request.inputChatData, request.requestId);
      sendResponse({received: true});
    } else if (request.message === 'providerChanged' && request.providerUrl) {
      try {
        const u = new URL(request.providerUrl);
        const origin = `${u.origin}/*`;
        chrome.permissions.request({ origins: [origin] }, () => {
          sendResponse({ received: true });
        });
      } catch (e) {
        sendResponse({ received: true });
      }
      return true;
    }
    return true;
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!extensionEnabled) return;
    if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('https://web.whatsapp.com/')) {
      chrome.scripting.executeScript({
        target: {tabId},
        files: CONTENT_SCRIPTS
      });
    }
  });

  chrome.tabs.query({url: 'https://web.whatsapp.com/*'}, tabs => {
    if (!extensionEnabled) return;
    for (const tab of tabs) {
      chrome.scripting.executeScript({
        target: {tabId: tab.id},
        files: CONTENT_SCRIPTS
      });
    }
  });
}

initExtension();
