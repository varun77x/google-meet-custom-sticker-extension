'use strict';

// Service worker for Meet Stickers (Chrome MV3)
// Kept minimal — all logic lives in the content scripts.

chrome.runtime.onInstalled.addListener(() => {
  console.log('[MeetStickers] Extension installed / updated.');
});
