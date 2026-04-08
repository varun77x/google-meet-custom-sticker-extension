'use strict';

/**
 * overlay.js
 * Creates and manages the full-screen transparent overlay where stickers fly.
 */

(function () {
  let overlay = null;

  function ensureOverlay() {
    if (overlay && document.body.contains(overlay)) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'ms-overlay';
    document.body.appendChild(overlay);
    return overlay;
  }

  /**
   * Launch a flying sticker animation.
   * @param {object} opts
   * @param {string} opts.src      - image URL or data URI
   * @param {string} opts.sender   - display name of the sender
   */
  function flySticker({ src, sender }) {
    const root = ensureOverlay();

    const wrapper = document.createElement('div');
    wrapper.className = 'ms-sticker-fly';

    // Random horizontal position (10%–80% of viewport width)
    const xPercent = 10 + Math.random() * 70;
    wrapper.style.left = `${xPercent}%`;

    const img = document.createElement('img');
    img.src = src;
    img.className = 'ms-sticker-img';
    img.alt = '';
    img.draggable = false;

    const label = document.createElement('span');
    label.className = 'ms-sender-label';
    label.textContent = sender || '';

    wrapper.appendChild(img);
    if (sender) wrapper.appendChild(label);
    root.appendChild(wrapper);

    // Clean up after animation finishes
    wrapper.addEventListener('animationend', () => wrapper.remove(), { once: true });
  }

  // Expose
  window.StickerOverlay = { flySticker };
})();
