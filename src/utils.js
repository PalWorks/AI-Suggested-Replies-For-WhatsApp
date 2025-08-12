// Utility functions for encryption and retries
// Shared between background and options scripts

export const encoder = new TextEncoder();

export const DEFAULT_PROMPT = `Role: You are an AI reply assistant for WhatsApp Web, integrated via a Chrome extension.

Context: You will receive a chat data block (the last few messages in a chat) and a chat metadata block (chat.type and participants). 

Task: You write WhatsApp replies on behalf of Me (the user of this extension); reply as Me, and in group chats mention @Name when clearly replying to someone. Generate one concise, contextually relevant, and natural-sounding reply suggestion for the user to send.

Guidelines:
- Speak in first person as Me; address the other person directly.
- Match the tone, formality, and style of the recent conversation (including use of emojis or formal language as appropriate).
- Adapt to the likely relationship between participants (e.g., friend, colleague, family, customer).
- If the conversation is in a language other than English, reply in that language.
- Reply directly to questions; react naturally to statements or updates.
- In group chats:
    - If the reply is intended for a specific participant (based on recent context or mentions), begin your suggestion with “@Name” or “@PhoneNumber” to clearly direct the reply.
    - Otherwise, keep replies general.
- Be brief (1–2 sentences). Avoid filler words or over-explanation.
- Avoid repeating exact phrases from recent messages unless necessary for clarity or politeness.
- Never ask questions that have already been answered in the conversation.
- Handle sensitive or emotional contexts (apologies, condolences, congratulations, urgent requests) with appropriate tact and empathy.
- Do not add any extra explanations, reasoning, or metadata—only output the suggested reply text.
- Never summarize or add meta text. Output ONLY the message text.

Output format:
- Only the reply suggestion, with no bullet points, numbering, or explanation.`;

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
      return 'gpt-4o-mini'; // default lightweight GPT-4
    case 'anthropic':
      return 'claude-3-haiku-20240307';
    case 'mistral':
      return 'mistral-small';
    default:
      return '';
  }
}

export function showToast(message, opts = {}) {
  const { anchor = null, align = 'right', duration = 1800, offset = 8 } = opts;

  const toast = document.createElement('div');
  toast.className = 'wa-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;
  document.body.appendChild(toast);

  toast.style.top = '0px';
  toast.style.left = '0px';

  const place = () => {
    let x, y;
    if (anchor && anchor.getBoundingClientRect) {
      const r = anchor.getBoundingClientRect();
      const w = toast.offsetWidth;
      const h = toast.offsetHeight;
      x = align === 'left' ? (r.left - w - offset) : (r.right + offset);
      y = r.top + (r.height - h) / 2;
      const m = 8;
      x = Math.max(m, Math.min(window.innerWidth - w - m, x));
      y = Math.max(m, Math.min(window.innerHeight - h - m, y));
      toast.style.left = `${x}px`;
      toast.style.top = `${y}px`;
    } else {
      const w = toast.offsetWidth;
      const h = toast.offsetHeight;
      toast.style.left = `${(window.innerWidth - w) / 2}px`;
      toast.style.top = `${window.innerHeight - h - 24}px`;
    }
    requestAnimationFrame(() => toast.classList.add('show'));
  };

  requestAnimationFrame(place);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

export function defaultBase(provider) {
  switch (provider) {
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1';
    case 'anthropic':
      return 'https://api.anthropic.com/v1';
    case 'mistral':
      return 'https://api.mistral.ai/v1';
    default:
      return '';
  }
}

export function defaultAuth(provider) {
  switch (provider) {
    case 'openai':
    case 'openrouter':
    case 'anthropic':
    case 'mistral':
      return 'bearer';
    default:
      return 'none';
  }
}

export async function getConfigState() {
  const {
    apiChoice = 'openai',
    apiKeys = {},
    providerUrls = {},
    authSchemes = {}
  } = await chrome.storage.local.get({ apiChoice: 'openai', apiKeys: {}, providerUrls: {}, authSchemes: {} });

  const provider = apiChoice;
  const effAuth = provider === 'custom' ? (authSchemes.custom || 'none') : defaultAuth(provider);
  const needsKey = effAuth !== 'none';
  const hasKey = !!apiKeys[provider];
  let base = provider === 'custom' ? (providerUrls.custom || '') : defaultBase(provider);

  let baseValid = false;
  try {
    const u = new URL(base);
    baseValid = (u.pathname === '/v1');
  } catch {}

  const isConfigured = (provider === 'custom')
    ? (baseValid && (!needsKey || hasKey))
    : (!needsKey || hasKey);

  return { provider, needsKey, hasKey, base, baseValid, isConfigured };
}
