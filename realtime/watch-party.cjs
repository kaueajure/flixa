const { createHmac, randomBytes, timingSafeEqual } = require("node:crypto");
const { WebSocketServer } = require("ws");

const SOCKET_PATH = "/api/watch-party/socket";
const PROVIDERS = new Set(["cinesrc", "moviesapi", "vidzen"]);
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rooms = new Map();
const attachedServers = new WeakSet();

function secret() {
  return String(process.env.WATCH_PARTY_SECRET || process.env.MYSQL_PASSWORD || "");
}

function verifyTicket(ticket) {
  const parts = String(ticket || "").split(".");
  if (parts.length !== 2 || !secret()) return null;
  const expected = createHmac("sha256", secret()).update(parts[0]).digest();
  let received;
  try {
    received = Buffer.from(parts[1], "base64url");
  } catch {
    return null;
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const expiresAt = Number(payload?.exp);
    if (!payload || !Number.isInteger(payload.uid) || typeof payload.name !== "string" || !Number.isFinite(expiresAt) || expiresAt < Date.now() || expiresAt > Date.now() + 10 * 60_000) {
      return null;
    }
    return { id: payload.uid, name: payload.name.slice(0, 80) };
  } catch {
    return null;
  }
}

function makeRoomCode() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const bytes = randomBytes(6);
    let code = "";
    for (let index = 0; index < 6; index += 1) code += ROOM_ALPHABET[bytes[index] % ROOM_ALPHABET.length];
    if (!rooms.has(code)) return code;
  }
  throw new Error("Não foi possível gerar o código da sala");
}

function send(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

function roomParticipants(room) {
  return [...room.clients.values()].map((client) => ({
    id: client.id,
    name: client.user.name,
    host: client.id === room.hostClientId,
  }));
}

function broadcast(room, payload, exceptClientId = "") {
  for (const client of room.clients.values()) {
    if (client.id !== exceptClientId) send(client.ws, payload);
  }
}

function broadcastParticipants(room) {
  broadcast(room, { type: "participants", participants: roomParticipants(room) });
}

function cleanMedia(value) {
  if (!value || typeof value !== "object") return null;
  const kind = value.kind === "tv" ? "tv" : value.kind === "movie" ? "movie" : null;
  const id = typeof value.id === "string" ? value.id.slice(0, 64) : "";
  const title = typeof value.title === "string" ? value.title.slice(0, 180) : "";
  if (!kind || !id || !title) return null;
  return {
    id,
    title,
    kind,
    season: kind === "tv" ? Math.max(1, Math.floor(Number(value.season) || 1)) : null,
    episode: kind === "tv" ? Math.max(1, Math.floor(Number(value.episode) || 1)) : null,
  };
}

function joinedPayload(room, client) {
  return {
    type: "joined",
    clientId: client.id,
    roomCode: room.code,
    role: client.id === room.hostClientId ? "host" : "guest",
    providerId: room.providerId,
    media: room.media,
    playback: room.playback,
    participants: roomParticipants(room),
    serverNow: Date.now(),
  };
}

function leaveRoom(client) {
  if (!client.roomCode) return;
  const room = rooms.get(client.roomCode);
  client.roomCode = "";
  if (!room) return;
  room.clients.delete(client.id);
  if (room.clients.size === 0) {
    rooms.delete(room.code);
    return;
  }
  if (room.hostClientId === client.id) {
    room.hostClientId = room.clients.keys().next().value;
    broadcast(room, { type: "hostChanged", hostClientId: room.hostClientId });
  }
  broadcastParticipants(room);
}

function handleMessage(client, raw) {
  if (raw.length > 16_384) return;
  let message;
  try {
    message = JSON.parse(raw.toString());
  } catch {
    return;
  }

  if (message.type === "ping") {
    send(client.ws, { type: "pong", serverNow: Date.now() });
    return;
  }

  if (message.type === "create") {
    leaveRoom(client);
    const media = cleanMedia(message.media);
    const providerId = typeof message.providerId === "string" ? message.providerId : "";
    if (!media || !PROVIDERS.has(providerId)) {
      send(client.ws, { type: "error", message: "Filme ou provedor incompatível com a sessão." });
      return;
    }
    const code = makeRoomCode();
    const room = {
      code,
      hostClientId: client.id,
      providerId,
      media,
      playback: { paused: true, currentTime: 0, updatedAt: Date.now(), sequence: 0 },
      clients: new Map([[client.id, client]]),
    };
    client.roomCode = code;
    rooms.set(code, room);
    send(client.ws, joinedPayload(room, client));
    return;
  }

  if (message.type === "join") {
    leaveRoom(client);
    const code = String(message.roomCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      send(client.ws, { type: "error", message: "Sala não encontrada ou já encerrada." });
      return;
    }
    if (room.clients.size >= 12) {
      send(client.ws, { type: "error", message: "Esta sala atingiu o limite de 12 participantes." });
      return;
    }
    client.roomCode = code;
    room.clients.set(client.id, client);
    send(client.ws, joinedPayload(room, client));
    broadcastParticipants(room);
    return;
  }

  const room = rooms.get(client.roomCode);
  if (!room) return;
  if (message.type === "leave") {
    leaveRoom(client);
    send(client.ws, { type: "left" });
    return;
  }
  if (message.type === "close") {
    if (room.hostClientId !== client.id) return;
    broadcast(room, { type: "roomClosed" });
    for (const member of room.clients.values()) member.roomCode = "";
    rooms.delete(room.code);
    return;
  }
  if (room.hostClientId !== client.id) return;

  if (message.type === "provider") {
    const providerId = typeof message.providerId === "string" ? message.providerId : "";
    if (!PROVIDERS.has(providerId)) return;
    room.providerId = providerId;
    room.playback = {
      ...room.playback,
      paused: true,
      currentTime: Math.max(0, Number(message.currentTime) || room.playback.currentTime),
      updatedAt: Date.now(),
      sequence: room.playback.sequence + 1,
    };
    broadcast(room, { type: "provider", providerId, playback: room.playback, serverNow: Date.now() }, client.id);
    return;
  }

  if (message.type === "sync") {
    const action = ["play", "pause", "seek", "state"].includes(message.action) ? message.action : "";
    if (!action) return;
    const currentTime = Math.max(0, Math.min(86_400, Number(message.currentTime) || 0));
    const paused = action === "pause" ? true : action === "play" ? false : Boolean(message.paused);
    room.playback = {
      paused,
      currentTime,
      updatedAt: Date.now(),
      sequence: room.playback.sequence + 1,
    };
    broadcast(room, {
      type: "sync",
      action,
      playback: room.playback,
      serverNow: Date.now(),
    }, client.id);
  }
}

function attachWatchPartyServer(server) {
  if (!server || attachedServers.has(server)) return;
  attachedServers.add(server);
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    let url;
    try {
      url = new URL(request.url || "/", "http://localhost");
    } catch {
      return;
    }
    if (url.pathname !== SOCKET_PATH) return;
    const user = verifyTicket(url.searchParams.get("ticket"));
    if (!user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, user));
  });

  wss.on("connection", (ws, user) => {
    const client = { id: randomBytes(8).toString("hex"), user, ws, roomCode: "" };
    send(ws, { type: "connected", clientId: client.id });
    ws.on("message", (raw) => handleMessage(client, raw));
    ws.on("close", () => leaveRoom(client));
    ws.on("error", () => leaveRoom(client));
  });
}

module.exports = { attachWatchPartyServer };
