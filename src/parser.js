(() => {
  let showToast;
  import(chrome.runtime.getURL('utils.js')).then(m => {
    showToast = m.showToast;
  });

  // Phrases that correspond to system messages or media placeholders.
  // These strings are matched case-insensitively and filtered out so the
  // AI only receives conversational content.
  const NON_CONVERSATIONAL_PATTERNS = [
    // Call notifications
    'missed voice call',
    'missed video call',
    // Deleted messages
    'you deleted this message',
    'this message was deleted',
    // Group changes
    'changed the subject to',
    'changed the group icon',
    'group description changed',
    // Pin/unpin notifications
    'pinned a message',
    'unpinned a message',
    // Encryption notice
    'messages and calls are end-to-end encrypted.',
    // Media placeholders
    'media omitted',
    'document omitted',
    'gif omitted',
    // Business or QR notifications
    'this chat is with a business account',
    'qr code scanned',
    'qr code expired'
  ];

  // Try to get a timestamp string from WhatsApp's DOM for a given message node.
  // Priority: data-pre-plain-text (contains [time, date] prefix) -> msg meta aria-label/text -> empty.
  function getRawTimestampFromNode(node) {
    if (!node) return '';
    const carrier = node.closest?.('[data-pre-plain-text]') || node.querySelector?.('[data-pre-plain-text]');
    if (carrier) {
      const s = carrier.getAttribute('data-pre-plain-text') || '';
      const m = s.match(/^\s*\[([^\]]+)\]/);
      if (m) return m[1].trim();
    }
    const meta = node.querySelector?.('[data-testid="msg-meta"], time, [aria-label*="AM"], [aria-label*="PM"]');
    if (meta) {
      return (meta.getAttribute?.('aria-label') || meta.textContent || '').trim();
    }
    return '';
  }

  // Convert common "time, date" formats into a local ISO-like string with timezone offset.
  // Returns "" if parsing fails.
  function toLocalIso(tsText) {
    if (!tsText) return '';
    try {
      const parts = tsText.split(',');
      const timePart = (parts[0] || '').trim();
      const datePart = (parts[1] || '').trim();
      let h = 0, m = 0;
      const t12 = timePart.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i);
      const t24 = timePart.match(/^(\d{1,2}):(\d{2})$/);
      if (t12) {
        h = parseInt(t12[1], 10); m = parseInt(t12[2], 10);
        const ap = t12[3].toLowerCase();
        if (ap === 'pm' && h < 12) h += 12;
        if (ap === 'am' && h === 12) h = 0;
      } else if (t24) {
        h = parseInt(t24[1], 10); m = parseInt(t24[2], 10);
      } else {
        return '';
      }
      const d = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (!d) return '';
      const day = parseInt(d[1], 10);
      const mon = parseInt(d[2], 10) - 1;
      let year = parseInt(d[3], 10);
      if (year < 100) year += 2000;

      const dt = new Date(year, mon, day, h, m, 0, 0);
      const pad = n => String(n).padStart(2, '0');
      const offMin = -dt.getTimezoneOffset();
      const sign = offMin >= 0 ? '+' : '-';
      const offH = pad(Math.floor(Math.abs(offMin) / 60));
      const offM = pad(Math.abs(offMin) % 60);
      return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}${sign}${offH}:${offM}`;
    } catch {
      return '';
    }
  }

  // Build the final line sent to the LLM.
  // If we can compute a local ISO timestamp -> use that.
  // Else, if we only have a raw readable timestamp -> include that.
  // Else, keep the old "Name: text" form.
  function formatLineWithTimestamp({ name, text, node }) {
    const raw = getRawTimestampFromNode(node);
    const iso = toLocalIso(raw);
    const safeName = (name || '').trim();
    const safeText = (text || '').trim();
    if (iso) return `[${iso}] ${safeName}: ${safeText}`;
    if (raw) return `[${raw}] ${safeName}: ${safeText}`;
    return `${safeName}: ${safeText}`;
  }

  function extractRecentMessages({limit = 10, filtered = true, root = document.getElementById('main')} = {}) {
    try {
      if (!root) return [];
      let msgContainers = root.querySelectorAll('.message-out, .message-in');
      msgContainers = Array.from(msgContainers).slice(-limit);
      const chatHistory = [];
      msgContainers.forEach(el => {
        let messageStringCollector = '';
        const elements = el.querySelectorAll('.copyable-text');
        elements.forEach(el => {
          const messageLabel = el.getAttribute('data-pre-plain-text');
          if (messageLabel !== null) {
            if (el.closest('.message-out') !== null) {
              messageStringCollector += 'Me: ';
            } else {
              const contactName = messageLabel.replace(/\[.*?\]\s*/, '').slice(0, -2);
              messageStringCollector += contactName + ': ';
            }
          } else {
            const messageContent = getTextWithEmojis(el);
            if (typeof messageContent !== 'undefined') {
              messageStringCollector += messageContent;
            }
          }
        });
        const text = messageStringCollector.trim();
        const nameMatch = text.match(/^([^:]+):\s*/);
        const senderName = nameMatch ? nameMatch[1].trim() : '';
        const content = text.replace(/^.*?:\s*/, '').trim();
        if (filtered) {
          const lowered = text.toLowerCase();
          const hasMedia = el.querySelector('img, video, canvas') !== null;
          const isBlacklisted = NON_CONVERSATIONAL_PATTERNS.some(p => lowered.includes(p));
          const isMediaOnly = hasMedia && content === '';
          if (text && !isBlacklisted && !isMediaOnly) {
            chatHistory.push(
              formatLineWithTimestamp({ name: senderName, text: content, node: el })
            );
          }
        } else if (text) {
          chatHistory.push(
            formatLineWithTimestamp({ name: senderName, text: content, node: el })
          );
        }
      });
      return chatHistory;
    } catch (e) {
      console.error('Failed to extract messages:', e);
      return [];
    }
  }

  function parseHtml(main) {
    try {
      const limit = window.contextMessageLimit || 10;
      const chatHistory = extractRecentMessages({limit, filtered: true, root: main});
      const lastExpression = chatHistory[chatHistory.length - 1];
      let lastIsMine = false;
      if (lastExpression && lastExpression.includes('Me:')) {
        lastIsMine = true;
      }
      const chatHistoryShortAsString = chatHistory.join('\n\n');

      // Collect distinct non-"Me" senders
      const participants = Array.from(
        new Set(
          chatHistory
            .map(line => {
              const cleaned = line.replace(/^\[[^\]]+\]\s*/, '');
              const m = cleaned.match(/^([^:]+):\s/);
              const name = m ? m[1].trim() : '';
              return name && name !== 'Me' ? name : null;
            })
            .filter(Boolean)
        )
      );
      const chatType = participants.length > 1 ? 'group' : 'dm';

      return {chatHistoryShort: chatHistoryShortAsString, lastIsMine, chatType, participants};
    } catch (e) {
      console.error('Failed to parse chat history:', e);
      if (showToast) showToast('Failed to parse chat history');
      return {chatHistoryShort: '', lastIsMine: false, chatType: 'dm', participants: []};
    }
  }

  function getTextWithEmojis(element) {
  let result = '';

  for (const childNode of element.childNodes) {
    if (childNode.nodeType === Node.TEXT_NODE) {
      result += childNode.textContent;
    } else if (childNode.nodeType === Node.ELEMENT_NODE) {
      if (childNode.tagName === 'IMG' && childNode.hasAttribute('data-plain-text')) {
        result += childNode.getAttribute('data-plain-text');
      } else {
        result += getTextWithEmojis(childNode);
      }
    }
  }

  return result;
  }

  window.parseHtml = parseHtml;
  window.extractRecentMessages = extractRecentMessages;
})();
