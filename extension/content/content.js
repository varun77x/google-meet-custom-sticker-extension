'use strict';

/**
 * content.js  — Main orchestrator for the Meet Stickers extension.
 *
 * Responsibilities:
 *  1. Wait for Google Meet's in-call toolbar to be ready
 *  2. Extract the Meeting ID from the URL
 *  3. Get the user's display name from the Meet DOM
 *  4. Inject the sticker trigger button into Meet's bottom controls
 *  5. Re-inject persistently — Meet re-renders its toolbar and wipes injected elements
 *  6. Connect to the WebSocket backend (once only)
 *  7. Wire incoming sticker events → StickerOverlay
 */

(function () {
  let socketConnected = false;
  let checkInterval = null;

  // ── Meeting ID ─────────────────────────────────────────────────────────────

  function getMeetingId() {
    const match = window.location.pathname.match(/^\/([a-z]{3}-[a-z]{4}-[a-z]{3})$/i);
    return match ? match[1].toLowerCase() : null;
  }

  // ── Display name ───────────────────────────────────────────────────────────

  function getDisplayName() {
    const candidates = [
      // Most reliable in current Meet: self-tile "More options for <name>" button
      () => {
        const el = document.querySelector('[aria-label^="More options for"]');
        if (el) return el.getAttribute('aria-label').replace('More options for ', '').trim();
        return null;
      },
      // Fallback: data-self-name attribute
      () => document.querySelector('[data-self-name]')?.getAttribute('data-self-name'),
      // Fallback: data-display-name attribute
      () => document.querySelector('[data-display-name]')?.getAttribute('data-display-name'),
    ];

    for (const fn of candidates) {
      try {
        const name = fn();
        if (name && name.trim() && name.trim() !== 'You') return name.trim();
      } catch (_) {}
    }
    return 'Someone';
  }

  // ── Toolbar detection ──────────────────────────────────────────────────────

  // These selectors target Meet's bottom controls bar during an active call.
  // The key addition is requiring a mic/camera button to be present so we don't
  // match the pre-join preview screen, which also loads early.
  const TOOLBAR_SELECTORS = [
    'div[jsname="x8gxGb"]',
    'div[data-call-ended="false"] [jsname="A5il2e"]',
    '[class*="Tmb7Fd"]',
  ];

  // A button that only exists once you're actually inside the call (not pre-join)
  const IN_CALL_INDICATORS = [
    '[data-is-muted]',           // mic button
    '[jsname="BOHaEe"]',         // mic container
    '[data-call-ended="false"]', // call wrapper
  ];

  function findToolbar() {
    // Must also confirm we're in an active call, not just the lobby
    const inCall = IN_CALL_INDICATORS.some(sel => document.querySelector(sel));
    if (!inCall) return null;

    for (const sel of TOOLBAR_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  // ── Inject the sticker button ──────────────────────────────────────────────

  function injectButton(toolbar) {
    if (document.getElementById('ms-sticker-btn')) return; // already present

    const btn = document.createElement('button');
    btn.id = 'ms-sticker-btn';
    btn.title = 'Send a sticker';
    btn.setAttribute('aria-label', 'Send a sticker');
    btn.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'width:40px',
      'height:40px',
      'min-width:40px',
      'border-radius:50%',
      'border:none',
      'background:rgba(255,255,255,0.15)',
      'cursor:pointer',
      'font-size:20px',
      'margin:0 4px',
      'z-index:9999',
      'position:relative',
      'flex-shrink:0',
    ].join(';');
    btn.textContent = '🐱';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.StickerPicker.togglePanel(btn);
    });

    // Insert before the Leave/End call button if possible
    const endCallBtn = toolbar.querySelector(
      '[data-prober-id="hangup-button"], [aria-label*="Leave"], [aria-label*="End"]'
    );
    if (endCallBtn) {
      endCallBtn.parentElement.insertBefore(btn, endCallBtn);
    } else {
      toolbar.appendChild(btn);
    }
    console.log('[MeetStickers] Sticker button injected');
  }

  // ── Incoming sticker handler ───────────────────────────────────────────────

  function handleIncomingSticker(payload) {
    let src = null;
    if (payload.kind === 'bundled' && payload.pack && payload.file) {
      src = chrome.runtime.getURL(`assets/sticker-packs/${payload.pack}/${payload.file}`);
    } else if (payload.kind === 'custom' && payload.data) {
      src = payload.data;
    }
    if (!src) return;
    window.StickerOverlay.flySticker({ src, sender: payload.sender || '' });
  }

  // ── Persistent injection loop ──────────────────────────────────────────────
  // Meet re-renders its toolbar whenever the call state changes, wiping injected
  // elements. We poll every second and re-inject if the button has disappeared.

  function tick() {
    const meetingId = getMeetingId();
    if (!meetingId) return; // not on a call URL

    const toolbar = findToolbar();
    if (!toolbar) return; // lobby / pre-join screen — wait

    // Connect socket once
    if (!socketConnected) {
      window.MeetStickerMeta = { displayName: getDisplayName() };
      window.StickerSocket.connect(meetingId, window.MeetStickerMeta.displayName);
      window.StickerSocket.onSticker(handleIncomingSticker);
      socketConnected = true;
    }

    // Keep trying to resolve the real display name until we get one
    if (!window.MeetStickerMeta || window.MeetStickerMeta.displayName === 'Someone') {
      const name = getDisplayName();
      if (name !== 'Someone') {
        window.MeetStickerMeta = { displayName: name };
        console.log('[MeetStickers] Display name resolved:', name);
      }
    }

    // Re-inject button whenever Meet wipes it
    injectButton(toolbar);
  }

  function start() {
    if (checkInterval) return;
    checkInterval = setInterval(tick, 1000);
    tick(); // run immediately too
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
