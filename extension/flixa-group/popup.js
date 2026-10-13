import { sitePattern, siteRegistrationId } from "./protocol.js";
const $ = id => document.getElementById(id);
let tab; let playback; let polling = false;
const showError = error => { $("error").textContent = error?.message || String(error || ""); };
async function refresh() {
  if (!tab || polling) return; polling = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: "FLIXA_GROUP_POPUP", action: "status", tabId: tab.id });
    if (result.error) throw Error(result.error);
    playback = result.playback;
    $("activate").hidden = result.enabled;
    $("activate").disabled = false;
    $("disconnect").hidden = !result.enabled;
    $("indicator").className = result.enabled ? "ready" : "";
    $("status").textContent = !result.enabled ? "Conecte esta aba" : playback ? playback.buffering ? "Carregando o vídeo…" : "Vídeo detectado" : "Conectado · aguardando vídeo";
    $("room").hidden = !result.session?.roomCode;
    if (result.session?.roomCode) {
      $("code").textContent = result.session.roomCode;
      $("role").textContent = result.session.role === "host" ? "Anfitrião" : "Convidado";
      $("source").textContent = `Servidor: ${result.session.providerId}`;
      for (const id of ["play", "pause", "back", "forward"]) $(id).disabled = result.session.role !== "host" || !playback || playback.error;
      $("position").textContent = playback ? `${Math.floor(playback.currentTime / 60)}:${String(Math.floor(playback.currentTime % 60)).padStart(2, "0")} · ${playback.paused ? "Pausado" : "Reproduzindo"}` : "Inicie o vídeo para sincronizar.";
    }
  } catch (error) { showError(error); } finally { polling = false; }
}
$("activate").addEventListener("click", async () => {
  try {
    const origin = new URL(tab.url).origin; const pattern = sitePattern(tab.url);
    if (!await chrome.permissions.request({ origins: [pattern] })) throw Error("Permita o acesso a este Flixa para conectar a extensão.");
    const { sites = [] } = await chrome.storage.local.get("sites");
    await chrome.storage.local.set({ sites: [...new Set([...sites, origin])] });
    const id = siteRegistrationId(origin);
    const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
    if (!registered.length) await chrome.scripting.registerContentScripts([{ id, matches: [pattern], js: ["site-bridge.js"], runAt: "document_idle", allFrames: false, persistAcrossSessions: true }]);
    await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, files: ["site-bridge.js"] });
    showError(""); await refresh();
  } catch (error) { showError(error); }
});
$("disconnect").addEventListener("click", async () => {
  try {
    const origin = new URL(tab.url).origin;
    await chrome.runtime.sendMessage({ type: "FLIXA_GROUP_POPUP", action: "disconnect", tabId: tab.id });
    const { sites = [] } = await chrome.storage.local.get("sites");
    await chrome.storage.local.set({ sites: sites.filter(site => site !== origin) });
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    for (const script of scripts.filter(s => s.id === siteRegistrationId(origin))) await chrome.scripting.unregisterContentScripts({ ids: [script.id] });
    if (!sites.some(site => site !== origin && sitePattern(site) === sitePattern(origin))) await chrome.permissions.remove({ origins: [sitePattern(origin)] });
    showError("Desconectado. Encerre a sala no Flixa."); await refresh();
  } catch (error) { showError(error); }
});
for (const [id, command, offset] of [["play", "play"], ["pause", "pause"], ["back", "seek", -10], ["forward", "seek", 10]]) $(id).addEventListener("click", async () => {
  try {
    const result = await chrome.runtime.sendMessage({ type: "FLIXA_GROUP_POPUP", action: "control", tabId: tab.id, command, ...(command === "seek" ? { time: Math.max(0, Math.min(playback.duration, playback.currentTime + offset)) } : {}) });
    if (result.error) throw Error(result.error); showError("");
  } catch (error) { showError(error); }
});
[tab] = await chrome.tabs.query({ active: true, currentWindow: true });
if (tab?.url && /^https?:/.test(tab.url)) { $("origin").textContent = new URL(tab.url).host; await refresh(); setInterval(() => void refresh(), 1500); }
else { $("status").textContent = "Abra o Flixa em uma aba"; showError("A extensão funciona nas páginas do Flixa, no Chrome para computador."); }
