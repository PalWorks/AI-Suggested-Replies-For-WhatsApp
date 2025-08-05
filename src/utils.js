// Utility functions for encryption and retries
// Shared between background and options scripts
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

export async function fetchWithRetry(url, options, attempts = 3, delays = [500, 1000, 2000], fetcher = fetch) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetcher(url, options);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res;
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise(r => setTimeout(r, delays[i]));
    }
  }
}
