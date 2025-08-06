(() => {
  let showToast;
  import(chrome.runtime.getURL('utils.js')).then(m => {
    showToast = m.showToast;
  });

  class LinkedSet {
  constructor() {
    this.set = new Set();
    this.array = [];
  }

  add(value) {
    if (!this.set.has(value)) {
      this.set.add(value);
      this.array.push(value);
    }
  }

  getPosition(value) {
    return this.array.indexOf(value);
  }
}

function parseHtml(main) {
  try {
    const main2 = main;
    const chatHistory = [];
    let msgContainers = main2.querySelectorAll('.message-out, .message-in');

    const linkedSet = new LinkedSet();
    msgContainers = Array.from(msgContainers).slice(-10);
    msgContainers.forEach(el => {
      let messageStringCollector = '';
      const elements = el.querySelectorAll('.copyable-text');
      elements.forEach(el => {
        const messageLabel = el.getAttribute('data-pre-plain-text');
        if (messageLabel !== null) {
          if (el.closest('.message-out') !== null) {
            messageStringCollector += 'Me: ';
          } else {
            let contactName = messageLabel.replace(/\[.*?\]\s*/, '').slice(0, -2);
            linkedSet.add(contactName);
            const contactNumber = linkedSet.getPosition(contactName) + 1;
            messageStringCollector += contactNumber + ': ';
          }
        } else {
          const messageContent = getTextWithEmojis(el);
          if (typeof messageContent !== 'undefined') {
            messageStringCollector += messageContent;
          }
        }
      });
      if (messageStringCollector.length !== 0) {
        chatHistory.push(messageStringCollector);
      }
    });
    const lastExpression = chatHistory[chatHistory.length - 1];
    let lastIsMine = false;
    if (lastExpression.includes('Me:')) {
      lastIsMine = true;
    }
    const chatHistoryShortAsString = chatHistory.join('\n\n');
    return {chatHistoryShort: chatHistoryShortAsString, lastIsMine};
  } catch (e) {
    console.error('Failed to parse chat history:', e);
    if (showToast) showToast('Failed to parse chat history');
    return {chatHistoryShort: '', lastIsMine: false};
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
})();
