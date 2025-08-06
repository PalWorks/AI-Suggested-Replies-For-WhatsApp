let improveDialogVisible = false;

function showImproveDialog(chatHistory, draft) {
  if (improveDialogVisible) {
    return Promise.resolve(null);
  }
  return new Promise(resolve => {
    improveDialogVisible = true;
    const overlay = document.createElement('div');
    overlay.id = 'improveDialogOverlay';
    // Build dialog markup styled like native WhatsApp popups.
    // Theme colors are controlled via CSS variables that react to WhatsApp's
    // body.dark class and fall back to prefers-color-scheme.
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
          font-family: 'Segoe UI', 'Helvetica Neue', Arial, 'Noto Sans', sans-serif;
          /* Light theme defaults */
          --modal-bg: #fff;
          --text-color: #111;
          --input-bg: #fff;
          --border-color: #d1d7db;
          --pill-bg: #fff;
          --pill-border: #e0e0e0;
          --pill-hover-bg: #f0f2f5;
          --cancel-bg: #fff;
          --cancel-border: #d1d7db;
          --cancel-hover-bg: #f0f2f5;
          --icon-color: #54656f;
        }
        /* Dark theme overrides when WhatsApp applies .dark to body */
        body.dark #improveDialogOverlay {
          --modal-bg: #23272A;
          --text-color: #F0F0F0;
          --input-bg: #2A2F32;
          --border-color: #3A3F45;
          --pill-bg: #2A2F32;
          --pill-border: #3A3F45;
          --pill-hover-bg: #3A3F45;
          --cancel-bg: #2A2F32;
          --cancel-border: #3A3F45;
          --cancel-hover-bg: #3A3F45;
          --icon-color: #AEBAC1;
        }
        /* Fallback dark theme using prefers-color-scheme */
        @media (prefers-color-scheme: dark) {
          body:not(.dark) #improveDialogOverlay {
            --modal-bg: #23272A;
            --text-color: #F0F0F0;
            --input-bg: #2A2F32;
            --border-color: #3A3F45;
            --pill-bg: #2A2F32;
            --pill-border: #3A3F45;
            --pill-hover-bg: #3A3F45;
            --cancel-bg: #2A2F32;
            --cancel-border: #3A3F45;
            --cancel-hover-bg: #3A3F45;
            --icon-color: #AEBAC1;
          }
        }
        #improveDialog {
          background: var(--modal-bg);
          border-radius: 12px;
          box-shadow: 0 4px 24px rgba(11, 20, 26, 0.2);
          width: min(90%, 560px);
          max-height: 90%;
          overflow-y: auto;
          padding: 32px;
          position: relative;
          color: var(--text-color);
        }
        #improveDialog h3 {
          margin-top: 0;
          margin-bottom: 16px;
          font-size: 20px;
          font-weight: 500;
          color: var(--text-color);
        }
        #improveDialog label {
          color: var(--text-color);
        }
        #improveDialog textarea {
          width: 100%;
          margin-bottom: 12px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 8px;
          font-size: 14px;
          color: var(--text-color);
          background: var(--input-bg);
          resize: vertical;
        }
        #improve-history {
          min-height: 160px; /* show at least 8 lines */
        }
        .pill-group {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
        }
        .pill {
          background: var(--pill-bg);
          border: 1px solid var(--pill-border);
          border-radius: 16px;
          padding: 6px 12px;
          cursor: pointer;
          box-shadow: 0 1px 1px rgba(0,0,0,0.06);
          font-size: 14px;
          color: var(--text-color);
        }
        .pill:hover,
        .pill:focus {
          background: var(--pill-hover-bg);
        }
        .pill.selected {
          background: #25D366;
          color: #fff;
          border: none;
          font-weight: 700;
          box-shadow: none;
        }
        .pill.selected:hover,
        .pill.selected:focus {
          background: #1ebe5d;
        }
        #improveDialog-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 16px;
        }
        #improve-cancel {
          background: var(--cancel-bg);
          border: 1px solid var(--cancel-border);
          border-radius: 16px;
          padding: 8px 16px;
          font-size: 14px;
          color: var(--text-color);
          cursor: pointer;
        }
        #improve-cancel:hover,
        #improve-cancel:focus {
          background: var(--cancel-hover-bg);
        }
        #improve-cancel:active {
          background: #25D366;
          color: #fff;
          font-weight: 700;
          border: none;
        }
        #improve-generate {
          background: #25D366;
          border: none;
          border-radius: 16px;
          padding: 8px 16px;
          font-size: 14px;
          color: #fff;
          cursor: pointer;
        }
        #improve-generate:hover,
        #improve-generate:focus {
          background: #1ebe5d;
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
          color: var(--icon-color);
        }
      </style>
      <div id="improveDialog" role="dialog" aria-modal="true">
        <button id="improveDialog-close" aria-label="Close">&times;</button>
        <h3>Improve Response</h3>
        <label for="improve-history">Chat history</label>
        <textarea id="improve-history" readonly></textarea>
        <label for="improve-draft">Your draft</label>
        <textarea id="improve-draft"></textarea>
        <label for="improve-style">Response Style</label>
        <div id="improve-style" class="pill-group" role="radiogroup">
          <button class="pill selected" role="radio" aria-selected="true" data-value="Neutral">Neutral</button>
          <button class="pill" role="radio" aria-selected="false" data-value="Interested / Positive">Interested / Positive</button>
          <button class="pill" role="radio" aria-selected="false" data-value="Not Interested">Not Interested</button>
          <button class="pill" role="radio" aria-selected="false" data-value="Negative">Negative</button>
          <button class="pill" role="radio" aria-selected="false" data-value="Supportive">Supportive</button>
          <button class="pill" role="radio" aria-selected="false" data-value="Inquisitive">Inquisitive</button>
        </div>
        <label for="improve-tone">Tone</label>
        <div id="improve-tone" class="pill-group" role="radiogroup">
          <button class="pill selected" role="radio" aria-selected="true" data-value="Professional">Professional</button>
          <button class="pill" role="radio" aria-selected="false" data-value="Polite">Polite</button>
          <button class="pill" role="radio" aria-selected="false" data-value="Friendly">Friendly</button>
          <button class="pill" role="radio" aria-selected="false" data-value="Casual">Casual</button>
          <button class="pill" role="radio" aria-selected="false" data-value="Straightforward">Straightforward</button>
          <button class="pill" role="radio" aria-selected="false" data-value="Persuasive">Persuasive</button>
        </div>
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

    // helper to handle pill selection for response style and tone
    function setupPills(groupSelector) {
      const group = dialog.querySelector(groupSelector);
      group.addEventListener('click', e => {
        if (e.target.classList.contains('pill')) {
          group.querySelectorAll('.pill').forEach(btn => {
            btn.classList.remove('selected');
            btn.setAttribute('aria-selected', 'false');
          });
          e.target.classList.add('selected');
          e.target.setAttribute('aria-selected', 'true');
        }
      });
    }
    setupPills('#improve-style');
    setupPills('#improve-tone');

    function cleanup() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      improveDialogVisible = false;
    }

    generateBtn.addEventListener('click', () => {
      const result = {
        draft: dialog.querySelector('#improve-draft').value,
        style: dialog.querySelector('#improve-style .pill.selected').dataset.value,
        tone: dialog.querySelector('#improve-tone .pill.selected').dataset.value,
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
