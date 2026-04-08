# Custom Sticker Extension — Architecture Plan

## What We're Building

A **Chrome extension** (Manifest V3) + a **self-hosted Node.js/Socket.io backend** that lets all participants of a Google Meet session — who have the extension installed — send flying sticker animations to each other in real-time, completely independent of Google's infrastructure.

---

## Project Structure

```
custom-sticker-extension/
├── PLAN.md                         ← this file
├── first_draft.md
│
├── extension/
│   ├── manifest.json               ← Chrome MV3 manifest
│   ├── background/
│   │   └── service-worker.js       ← background service worker (MV3)
│   ├── content/
│   │   ├── content.js              ← main injected script (orchestrator)
│   │   ├── picker.js               ← Telegram-like sticker picker UI
│   │   ├── overlay.js              ← transparent overlay + flying animations
│   │   └── socket-client.js        ← WebSocket connection to backend
│   ├── options/
│   │   ├── options.html            ← extension options page
│   │   ├── options.js              ← pack management + password gate
│   │   └── options.css
│   ├── assets/
│   │   ├── icons/                  ← extension icons (16, 48, 128 px)
│   │   └── sticker-packs/          ← pre-bundled packs
│   │       ├── animals/            ← Animal stickers (GIFs/PNGs)
│   │       ├── reactions/          ← Reaction stickers
│   │       └── memes/              ← Meme stickers
│   └── styles/
│       ├── picker.css              ← sticker picker panel styles
│       └── overlay.css             ← flying animation styles
│
└── backend/
    ├── server.js                   ← Express + Socket.io server
    ├── package.json
    ├── Dockerfile
    └── docker-compose.yml
```

---

## Extension Architecture

### Manifest (MV3)
- `content_scripts` runs on `https://meet.google.com/*`
- `permissions`: `storage`, `activeTab`
- `options_page` for managing sticker packs
- `host_permissions`: `https://meet.google.com/*`, `http://localhost:3000/*`

### Content Script Flow (`content.js`)

1. Detect `https://meet.google.com/[meeting-id]` URL pattern
2. Poll/observe the DOM until Meet's bottom controls bar appears
3. Extract the **Meeting ID** from the URL (e.g. `abc-defg-hij`)
4. Connect to the WebSocket backend at `ws://localhost:3000` and **join room** named after the Meeting ID
5. Inject a custom **sticker button** into Meet's bottom toolbar
6. Inject a full-screen **transparent overlay** `<div>` for animations (pointer-events: none)
7. When the sticker button is clicked → open the **Picker UI**
8. When a sticker is selected → send a WebSocket event + trigger animation locally
9. When a WebSocket broadcast is received → trigger the flying animation for the incoming sticker

### Sticker Picker UI (`picker.js`)

A Telegram-like floating panel that appears above the sticker button:

```
┌─────────────────────────────────────────┐
│  [ 😀 Emoji ]  [ 🐱 Sticker Packs ]     │  ← tab bar
├─────────────────────────────────────────┤
│  [Animals] [Reactions] [Memes] [My Pack] │  ← horizontal pack scroller (Sticker Packs tab)
├─────────────────────────────────────────┤
│  🐱 🐶 🐸 🦊 🐼 🐧 🦋 🐙              │
│  🦄 🐻 🦁 🐯 🐺 🐨 🦘 🦔              │  ← sticker grid
│                        [ + Import Pack ] │
└─────────────────────────────────────────┘
```

- **Emoji Tab**: full emoji grid, categorized (Smileys, Animals, Food, etc.)
- **Sticker Packs Tab**: horizontal scroll of pack icons, grid of stickers below, "+ Import Pack" button

### Custom Pack Import (Password-Gated)

Flow:
1. User clicks **"+ Import Pack"** inside the picker (or via the Options page)
2. A modal appears: _"Enter import password"_
3. Password is stored once in `chrome.storage.local` (set via Options page on first use)
4. If the entered password matches → file picker opens for a `.zip` file
5. The `.zip` is parsed in-browser using **JSZip** (bundled with the extension)
6. All image files inside are extracted and stored as base64 in `chrome.storage.local` under the pack name
7. The new pack immediately appears in the sticker picker's pack scroller

