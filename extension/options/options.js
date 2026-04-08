'use strict';

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Password section ──────────────────────────────────────────────────────────

const pwInput = document.getElementById('pw-input');
const pwSaveBtn = document.getElementById('pw-save-btn');
const pwStatus = document.getElementById('pw-status');

pwSaveBtn.addEventListener('click', async () => {
  const pw = pwInput.value.trim();
  if (!pw) {
    showStatus(pwStatus, 'Password cannot be empty.', 'error');
    return;
  }
  const hash = await sha256(pw);
  chrome.storage.local.set({ importPasswordHash: hash }, () => {
    pwInput.value = '';
    showStatus(pwStatus, 'Password saved!', 'ok');
  });
});

// ── Packs section ─────────────────────────────────────────────────────────────

const packsList = document.getElementById('packs-list');

function renderPacks(packs) {
  packsList.innerHTML = '';

  if (!packs || packs.length === 0) {
    packsList.innerHTML = '<p class="muted">No custom packs installed yet.</p>';
    return;
  }

  packs.forEach((pack) => {
    const row = document.createElement('div');
    row.className = 'pack-row';

    const label = document.createElement('span');
    label.textContent = `${pack.label}  (${pack.files.length} sticker${pack.files.length !== 1 ? 's' : ''})`;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deletePack(pack.id));

    row.appendChild(label);
    row.appendChild(deleteBtn);
    packsList.appendChild(row);
  });
}

function deletePack(packId) {
  chrome.storage.local.get(['customPacks'], (data) => {
    const packs = (data.customPacks || []).filter(p => p.id !== packId);
    chrome.storage.local.set({ customPacks: packs }, () => renderPacks(packs));
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function showStatus(el, msg, type) {
  el.textContent = msg;
  el.className = 'status ' + type;
  setTimeout(() => { el.textContent = ''; el.className = 'status'; }, 3000);
}

// ── Init ──────────────────────────────────────────────────────────────────────

chrome.storage.local.get(['customPacks'], (data) => {
  renderPacks(data.customPacks || []);
});
