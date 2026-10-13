import { VERSION, validPlayback, descendantOf, normalizeCommand } from "./protocol.js";
import { PROVIDER_IDS, MEDIA_ORIGINS } from "./providers.js";
const sessions = new Map();
const videos = new Map();
const initialized = chrome.storage.session.get("sessions").then(({ sessions: saved = {} }) => {
  for (const [id, value] of Object.entries(saved)) sessions.set(Number(id), { ...value, rootId: null, selected: null });
});
const persist = () => chrome.storage.session.set({ sessions: Object.fromEntries(sessions) });
const originOf = value => { try { return new URL(value).origin; } catch { return ""; } };
const mediaOrigin = value => MEDIA_ORIGINS.includes(originOf(value));
async function permittedSite(sender) {
  if (!sender.tab || sender.frameId !== 0 || !/^https?:/.test(sender.url || "")) return false;
  const { sites = [] } = await chrome.storage.local.get("sites");
  return sites.includes(originOf(sender.url));
}
async function framesFor(tabId) { return await chrome.webNavigation.getAllFrames({ tabId }) || []; }
async function notify(tabId, payload) {
  const session = sessions.get(tabId);
  if (!session) return;
  await chrome.tabs.sendMessage(tabId, { type: "FLIXA_GROUP_EVENT", channel: session.channel, sourceUrl: session.sourceUrl, ...payload }, { frameId: 0 }).catch(() => {});
}
async function snapshot(tabId, frameId, value, eventName) {
  const session = sessions.get(tabId);
  if (!session?.rootId || !mediaOrigin(value.url)) return;
  const frames = await framesFor(tabId);
  if (!descendantOf(frames, frameId, session.rootId)) return;
  const key = `${frameId}:${value.videoId}`;
  let records = videos.get(tabId); if (!records) { records = new Map(); videos.set(tabId, records); }
  records.set(key, { ...value, frameId, receivedAt: Date.now() });
  const candidates = [...records.entries()].filter(([, v]) => Date.now() - v.receivedAt < 5000 && validPlayback(v));
  const previous = records.get(session.selected);
  if (!previous || Date.now() - previous.receivedAt > 5000) session.selected = null;
  if (!session.selected) session.selected = candidates.sort((a, b) => b[1].duration - a[1].duration)[0]?.[0] || null;
  if (session.selected !== key) return;
  // Keep the selected video through buffering; never silently jump to a different stream.
  await notify(tabId, { kind: "playback", event: eventName, playback: value });
}
async function command(tabId, command, time) {
  const session = sessions.get(tabId); const value = normalizeCommand(command, time);
  const selected = videos.get(tabId)?.get(session?.selected);
  if (!session || !value || !selected || Date.now() - selected.receivedAt > 5000) return { error: "Vídeo indisponível. Inicie o player e tente novamente." };
  const frames = await framesFor(tabId);
  if (!descendantOf(frames, selected.frameId, session.rootId)) return { error: "O player mudou. Aguarde a detecção do vídeo." };
  return chrome.tabs.sendMessage(tabId, { type: "FLIXA_GROUP_MEDIA_COMMAND", binding: session.binding, videoId: selected.videoId, ...value }, { frameId: selected.frameId });
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  (async () => {
    await initialized;
    const tabId = sender.tab?.id;
    if (message?.type === "FLIXA_GROUP_SITE") {
      if (!await permittedSite(sender)) throw Error("Ative a extensão nesta aba do Flixa.");
      if (message.action === "ping") return { installed: true, version: VERSION };
      if (message.action === "release") {
        const session = sessions.get(tabId);
        if (session?.channel === message.channel) { sessions.delete(tabId); videos.delete(tabId); await persist(); }
        return { ok: true };
      }
      if (message.action === "bind") {
        if (!PROVIDER_IDS.includes(message.providerId) || !mediaOrigin(message.sourceUrl) || !["preview", "host", "guest"].includes(message.role)) throw Error("Player não autorizado pela extensão.");
        const old = sessions.get(tabId);
        const same = old?.channel === message.channel && old?.sourceUrl === message.sourceUrl;
        const session = { channel: message.channel, sourceUrl: message.sourceUrl, providerId: message.providerId, role: message.role, roomCode: String(message.roomCode || "").slice(0, 6), origin: originOf(sender.url), binding: same ? old.binding : crypto.randomUUID(), rootId: same ? old.rootId : null, selected: same ? old.selected : null };
        sessions.set(tabId, session); if (!same) videos.delete(tabId);
        await persist();
        return { binding: session.binding, version: VERSION };
      }
      if (message.action === "command") {
        if (sessions.get(tabId)?.channel !== message.channel) throw Error("Sessão do player inválida.");
        return await command(tabId, message.command, message.time);
      }
    }
    if (message?.type === "FLIXA_GROUP_REGISTER_ROOT" && sender.frameId > 0 && mediaOrigin(sender.url)) {
      const session = sessions.get(tabId);
      const frame = await chrome.webNavigation.getFrame({ tabId, frameId: sender.frameId });
      if (session?.binding === message.binding && frame?.parentFrameId === 0) {
        session.rootId = sender.frameId; await persist(); return { ok: true };
      }
    }
    if (message?.type === "FLIXA_GROUP_MEDIA_CONTEXT" && sender.frameId > 0 && mediaOrigin(sender.url)) {
      const session = sessions.get(tabId);
      if (session?.rootId && descendantOf(await framesFor(tabId), sender.frameId, session.rootId)) return { binding: session.binding };
      return {};
    }
    if (message?.type === "FLIXA_GROUP_MEDIA_STATE" && sender.frameId > 0 && mediaOrigin(sender.url)) {
      const session = sessions.get(tabId);
      if (session?.binding === message.binding && message.playback && message.playback.url === originOf(sender.url)) await snapshot(tabId, sender.frameId, message.playback, message.event);
      return { ok: true };
    }
    if (!sender.tab && message?.type === "FLIXA_GROUP_POPUP") {
      const session = sessions.get(message.tabId);
      if (message.action === "status") {
        const { sites = [] } = await chrome.storage.local.get("sites");
        const tab = await chrome.tabs.get(message.tabId);
        const selected = videos.get(message.tabId)?.get(session?.selected);
        return { enabled: sites.includes(originOf(tab.url)), version: VERSION, session: session ? { role: session.role, roomCode: session.roomCode, providerId: session.providerId } : null, playback: selected && Date.now() - selected.receivedAt < 5000 ? selected : null };
      }
      if (message.action === "disconnect") {
        await notify(message.tabId, { kind: "disconnected" }); sessions.delete(message.tabId); videos.delete(message.tabId); await persist(); return { ok: true };
      }
      if (message.action === "control") {
        if (session?.role !== "host" || !session.roomCode) throw Error("Apenas o anfitrião controla a sala.");
        const value = normalizeCommand(message.command, message.time); if (!value) throw Error("Comando inválido.");
        // The site publishes using its server-issued host token; the extension has no Ably credentials.
        await notify(message.tabId, { kind: "host-command", ...value }); return { ok: true };
      }
    }
    throw Error("Mensagem não permitida.");
  })().then(respond, error => respond({ error: error.message || "Falha ao conectar a extensão." }));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => { sessions.delete(tabId); videos.delete(tabId); void persist(); });
chrome.webNavigation.onCommitted.addListener(details => {
  if (details.frameId === 0) { sessions.delete(details.tabId); videos.delete(details.tabId); void persist(); }
});
