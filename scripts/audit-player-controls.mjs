/** Run with Node 22: node --experimental-strip-types scripts/audit-player-controls.mjs */
import { PLAYER_SERVERS } from "../lib/player-servers.ts";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const port = Number(process.env.FLIXA_AUDIT_CHROME_PORT || 9226);
const pagePort = Number(process.env.FLIXA_AUDIT_PAGE_PORT || 8190);
const output = resolve(process.env.FLIXA_AUDIT_OUTPUT || "/tmp/flixa-all-players");
const concurrency = Number(process.env.FLIXA_AUDIT_CONCURRENCY || 3);
const loadMs = Number(process.env.FLIXA_AUDIT_LOAD_MS || 35000);
const mode = process.env.FLIXA_AUDIT_MODE || "protected";
const selected = new Set((process.env.FLIXA_AUDIT_IDS || "").split(",").filter(Boolean));
const mediaKinds = new Set((process.env.FLIXA_AUDIT_KINDS || "movie,tv").split(","));
const movieId = process.env.FLIXA_AUDIT_MOVIE_ID || "550";
const jobs = PLAYER_SERVERS.filter((server) => !selected.size || selected.has(server.id)).flatMap((server) => [
  ...(mediaKinds.has("movie") && server.supportsMovie ? [{ id: server.id, name: server.name, kind: "movie", url: server.testUrl.replace(/550/g, movieId), sample: movieId, mode }] : []),
  ...(mediaKinds.has("tv") && server.supportsTv ? [{ id: server.id, name: server.name, kind: "tv", url: server.testTvUrl, sample: "1399/1/1", mode }] : []),
]);
await mkdir(output, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function safeUrl(value) { try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return String(value).slice(0, 200); } }

class CDP {
  static async connect(url) {
    const client = new CDP(); client.seq = 0; client.pending = new Map(); client.handlers = [];
    client.socket = new WebSocket(url);
    await new Promise((resolve, reject) => { client.socket.addEventListener("open", resolve, { once: true }); client.socket.addEventListener("error", reject, { once: true }); });
    client.socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(String(data));
      if (message.id) {
        const pending = client.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer); client.pending.delete(message.id);
        if (message.error) pending.reject(Error(message.error.message)); else pending.resolve(message.result || {});
      } else for (const fn of client.handlers) fn(message);
    });
    return client;
  }
  call(method, params = {}, sessionId) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  async evaluate(expression, sessionId) {
    const result = await this.call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
    return result.result?.value;
  }
  close() { this.socket.close(); }
}
const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
const browser = await CDP.connect(version.webSocketDebuggerUrl);
const installed = await browser.call("Extensions.getExtensions");
let extensionId = installed.extensions.find((extension) => extension.path === resolve("scripts/player-audit-extension"))?.id;
if (extensionId) { await browser.call("Extensions.uninstall", { id: extensionId }); extensionId = undefined; }
if (!extensionId) extensionId = (await browser.call("Extensions.loadUnpacked", { path: resolve("scripts/player-audit-extension") })).id;
let extensionSession;
for (let tries = 0; tries < 30 && !extensionSession; tries++) {
  const { targetInfos } = await browser.call("Target.getTargets");
  const worker = targetInfos.find((target) => target.type === "service_worker" && target.url.startsWith(`chrome-extension://${extensionId}/`));
  if (worker) extensionSession = (await browser.call("Target.attachToTarget", { targetId: worker.targetId, flatten: true })).sessionId;
  else await sleep(200);
}
if (!extensionSession) throw Error("The diagnostic extension service worker did not start");
const extensionCall = (method, ...args) => browser.evaluate(`flixaAudit.${method}(...${JSON.stringify(args)})`, extensionSession);
await writeFile(`${output}/extension.json`, JSON.stringify({ extensionId, browser: version.Browser, installed: true, mode, startedAt: new Date().toISOString() }, null, 2));
console.log(`Installed actual MV3 extension ${extensionId}; ${jobs.length} jobs; mode=${mode}`, version.Browser);

