'use strict';

/**
 * socket-client.js
 * Manages the Socket.io connection to the sticker backend.
 * Exposes a simple StickerSocket object on window for other content scripts.
 * socket.io.min.js is loaded as a content script before this file (see manifest.json),
 * so window.io is available directly — no dynamic <script> injection needed.
 */

(function () {
  // Change this to your EC2 public IP or domain when self-hosting
  // e.g. 'http://12.34.56.78:3000' or 'https://stickers.yourdomain.com'
  const BACKEND_URL = 'http://localhost:3000';

  let socket = null;
  const pendingJoin = { room: null, name: null };
  const listeners = [];

  function connect(room, name) {
    pendingJoin.room = room;
    pendingJoin.name = name;

    if (!window.io) {
      console.error('[MeetStickers] socket.io not loaded — check manifest.json content_scripts order.');
      return;
    }

    socket = window.io(BACKEND_URL, { transports: ['websocket'] });

    socket.on('connect', () => {
      console.log('[MeetStickers] Connected to backend');
      socket.emit('join', { room: pendingJoin.room, name: pendingJoin.name });
    });

    socket.on('sticker', (payload) => {
      listeners.forEach((fn) => fn(payload));
    });

    socket.on('disconnect', () => {
      console.log('[MeetStickers] Disconnected from backend');
    });

    socket.on('connect_error', (err) => {
      console.warn('[MeetStickers] Connection error:', err.message);
    });
  }

  function sendSticker(payload) {
    if (!socket || !socket.connected) {
      console.warn('[MeetStickers] Cannot send — not connected');
      return;
    }
    socket.emit('sticker', { ...payload, room: pendingJoin.room });
  }

  function onSticker(fn) {
    listeners.push(fn);
  }

  // Expose to other content scripts loaded in the same page context
  window.StickerSocket = { connect, sendSticker, onSticker };
})();
