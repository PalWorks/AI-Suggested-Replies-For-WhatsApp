document.addEventListener('DOMContentLoaded', () => {
  const settingsBtn = document.getElementById('open-settings');
  const toggleBtn = document.getElementById('toggle-extension');
  const bugBtn = document.getElementById('submit-bug');

  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  bugBtn.addEventListener('click', () => {
    chrome.tabs.create({url: 'https://github.com/PalWorks/AI-Suggested-Replies-For-WhatsApp/issues'});
    window.close();
  });

  chrome.storage.local.get({extensionEnabled: true}, ({extensionEnabled}) => {
    toggleBtn.textContent = extensionEnabled ? 'Turn Off' : 'Turn On';
  });

  toggleBtn.addEventListener('click', () => {
    chrome.storage.local.get({extensionEnabled: true}, ({extensionEnabled}) => {
      const newState = !extensionEnabled;
      chrome.storage.local.set({extensionEnabled: newState}, () => {
        toggleBtn.textContent = newState ? 'Turn Off' : 'Turn On';
      });
    });
  });
});