const server = createServer((request, response) => {
  const params = new URL(request.url, `http://localhost:${pagePort}`).searchParams;
  if (request.url === "/favicon.ico") { response.writeHead(204); response.end(); return; }
  const source = params.get("src");
  if (!source?.startsWith("https://")) { response.writeHead(400); response.end(); return; }
  const escaped = source.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(`<!doctype html><html><head><title>Flixa isolated player audit</title></head><body style="margin:0;background:#111;color:white"><p style="height:30px;margin:0">Local test — real provider, ${mode}</p><iframe id="player" style="border:0;width:100vw;height:calc(100vh - 30px)" src="${escaped}" ${mode === "protected" ? 'sandbox="allow-scripts allow-same-origin allow-presentation allow-orientation-lock"' : ""} allow="autoplay *; fullscreen *; encrypted-media *; picture-in-picture *" referrerpolicy="no-referrer"></iframe><script>window.auditMessages=[];addEventListener('message',e=>{const d=typeof e.data==='string'?(()=>{try{return JSON.parse(e.data)}catch{return {}}})():e.data;if(!d||typeof d!=='object')return;const record={origin:e.origin};for(const k of ['type','event','command','currentTime','duration','paused','source','sourceId','status'])if(['string','number','boolean'].includes(typeof d[k]))record[k]=String(d[k]).slice(0,120);if(typeof d.result==='number'||typeof d.result==='boolean')record.result=d.result;window.auditMessages.push(record);if(window.auditMessages.length>80)window.auditMessages.shift()})</script></body></html>`);
});
await new Promise((resolve) => server.listen(pagePort, "127.0.0.1", resolve));

