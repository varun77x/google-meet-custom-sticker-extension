'use strict';

/**
 * picker.js
 * The Telegram-like sticker picker panel.
 * Depends on: overlay.js, socket-client.js
 */

(function () {
  // ── Emoji data ────────────────────────────────────────────────────────────
  const EMOJI_CATEGORIES = [
    { label: '😀 Smileys', emojis: ['😀','😂','🥰','😍','🤩','😎','🥳','😭','😤','🤔','😶','😏','🙄','😴','🤯','🥺','😬','🤗','😇','🥴'] },
    { label: '👍 Gestures', emojis: ['👍','👎','🙌','👏','🤝','🤞','✌️','🤟','🤘','👌','🤌','👋','💪','🦾','✋','🖐️','🤙','🫶','💅','🙏'] },
    { label: '🐱 Animals', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦆','🦉'] },
    { label: '🎉 Party',   emojis: ['🎉','🎊','🎈','🎁','🏆','🥇','🎯','🎮','🎲','🎭','🎨','🎤','🎵','🎶','🔥','💥','✨','🌟','⭐','💫'] },
    { label: '❤️ Hearts',  emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💝','💘','💟','♥️'] },
  ];

  // Pre-bundled sticker packs definition (images must live in assets/sticker-packs/<pack>/)
  // Each entry: { id, label, files[] }
  // Files are loaded via chrome.runtime.getURL at render time.
  const BUNDLED_PACKS = [
    { id: 'animals',   label: '🐾 Animals',   files: ['panda.png'] },
    { id: 'reactions', label: '🙌 Reactions',  files: [] },
    { id: 'memes',     label: '😂 Memes',      files: [] },
  ];

  let panel = null;
  let activeTab = 'emoji';        // 'emoji' | 'packs'
  let activePackId = null;
  let customPacks = [];           // loaded from chrome.storage.local
  let importPasswordHash = null;  // SHA-256 of the import password

  // ── Helpers ───────────────────────────────────────────────────────────────

  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function loadStorageData() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['customPacks', 'importPasswordHash'], (data) => {
        customPacks = data.customPacks || [];
        importPasswordHash = data.importPasswordHash || null;
        resolve();
      });
    });
  }

  function getPackList() {
    return [
      ...BUNDLED_PACKS,
      ...customPacks,
    ];
  }

  function getStickerSrc(pack, file) {
    if (pack.startsWith('__custom__')) {
      // Custom pack: file is a base64 data URI stored directly
      return file;
    }
    return chrome.runtime.getURL(`assets/sticker-packs/${pack}/${file}`);
  }

  // ── Build UI ───────────────────────────────────────────────────────────────

  function createPanel() {
    const el = document.createElement('div');
    el.id = 'ms-picker-panel';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Sticker picker');

    el.innerHTML = `
      <div id="ms-tab-bar">
        <button class="ms-tab active" data-tab="emoji" title="Emoji">😀</button>
        <button class="ms-tab" data-tab="packs" title="Sticker Packs">🐱</button>
      </div>
      <div id="ms-tab-emoji" class="ms-tab-content"></div>
      <div id="ms-tab-packs" class="ms-tab-content" style="display:none">
        <div id="ms-pack-scroller"></div>
        <div id="ms-sticker-grid"></div>
        <button id="ms-import-btn" title="Import a custom sticker pack (.zip)">＋ Import Pack</button>
      </div>
      <div id="ms-import-modal" style="display:none">
        <div id="ms-import-modal-inner">
          <p>Enter import password</p>
          <input id="ms-import-pw" type="password" placeholder="Password" autocomplete="off" />
          <div id="ms-import-actions">
            <button id="ms-import-confirm">Confirm</button>
            <button id="ms-import-cancel">Cancel</button>
          </div>
          <p id="ms-import-error" style="display:none;color:#f66">Wrong password</p>
        </div>
      </div>
    `;

    document.body.appendChild(el);
    return el;
  }

  function renderEmojiTab() {
    const container = panel.querySelector('#ms-tab-emoji');
    container.innerHTML = '';

    EMOJI_CATEGORIES.forEach(({ label, emojis }) => {
      const catLabel = document.createElement('div');
      catLabel.className = 'ms-cat-label';
      catLabel.textContent = label;
      container.appendChild(catLabel);

      const grid = document.createElement('div');
      grid.className = 'ms-emoji-grid';

      emojis.forEach((em) => {
        const btn = document.createElement('button');
        btn.className = 'ms-emoji-btn';
        btn.textContent = em;
        btn.title = em;
        btn.addEventListener('click', () => sendEmoji(em));
        grid.appendChild(btn);
      });

      container.appendChild(grid);
    });
  }

  function renderPackScroller() {
    const scroller = panel.querySelector('#ms-pack-scroller');
    scroller.innerHTML = '';

    getPackList().forEach((pack) => {
      const btn = document.createElement('button');
      btn.className = 'ms-pack-btn' + (pack.id === activePackId ? ' active' : '');
      btn.textContent = pack.label;
      btn.dataset.packId = pack.id;
      btn.addEventListener('click', () => selectPack(pack.id));
      scroller.appendChild(btn);
    });
  }

  function renderStickerGrid(packId) {
    const grid = panel.querySelector('#ms-sticker-grid');
    grid.innerHTML = '';

    const allPacks = getPackList();
    const pack = allPacks.find(p => p.id === packId);
    if (!pack) return;

    const files = pack.files || [];
    if (files.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'ms-empty';
      empty.textContent = 'No stickers yet — add some images to this pack folder.';
      grid.appendChild(empty);
      return;
    }

    files.forEach((file) => {
      const btn = document.createElement('button');
      btn.className = 'ms-sticker-btn';

      const img = document.createElement('img');
      img.src = packId.startsWith('__custom__') ? file : getStickerSrc(packId, file);
      img.alt = '';
      img.loading = 'lazy';
      btn.appendChild(img);

      btn.addEventListener('click', () => sendPackSticker(packId, file));
      grid.appendChild(btn);
    });
  }

  function selectPack(packId) {
    activePackId = packId;
    renderPackScroller();
    renderStickerGrid(packId);
  }

  // ── Send actions ───────────────────────────────────────────────────────────

  function sendEmoji(em) {
    // Render emoji as text on a canvas → data URI, then fly + broadcast
    const size = 72;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.font = `${size * 0.8}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(em, size / 2, size / 2);
    const dataUri = canvas.toDataURL('image/png');

    const senderName = window.MeetStickerMeta?.displayName || 'You';
    window.StickerOverlay.flySticker({ src: dataUri, sender: senderName });
    window.StickerSocket.sendSticker({ kind: 'custom', data: dataUri });
  }

  function sendPackSticker(packId, file) {
    const src = packId.startsWith('__custom__') ? file : getStickerSrc(packId, file);
    const senderName = window.MeetStickerMeta?.displayName || 'You';

    window.StickerOverlay.flySticker({ src, sender: senderName });

    if (packId.startsWith('__custom__')) {
      window.StickerSocket.sendSticker({ kind: 'custom', data: file });
    } else {
      window.StickerSocket.sendSticker({ kind: 'bundled', pack: packId, file });
    }
  }

  // ── Import flow (password-gated) ───────────────────────────────────────────

  function openImportModal() {
    panel.querySelector('#ms-import-modal').style.display = 'flex';
    panel.querySelector('#ms-import-pw').value = '';
    panel.querySelector('#ms-import-error').style.display = 'none';
    panel.querySelector('#ms-import-pw').focus();
  }

  function closeImportModal() {
    panel.querySelector('#ms-import-modal').style.display = 'none';
  }

  async function confirmImportPassword() {
    const pw = panel.querySelector('#ms-import-pw').value;
    const hash = await sha256(pw);

    if (!importPasswordHash) {
      // No password set yet — direct to options page to set one
      panel.querySelector('#ms-import-error').textContent = 'Set an import password in the extension Options first.';
      panel.querySelector('#ms-import-error').style.display = 'block';
      return;
    }

    if (hash !== importPasswordHash) {
      panel.querySelector('#ms-import-error').style.display = 'block';
      panel.querySelector('#ms-import-pw').value = '';
      panel.querySelector('#ms-import-pw').focus();
      return;
    }

    closeImportModal();
    openFilePicker();
  }

  function openFilePicker() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      if (input.files[0]) importZip(input.files[0]);
      document.body.removeChild(input);
    }, { once: true });
    input.click();
  }

  async function importZip(file) {
    // JSZip must be bundled — loaded by the manifest as a content script
    if (!window.JSZip) {
      alert('[MeetStickers] JSZip not loaded. Please reload the page.');
      return;
    }

    const zip = await window.JSZip.loadAsync(file);
    const packName = file.name.replace(/\.zip$/i, '');
    const packId = '__custom__' + packName;

    const imageFiles = [];
    const imageExts = /\.(png|jpg|jpeg|gif|webp)$/i;

    const promises = [];
    zip.forEach((relativePath, zipEntry) => {
      if (!zipEntry.dir && imageExts.test(relativePath)) {
        const promise = zipEntry.async('base64').then((b64) => {
          const ext = relativePath.split('.').pop().toLowerCase();
          const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                     : ext === 'gif' ? 'image/gif'
                     : ext === 'webp' ? 'image/webp'
                     : 'image/png';
          imageFiles.push(`data:${mime};base64,${b64}`);
        });
        promises.push(promise);
      }
    });

    await Promise.all(promises);

    if (imageFiles.length === 0) {
      alert('[MeetStickers] No image files found inside the zip.');
      return;
    }

    const newPack = { id: packId, label: `📦 ${packName}`, files: imageFiles };

    // Remove any previous pack with same id, then add the new one
    customPacks = customPacks.filter(p => p.id !== packId);
    customPacks.push(newPack);

    chrome.storage.local.set({ customPacks }, () => {
      renderPackScroller();
      selectPack(packId);
    });
  }

  // ── Tab switching ──────────────────────────────────────────────────────────

  function switchTab(tab) {
    activeTab = tab;
    panel.querySelectorAll('.ms-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    panel.querySelector('#ms-tab-emoji').style.display = tab === 'emoji' ? 'block' : 'none';
    panel.querySelector('#ms-tab-packs').style.display = tab === 'packs' ? 'block' : 'none';

    if (tab === 'packs' && !activePackId && getPackList().length > 0) {
      selectPack(getPackList()[0].id);
    }
  }

  // ── Panel open/close ───────────────────────────────────────────────────────

  function closePanel() {
    if (!panel) return;
    panel.style.display = 'none';
  }

  function togglePanel(anchorEl) {
    if (!panel) {
      panel = createPanel();
      bindEvents(panel);
    }

    const isVisible = panel.style.display === 'flex';

    if (isVisible) {
      closePanel();
      return;
    }

    // Position the panel above the anchor button
    const rect = anchorEl.getBoundingClientRect();
    panel.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.display = 'flex';

    loadStorageData().then(() => {
      renderEmojiTab();
      renderPackScroller();
      if (activeTab === 'packs' && !activePackId && getPackList().length > 0) {
        selectPack(getPackList()[0].id);
      }
    });
  }

  function bindEvents(el) {
    el.querySelectorAll('.ms-tab').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    el.querySelector('#ms-import-btn').addEventListener('click', openImportModal);
    el.querySelector('#ms-import-cancel').addEventListener('click', closeImportModal);
    el.querySelector('#ms-import-confirm').addEventListener('click', confirmImportPassword);
    el.querySelector('#ms-import-pw').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmImportPassword();
    });

    // Close panel when clicking outside
    document.addEventListener('mousedown', (e) => {
      if (panel && panel.style.display === 'flex' && !panel.contains(e.target)) {
        const btn = document.getElementById('ms-sticker-btn');
        if (btn && btn.contains(e.target)) return;
        closePanel();
      }
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  window.StickerPicker = { togglePanel };
})();
