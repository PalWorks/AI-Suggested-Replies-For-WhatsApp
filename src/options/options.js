import {strToBuf, bufToB64, b64ToBuf} from '../utils.js';

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('options-form').addEventListener('submit', saveOptions);


const chatHistoryWarningAlert = document.getElementById('chatHistoryWarningAlert');

const closeAlertButton = document.querySelector('#hideHistoryWarningAlert');

function showCustomAlert() {
    chatHistoryWarningAlert.style.visibility = 'visible';
}

function hideCustomAlert() {
    chatHistoryWarningAlert.style.visibility = 'hidden';
}

closeAlertButton.addEventListener('click', function () {
    hideCustomAlert();
});

document.getElementById('send-history-auto').addEventListener('click', function () {
    showCustomAlert();
});

async function getOrCreateEncKey() {
  const {encKey} = await chrome.storage.local.get({encKey: ''});
  if (encKey) {
    return crypto.subtle.importKey('raw', b64ToBuf(encKey), 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  const key = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, true, ['encrypt', 'decrypt']);
  const raw = await crypto.subtle.exportKey('raw', key);
  await chrome.storage.local.set({encKey: bufToB64(raw)});
  return key;
}

async function saveOptions(e) {
  e.preventDefault();
  const apiKey = document.getElementById('api-key').value;
  const sendHistory = document.querySelector('input[name="send-history"]:checked').value;
  const toneOfVoice = document.getElementById('tone-of-voice').value;
  const apiChoice = document.getElementById('api-choice').value;

  const key = await getOrCreateEncKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, strToBuf(apiKey));

  const storeObj = {
    sendHistory: sendHistory,
    apiChoice: apiChoice,
    toneOfVoice: toneOfVoice,
    encryptedApiKey: bufToB64(encrypted),
    iv: bufToB64(iv),
    apiKey: ''
  };

  chrome.storage.local.set(storeObj, () => {
    const alertBox = document.querySelector('.toast');
    alertBox.style.display = 'block';
    setTimeout(function () {
      alertBox.style.display = 'none';
      window.close();
    }, 2000);
  });
}

function restoreOptions() {
  chrome.storage.local.get({
    apiKey: '',
    encryptedApiKey: '',
    sendHistory: 'manual',
    apiChoice: 'openai',
    toneOfVoice: 'Use Emoji and my own writing style. Be concise.'
  }, (items) => {
    if (items.encryptedApiKey) {
      document.getElementById('api-key').value = '';
      document.getElementById('api-key').placeholder = 'Encrypted';
    } else {
      document.getElementById('api-key').value = items.apiKey;
    }
    document.getElementById('tone-of-voice').value = items.toneOfVoice;
    document.getElementById('api-choice').value = items.apiChoice;

    const sendHistoryRadio = document.querySelector(`input[name="send-history"][value="${items.sendHistory}"]`);
    if (sendHistoryRadio) {
      sendHistoryRadio.checked = true;
    }
  });
}
