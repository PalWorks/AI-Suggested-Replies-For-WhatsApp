// Utility functions for encryption and retries
// Shared between background and options scripts

export const encoder = new TextEncoder();

export const DEFAULT_PROMPT = `You are an AI-powered reply assistant integrated into a Chrome extension for WhatsApp Web.
You will receive the last 10 user and contact messages in a conversation.
Your job is to generate one or more short, contextually accurate, and natural-sounding reply suggestions.
Follow these rules:
- Maintain the conversation flow and tone from the recent messages.
- Be concise (1–2 sentences per reply).
- Avoid repeating exact phrases from earlier messages unless necessary for politeness or clarity.
- Do not ask redundant questions already answered in the conversation.
- Maintain grammatical correctness and natural language style.
- Keep replies friendly and human-like without sounding overly formal unless the conversation tone requires it.
- Do not add extra explanation, metadata, or reasoning—only output the suggested reply text(s).`;

export function strToBuf(str) {
  return new TextEncoder().encode(str);
}

export function bufToB64(buf) {
  if (typeof btoa === 'function') {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }
  return Buffer.from(buf).toString('base64');
}

export function b64ToBuf(b64) {
  if (typeof atob === 'function') {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  }
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

export async function fetchWithTimeout(resource, options = {}, timeout = 20000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(resource, {...options, signal: controller.signal});
  } finally {
    clearTimeout(id);
  }
}

export async function fetchWithRetry(
  url,
  options,
  attempts = 3,
  delays = [500, 1000, 2000],
  fetcher = fetch,
  logger = null
) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetcher(url, options);
      if (!res.ok) {
        if (logger) {
          try {
            const text = await res.text();
            await logger(`HTTP ${res.status}: ${text}`);
          } catch (e) {
            // ignore logging errors
          }
        }
        throw new Error('HTTP ' + res.status);
      }
      return res;
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise(r => setTimeout(r, delays[i]));
    }
  }
}

export function getDefaultModel(provider) {
  switch (provider) {
    case 'openrouter':
    case 'openai':
      return 'gpt-3.5-turbo';
    case 'anthropic':
      return 'claude-3-haiku-20240307';
    case 'mistral':
      return 'mistral-small';
    default:
      return '';
  }
}

export function showToast(message) {
  if (typeof window !== 'undefined' && window.document && document.body) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = 'rgba(0, 0, 0, 0.8)';
    toast.style.color = '#fff';
    toast.style.padding = '8px 12px';
    toast.style.borderRadius = '4px';
    toast.style.zIndex = '2147483647';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  } else if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
    try {
      chrome.tabs.query({active: true, currentWindow: true}, tabs => {
        if (tabs[0] && tabs[0].id !== undefined) {
          chrome.tabs.sendMessage(tabs[0].id, {type: 'showToast', message});
        }
      });
    } catch (e) {
      // ignore messaging errors
    }
  } else if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    try {
      chrome.runtime.sendMessage({type: 'showToast', message});
    } catch (e) {
      // ignore runtime errors
    }
  } else {
    console.log(message);
  }
}
