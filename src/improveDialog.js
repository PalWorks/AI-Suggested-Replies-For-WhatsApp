let improveDialogVisible = false;

function showImproveDialog(chatHistory, draft) {
  if (improveDialogVisible) {
    return Promise.resolve(null);
  }
  return new Promise(resolve => {
    improveDialogVisible = true;
    const overlay = document.createElement('div');
    overlay.id = 'improveDialogOverlay';
    overlay.innerHTML = `
      <style>
        #improveDialogOverlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(11, 20, 26, 0.85);
          z-index: 9999;
          font-family: var(--font-default, "Segoe UI", "Helvetica Neue", Arial, sans-serif);
        }
        #improveDialog {
          background: var(--layer-background-default, #fff);
          border-radius: 12px;
          box-shadow: 0 4px 24px rgba(11, 20, 26, 0.2);
          width: min(90%, 420px);
          max-height: 90%;
          overflow-y: auto;
          padding: 24px;
          position: relative;
        }
        #improveDialog h3 {
          margin-top: 0;
          margin-bottom: 16px;
          font-size: 20px;
          font-weight: 500;
        }
        #improveDialog textarea,
        #improveDialog select {
          width: 100%;
          margin-bottom: 12px;
          border: 1px solid var(--border-stronger, #d1d7db);
          border-radius: 8px;
          padding: 8px;
          font-size: 14px;
          color: var(--primary-strong, #111b21);
          background: var(--surface, #fff);
        }
        #improveDialog textarea {
          resize: vertical;
        }
        #improveDialog-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 16px;
        }
        #improve-generate,
        #improve-cancel {
          border: none;
          border-radius: 8px;
          padding: 8px 16px;
          font-size: 14px;
          cursor: pointer;
        }
        #improve-generate {
          background: var(--button-primary, #00a884);
          color: #fff;
        }
        #improve-cancel {
          background: var(--button-secondary, #d1d7db);
          color: var(--primary-strong, #111b21);
        }
        #improve-generate:hover {
          background: var(--button-primary-hover, #008069);
        }
        #improve-cancel:hover {
          background: var(--button-secondary-hover, #c3c8cd);
        }
        #improve-generate:focus,
        #improve-cancel:focus,
        #improveDialog-close:focus {
          outline: 2px solid var(--focus-ring, #00a884);
          outline-offset: 2px;
        }
        #improveDialog-close {
          position: absolute;
          top: 8px;
          right: 8px;
          background: transparent;
          border: none;
          font-size: 20px;
          line-height: 20px;
          cursor: pointer;
          color: var(--icon-secondary, #54656f);
        }
      </style>
      <div id="improveDialog">
        <button id="improveDialog-close" aria-label="Close">&times;</button>
        <h3>Improve Response</h3>
        <label for="improve-history">Chat history</label>
        <textarea id="improve-history" readonly></textarea>
        <label for="improve-draft">Your draft</label>
        <textarea id="improve-draft"></textarea>
        <label for="improve-style">Response Style</label>
        <select id="improve-style">
          <option value="Neutral">Neutral</option>
          <option value="Interested / Positive">Interested / Positive</option>
          <option value="Not Interested">Not Interested</option>
          <option value="Negative">Negative</option>
          <option value="Supportive">Supportive</option>
          <option value="Inquisitive">Inquisitive</option>
        </select>
        <label for="improve-tone">Tone</label>
        <select id="improve-tone">
          <option value="Professional">Professional</option>
          <option value="Polite">Polite</option>
          <option value="Friendly">Friendly</option>
          <option value="Casual">Casual</option>
          <option value="Straightforward">Straightforward</option>
          <option value="Persuasive">Persuasive</option>
        </select>
        <label for="improve-instructions">Additional instructions</label>
        <textarea id="improve-instructions" placeholder="e.g., ask follow-up questions"></textarea>
        <div id="improveDialog-buttons">
          <button id="improve-cancel">Cancel</button>
          <button id="improve-generate">Generate Response</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const dialog = overlay.querySelector('#improveDialog');
    dialog.querySelector('#improve-history').value = chatHistory;
    dialog.querySelector('#improve-draft').value = draft;

    const generateBtn = dialog.querySelector('#improve-generate');
    const cancelBtn = dialog.querySelector('#improve-cancel');
    const closeBtn = dialog.querySelector('#improveDialog-close');

    function cleanup() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      improveDialogVisible = false;
    }

    generateBtn.addEventListener('click', () => {
      const result = {
        draft: dialog.querySelector('#improve-draft').value,
        style: dialog.querySelector('#improve-style').value,
        tone: dialog.querySelector('#improve-tone').value,
        instructions: dialog.querySelector('#improve-instructions').value
      };
      cleanup();
      resolve(result);
    });

    function cancel() {
      cleanup();
      resolve(null);
    }

    cancelBtn.addEventListener('click', cancel);
    closeBtn.addEventListener('click', cancel);
    overlay.addEventListener('click', e => {
      if (e.target === overlay) cancel();
    });
  });
}