function contentVideo(records) {
  const candidates = records.flatMap((frame) => frame.videos.map((video, videoIndex) => ({ frame, video, videoIndex })));
  return candidates.filter(({ video }) => video.ready >= 2 && video.duration >= 600 && !video.error).sort((a, b) => b.video.duration - a.video.duration)[0];
}
async function probe(job, index) {
  const result = { ...job, testedAt: new Date().toISOString(), extensionInstalled: true, nativeControl: "not_confirmed", extensionControl: "not_confirmed", audio: "not_verified" };
  const { targetId } = await browser.call("Target.createTarget", { url: "about:blank" });
  const page = await CDP.connect(`ws://127.0.0.1:${port}/devtools/page/${targetId}`);
  let tabId;
  const failures = []; const httpErrors = []; const scripts = new Map();
  page.handlers.push((message) => {
    if (message.method === "Target.attachedToTarget") {
      for (const method of ["Page.enable", "Network.enable"]) void page.call(method, {}, message.params.sessionId).catch(() => {});
      void page.call("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, message.params.sessionId).catch(() => {});
    }
    if (message.method === "Network.loadingFailed") failures.push(message.params.errorText);
    if (message.method === "Network.responseReceived") {
      const { response, type, requestId } = message.params;
      if (type === "Document") result.documents = [...(result.documents || []), { url: safeUrl(response.url), status: response.status }];
      if (response.status >= 400) httpErrors.push({ url: safeUrl(response.url), status: response.status });
      if (type === "Script" && response.status === 200) scripts.set(`${message.sessionId || "root"}:${requestId}`, { requestId, sessionId: message.sessionId, url: safeUrl(response.url) });
    }
  });
  try {
    await page.call("Page.enable"); await page.call("Network.enable");
    await page.call("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    await page.call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    const wrapper = `http://127.0.0.1:${pagePort}/?job=${index}&src=${encodeURIComponent(job.url)}`;
    await page.call("Page.navigate", { url: wrapper });
    for (let tries = 0; tries < 25 && !tabId; tries++) {
      tabId = (await extensionCall("tabs")).find((tab) => tab.url === wrapper)?.id;
      if (!tabId) await sleep(100);
    }
    if (!tabId) throw Error("Extension could not identify the audit tab");
    let records = []; let chosen; const clicked = new Map();
    const started = Date.now();
    while (Date.now() - started < loadMs) {
      records = (await extensionCall("records", tabId)).filter((frame) => frame.frameId !== 0 && Date.now() - frame.receivedAt < 8000);
      chosen = contentVideo(records);
      if (chosen && Date.now() - started > 8000) break;
      if (Date.now() - started > 4500) {
        // Ordinary provider UI only: no captcha, advertisements, premium, login or invented URLs.
        const mainFrame = records.find((frame) => (() => { try { return new URL(frame.url).hostname === new URL(job.url).hostname; } catch { return false; } })()) || records[0];
        const actionable = records.flatMap((frame) => frame.clickTargets.map((target) => ({ frame, target }))).find(({ frame, target }) => {
          const key = `${frame.frameId}:${target.label}`;
          const attempts = clicked.get(key);
          return (!attempts || (attempts.count < 3 && Date.now() - attempts.last > 6000)) && target.tag !== "A" && (/^servidor 1.*disponível$/i.test(target.label) || /^(?:dublado|(?:watchplay|embed play)(?: sem anúncios)?|play(?: video| movie)?|reproduzir|assistir(?: agora)?|start watching)$/i.test(target.label)) && !/premium|advert|captcha/i.test(target.label) && (frame === mainFrame || /player|embed|stream/i.test(frame.url));
        });
        if (actionable) {
          const key = `${actionable.frame.frameId}:${actionable.target.label}`;
          clicked.set(key, { count: (clicked.get(key)?.count || 0) + 1, last: Date.now() });
          // Use a real click at the matching frame's control; nested fullscreen embeds generally share viewport coordinates.
          const { x, y } = actionable.target;
          await page.call("Input.dispatchMouseEvent", { type: "mousePressed", x, y: y + 30, button: "left", clickCount: 1 });
          await page.call("Input.dispatchMouseEvent", { type: "mouseReleased", x, y: y + 30, button: "left", clickCount: 1 });
        }
      }
      await sleep(1000);
      const doc = result.documents?.find((doc) => doc.url === safeUrl(job.url));
      if (doc?.status >= 400 && Date.now() - started > 8000) break;
    }
    result.frames = records;
    result.clicks = [...clicked].map(([control, attempts]) => ({ control, attempts: attempts.count }));
    if (chosen) {
      const { frameId } = chosen.frame; const videoIndex = chosen.videoIndex;
      const command = (action, args = {}) => extensionCall("command", tabId, frameId, action, { videoIndex, ...args });
      const take = async () => (await command("snapshot")).videos[videoIndex];
      const controls = {};
      controls.play = await command("play", { muted: true }); await sleep(1200); controls.play.afterWait = await take();
      controls.pause = await command("pause");
      const seekTo = Math.min(15, chosen.video.duration / 3);
      controls.seek = await command("seek", { time: seekTo });
      controls.resume = await command("play", { muted: true }); await sleep(1200); controls.resume.afterWait = await take();
      await command("pause");
      result.extensionEvidence = { frame: chosen.frame.url, frameId, controls, seekTo };
      const advanced = controls.resume.afterWait.time > seekTo + 0.2;
      result.extensionControl = !controls.play.error && controls.pause.after?.paused === true && Math.abs(controls.seek.after?.time - seekTo) < 1 && !controls.resume.error && advanced ? "confirmed" : "partial";
      if (["cinesrc", "moviesapi", "vidzen", "vidbolt"].includes(job.id)) {
        result.nativeProtocol = job.id === "cinesrc" ? "cinesrc:command" : job.id === "moviesapi" ? "action-object" : job.id === "vidbolt" ? "type-object" : "command-object";
        const origin = new URL(job.url).origin;
        const send = async (name, time) => {
          const payload = job.id === "cinesrc" ? { type: "cinesrc:command", command: name, args: name === "seek" ? [time] : [] } : job.id === "moviesapi" ? { action: name, ...(name === "seek" ? { time } : {}) } : job.id === "vidbolt" ? { type: name, ...(name === "seek" ? { time } : {}) } : { command: name, ...(name === "seek" ? { time } : {}) };
          await page.evaluate(`document.querySelector('#player').contentWindow.postMessage(${JSON.stringify(payload)},${JSON.stringify(origin)})`);
        };
        await send("play"); await sleep(1000); const play = await take();
        await send("pause"); await sleep(500); const pause = await take();
        await send("seek", 25); await sleep(800); const seek = await take();
        result.nativeEvidence = { play, pause, seek };
        result.nativeControl = !play.paused && pause.paused && Math.abs(seek.time - 25) < 1 ? "confirmed" : "commands_not_effective";
        await command("pause");
      }
    }
    result.messages = await page.evaluate("window.auditMessages");
    result.bridgeSignals = [];
    for (const asset of [...scripts.values()].slice(0, 45)) {
      try {
        const body = await page.call("Network.getResponseBody", { requestId: asset.requestId }, asset.sessionId);
        const text = body.base64Encoded ? Buffer.from(body.body, "base64").toString("utf8") : body.body;
        // A progress message is not command support. Record candidates without inventing protocols.
        if (text.includes("cinesrc:command") || text.includes("moviesapi-player") || text.includes("PLAYER_EVENT") || (/addEventListener\(["']message["']/.test(text) && /(?:seek|currentTime).{0,80}(?:command|action)|(?:command|action).{0,80}(?:seek|currentTime)/.test(text))) result.bridgeSignals.push({ url: asset.url, cineSrcCommands: text.includes("cinesrc:command"), moviesApiEvents: text.includes("moviesapi-player"), playerEvents: text.includes("PLAYER_EVENT"), incomingMessageHandler: /addEventListener\(["']message["']/.test(text) });
      } catch { /* Asset unavailable; do not infer compatibility. */ }
    }
    result.audioSignals = records.flatMap((frame) => {
      const tags = frame.text.match(/.{0,45}(?:dublad[oa]|portugu[eê]s|portuguese|pt-br|brazil|legendad[oa]).{0,45}/gi) || [];
      const tracks = frame.videos.flatMap((video) => video.tracks || []);
      return tags.length || tracks.length ? [{ frame: frame.url, labels: [...new Set(tags)].slice(0, 8), tracks }] : [];
    });
    result.audio = result.audioSignals.some((signal) => signal.tracks.some((track) => track.enabled && /^(pt|por|pt-br|pt-pt)$/i.test(track.language))) ? "portuguese_track_enabled" : result.audioSignals.some((signal) => signal.labels.some((label) => /dublado|portuguese|portugu[eê]s|pt-br/i.test(label))) ? "provider_label_only" : "not_verified";
    result.sandboxBlock = records.some((frame) => /sandbox detected|iframe sandbox|sandbox restrictions|restricted sandbox|sandboxed frame|restricted embed/i.test(frame.text));
    result.httpErrors = httpErrors.slice(0, 20); result.networkErrors = [...new Set(failures)].slice(0, 12);
  } catch (error) { result.error = String(error.message); }
  finally {
    if (tabId) await extensionCall("cleanup", tabId).catch(() => {});
    await browser.call("Target.closeTarget", { targetId }).catch(() => {}); page.close();
  }
  await writeFile(`${output}/${job.id}-${job.kind}-${job.sample.replaceAll('/', '_')}-${mode}.json`, JSON.stringify(result, null, 2));
  console.log(`${index + 1}/${jobs.length} ${job.id} ${job.kind}: extension=${result.extensionControl}, native=${result.nativeControl}, audio=${result.audio}${result.sandboxBlock ? ', SANDBOX BLOCK' : ''}${result.error ? ', '+result.error : ''}`);
  return result;
}
let cursor = 0; const results = new Array(jobs.length);
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (cursor < jobs.length) { const index = cursor++; results[index] = await probe(jobs[index], index); }
}));
await writeFile(`${output}/results-${mode}-${movieId}-${selected.size ? 'selected' : 'all'}.json`, JSON.stringify({ testedAt: new Date().toISOString(), browser: version.Browser, extensionInstalled: true, total: jobs.length, mode, results }, null, 2));
console.log("Complete", { total: jobs.length, extension: results.filter((result) => result.extensionControl === "confirmed").length, native: results.filter((result) => result.nativeControl === "confirmed").length });
server.close(); browser.close();
