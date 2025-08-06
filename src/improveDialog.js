let improveDialogVisible = false;

function showImproveDialog(chatHistory, draft) {
  if (improveDialogVisible) {
    return Promise.resolve(null);
  }
  return new Promise(resolve => {
    improveDialogVisible = true;
    const dialog = document.createElement('div');
    dialog.id = 'improveDialog';
    dialog.innerHTML = `
      <style>
        #improveDialog {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: #fff;
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
          z-index: 9999;
          max-width: 400px;
          width: 90%;
        }
        #improveDialog textarea,
        #improveDialog select {
          width: 100%;
          margin-bottom: 10px;
          border: 1px solid #ccc;
          border-radius: 5px;
          padding: 8px;
        }
        #improveDialog textarea {
          resize: vertical;
        }
        #improveDialog-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }
      </style>
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
        <button id="improve-generate">Generate Response</button>
        <button id="improve-cancel">Cancel</button>
      </div>
    `;
    document.body.appendChild(dialog);

    dialog.querySelector('#improve-history').value = chatHistory;
    dialog.querySelector('#improve-draft').value = draft;

    const generateBtn = dialog.querySelector('#improve-generate');
    const cancelBtn = dialog.querySelector('#improve-cancel');

    function cleanup() {
      if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
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

    cancelBtn.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });
  });
}
