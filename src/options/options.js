import {strToBuf, bufToB64} from '../utils.js';

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

function saveOptions(e) {
    e.preventDefault();
    const apiKey = document.getElementById('api-key').value;
    const sendHistory = document.querySelector('input[name="send-history"]:checked').value;
    const toneOfVoice = document.getElementById('tone-of-voice').value;
    const encryptKey = document.getElementById('encrypt-key').checked;
    console.log('Saving options with sendHistory:', sendHistory);

    const storeObj = {
        sendHistory: sendHistory,
        apiChoice: 'openai',
        toneOfVoice: toneOfVoice,
        encryptApiKey: encryptKey
    };
    if (encryptKey) {
        const passphrase = prompt('Enter passphrase to encrypt API key');
        if (!passphrase) {
            alert('Passphrase required');
            return;
        }
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const keyMaterial = crypto.subtle.importKey('raw', strToBuf(passphrase), 'PBKDF2', false, ['deriveKey']);
        keyMaterial.then(km => {
            return crypto.subtle.deriveKey({name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256'}, km, {name: 'AES-GCM', length: 256}, false, ['encrypt']);
        }).then(key => {
            return crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, strToBuf(apiKey));
        }).then(enc => {
            storeObj.encryptedApiKey = bufToB64(enc);
            storeObj.salt = bufToB64(salt);
            storeObj.iv = bufToB64(iv);
            storeObj.apiKey = '';
            chrome.storage.local.set(storeObj, () => {
                console.log('Options saved successfully');
                const alertBox = document.querySelector('.toast');
                alertBox.style.display = 'block';
                setTimeout(function () {
                    alertBox.style.display = 'none';
                    window.close()
                }, 2000);
            });
        });
        return;
    } else {
        storeObj.apiKey = apiKey;
        storeObj.encryptedApiKey = '';
        storeObj.salt = '';
        storeObj.iv = '';
        chrome.storage.local.set(storeObj, () => {
            console.log('Options saved successfully');
            const alertBox = document.querySelector('.toast');
            alertBox.style.display = 'block';
            setTimeout(function () {
                alertBox.style.display = 'none';
                window.close()
            }, 2000);
        });
    }
}

function restoreOptions() {
    chrome.storage.local.get({
        apiKey: '',
        sendHistory: 'manual',
        apiChoice: 'openai',
        toneOfVoice: 'Use Emoji and my own writing style. Be concise.',
        encryptApiKey: false
    }, (items) => {
        document.getElementById('encrypt-key').checked = items.encryptApiKey;
        if (!items.encryptApiKey) {
            document.getElementById('api-key').value = items.apiKey;
        } else {
            document.getElementById('api-key').value = '';
            document.getElementById('api-key').placeholder = 'Encrypted';
        }
        document.getElementById('tone-of-voice').value = items.toneOfVoice;

        const sendHistoryRadio = document.querySelector(`input[name="send-history"][value="${items.sendHistory}"]`);
        if (sendHistoryRadio) {
            sendHistoryRadio.checked = true;
        }
    });
}
