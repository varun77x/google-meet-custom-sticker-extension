# Meet Stickers

A Chrome extension + self-hosted backend that adds **flying custom sticker and emoji reactions** to Google Meet — completely independent of Google's infrastructure.

All participants need the extension installed to see each other's stickers.

---

## Project Structure

```
custom-sticker-extension/
├── extension/          Chrome MV3 extension
└── backend/            Node.js + Socket.io server
```

---

## Quick Start

### 1. Start the backend

```bash
cd backend
docker compose up --build -d
```

Or without Docker:
```bash
cd backend
npm install
npm start
```

The server listens on **port 3000** by default.

### 2. Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `extension/` folder
4. Make sure the backend is running on `localhost:3000`

### 3. Set the import password (optional)

1. Click the extension icon → **Options**
2. Set an **Import Password** — users must enter this before importing a custom `.zip` sticker pack

---

## Usage

1. Join any Google Meet call
2. A **🐱 sticker button** appears in the bottom toolbar
3. Click it to open the picker:
   - **😀 Emoji tab** — send any emoji as a flying reaction
   - **🐱 Sticker Packs tab** — browse bundled packs (Animals, Reactions, Memes) or imported custom packs
4. Click any sticker/emoji — it flies upward on screen for everyone who has the extension

### Import a Custom Pack

1. Prepare a `.zip` file containing PNG/JPG/GIF/WEBP images
2. Click **＋ Import Pack** in the Sticker Packs tab
3. Enter the import password
4. Select your `.zip`

---

## Adding Bundled Stickers

Drop image files (PNG, GIF, WEBP) into:
```
extension/assets/sticker-packs/animals/
extension/assets/sticker-packs/reactions/
extension/assets/sticker-packs/memes/
```

Then update the `files` array for the corresponding pack in `extension/content/picker.js`:

```js
const BUNDLED_PACKS = [
  { id: 'animals', label: '🐾 Animals', files: ['cat_wave.gif', 'dog_hi.gif'] },
  ...
];
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension | Chrome MV3, vanilla JS, CSS3 |
| Realtime | Socket.io |
| Backend | Node.js 18, Express |
| Zip parsing | JSZip (bundled) |
| Storage | `chrome.storage.local` |
| Container | Docker + Compose |

---

## Notes

- **Mutual installation:** Everyone must have the extension installed to see stickers.
- **Google Meet DOM changes:** If Meet updates its UI, update the selector list in `extension/content/content.js`.
- **Backend URL:** Currently hardcoded to `ws://localhost:3000`. To change it, update the `BACKEND_URL` constant in `extension/content/socket-client.js`.
