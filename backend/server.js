'use strict';

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 2e6, // 2 MB — enough for a base64 sticker image
});

// Health check endpoint (used by Docker and monitoring)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

// roomId → Set of socket IDs currently in that room
const rooms = new Map();

io.on('connection', (socket) => {
  let currentRoom = null;
  let displayName = 'Someone';

  // ── JOIN ────────────────────────────────────────────────────────────────────
  socket.on('join', ({ room, name }) => {
    if (typeof room !== 'string' || room.trim() === '') return;

    currentRoom = room.trim();
    displayName = (typeof name === 'string' && name.trim()) ? name.trim() : 'Someone';

    socket.join(currentRoom);

    if (!rooms.has(currentRoom)) {
      rooms.set(currentRoom, new Set());
    }
    rooms.get(currentRoom).add(socket.id);

    console.log(`[join]  ${displayName} (${socket.id}) → room "${currentRoom}"`);
  });

  // ── STICKER ─────────────────────────────────────────────────────────────────
  socket.on('sticker', (payload) => {
    if (!currentRoom) return;

    // Validate payload structure to avoid broadcasting garbage
    const kind = payload?.kind;
    if (kind !== 'bundled' && kind !== 'custom') return;

    if (kind === 'bundled') {
      if (typeof payload.pack !== 'string' || typeof payload.file !== 'string') return;
    } else {
      // custom — must have a data URI
      if (typeof payload.data !== 'string' || !payload.data.startsWith('data:image/')) return;
      // Guard against excessively large payloads (> ~1.5 MB base64)
      if (payload.data.length > 2_000_000) return;
    }

    const outgoing = {
      type: 'sticker',
      kind,
      pack: payload.pack ?? null,
      file: payload.file ?? null,
      data: payload.data ?? null,
      sender: displayName,
    };

    // Broadcast to everyone else in the room (not back to sender)
    socket.to(currentRoom).emit('sticker', outgoing);
    console.log(`[sticker] ${displayName} → room "${currentRoom}" (${kind})`);
  });

  // ── DISCONNECT ──────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      rooms.get(currentRoom).delete(socket.id);
      if (rooms.get(currentRoom).size === 0) {
        rooms.delete(currentRoom);
      }
    }
    console.log(`[leave] ${displayName} (${socket.id}) left`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Sticker backend listening on port ${PORT}`);
});