> **Note:** The import password is set by the extension owner on the Options page. It prevents casual users from adding arbitrary packs without authorization.

### Animation System (`overlay.js`)

- **Overlay element**: `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 99999`
- Per sticker event, a `<div class="flying-sticker">` is created containing:
  - `<img>` — the sticker image
  - `<span class="sender-label">` — the sender's display name (shown below the sticker)
- A random horizontal position is chosen within the viewport
- CSS keyframe animation floats it from bottom to top (like native Meet reactions)
- The DOM element is removed after the animation ends (`animationend` event)
- Multiple stickers can fly simultaneously with no interference

### WebSocket Protocol

```json
// Client → Server: join a meeting room
{ "type": "join", "room": "abc-defg-hij", "name": "Alice" }

// Client → Server: send a sticker (pre-bundled)
{ "type": "sticker", "room": "abc-defg-hij", "kind": "bundled", "pack": "animals", "file": "cat_wave.gif", "sender": "Alice" }

// Client → Server: send a sticker (custom/imported)
{ "type": "sticker", "room": "abc-defg-hij", "kind": "custom", "data": "data:image/png;base64,...", "sender": "Alice" }

// Server → All clients in room (broadcast, excluding sender)
{ "type": "sticker", "kind": "bundled"|"custom", "pack": "...", "file": "...", "data": "...", "sender": "Alice" }
```

---

## Backend Architecture

### `server.js` (Node.js + Express + Socket.io)

- **HTTP endpoint**: `GET /health` → `{ status: "ok" }` (for Docker health checks)
- **Socket.io** attached to the same HTTP server
- **Room management**: a `Map<roomId, Set<socketId>>` tracks who is in which room
- **Events handled**:
  - `join` → `socket.join(room)`, store metadata
  - `sticker` → `socket.to(room).emit('sticker', payload)` (broadcast to everyone else)
  - `disconnect` → clean up from room map
- No database or persistence — entirely ephemeral (rooms exist only while sockets are connected)

### Dockerfile

```
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js .
EXPOSE 3000
CMD ["node", "server.js"]
```

### docker-compose.yml

```yaml
services:
  sticker-server:
    build: .
    ports:
      - "3000:3000"
    restart: unless-stopped
```

---

## Technology Choices

| Concern | Choice | Reason |
|---|---|---|
| Extension API | Chrome MV3 | Required for new Chrome extensions |
| Realtime transport | Socket.io | Automatic reconnection, room support built-in |
| Zip parsing | JSZip (bundled) | No server-side upload needed |
| Backend runtime | Node.js 18 Alpine | Minimal footprint |
| Containerization | Docker + Compose | Easy self-hosting, one command to start |
| Animations | CSS keyframes | GPU-accelerated, no JS animation loop needed |
| Sticker storage | `chrome.storage.local` | Persists across sessions for imported packs |

---

## Key Constraints & Notes

- **Mutual installation required**: both sides must have the extension installed to see each other's stickers. Users without the extension see nothing unusual in their Meet session.
- **Backend URL**: hardcoded to `ws://localhost:3000` initially. Can be moved to an Options page setting later.
- **Google Meet DOM changes**: Meet's UI is dynamically rendered and can change. The content script uses a `MutationObserver` to reliably detect when the toolbar is ready before injecting the sticker button.
- **No Google API access**: the extension never touches Meet's own signaling or video infrastructure. It is a purely parallel overlay system.
- **CORS**: the backend allows all origins (acceptable for a self-hosted local server).

---

## Build Order

1. **Backend** — `server.js`, `package.json`, `Dockerfile`, `docker-compose.yml`
2. **Extension skeleton** — `manifest.json`, folder structure, icons placeholder
3. **Content script** — DOM injection + MutationObserver + Meeting ID extraction
4. **Socket client** — connect, join room, send/receive events
5. **Overlay** — transparent div + CSS animation
6. **Picker UI** — Emoji tab + Sticker Packs tab + pack scroller
7. **Custom pack import** — JSZip + password gate + `chrome.storage.local`
8. **Options page** — set import password, manage/delete packs
