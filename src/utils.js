// Utility functions for encryption and retries
// Shared between background and options scripts

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
- Do not add extra explanation, metadata, or reasoning—only output the suggested reply text(s).
- If instructed in the tone-of-voice setting, adapt word choice, formality, and style accordingly.`;

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
