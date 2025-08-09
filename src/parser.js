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
        if (filtered) {
          const lowered = text.toLowerCase();
          const content = text.replace(/^.*?:\s*/, '').trim();
          const hasMedia = el.querySelector('img, video, canvas') !== null;
          const isBlacklisted = NON_CONVERSATIONAL_PATTERNS.some(p => lowered.includes(p));
          const isMediaOnly = hasMedia && content === '';
          if (text && !isBlacklisted && !isMediaOnly) {
            chatHistory.push(messageStringCollector);
          }
        } else if (text) {
          chatHistory.push(messageStringCollector);
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
              const m = line.match(/^([^:]+):\s/);
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
