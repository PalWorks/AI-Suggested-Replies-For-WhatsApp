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
