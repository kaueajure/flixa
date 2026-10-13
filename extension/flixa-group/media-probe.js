(() => {
  let binding = ""; let busy = false; let lastSent = 0;
  const ids = new WeakMap(); const observed = new WeakSet();
  function videos() {
    const roots = [document];
    for (let i = 0; i < roots.length && i < 60; i++) for (const node of roots[i].querySelectorAll("*")) if (node.shadowRoot) roots.push(node.shadowRoot);
    return roots.flatMap(root => [...root.querySelectorAll("video")]);
  }
  function state(video) {
    if (!ids.has(video)) ids.set(video, crypto.randomUUID());
    return { videoId: ids.get(video), url: location.origin, currentTime: video.currentTime, duration: Number.isFinite(video.duration) ? video.duration : 0, paused: video.paused, ready: video.readyState, buffering: !video.paused && video.readyState < 3, error: video.error ? `Erro de mídia ${video.error.code}` : "" };
  }
  async function emit(video, event = "timeupdate") {
    if (!binding) return;
    await chrome.runtime.sendMessage({ type: "FLIXA_GROUP_MEDIA_STATE", binding, event, playback: state(video) }).catch(() => {});
  }
  async function scan() {
    if (busy) return; busy = true;
    try {
      const context = await chrome.runtime.sendMessage({ type: "FLIXA_GROUP_MEDIA_CONTEXT" });
      binding = context.binding || "";
      if (!binding) return;
      for (const video of videos()) {
        if (!observed.has(video)) {
          observed.add(video);
          for (const name of ["play", "pause", "seeked", "loadedmetadata", "canplay", "ended", "error", "waiting"]) video.addEventListener(name, () => void emit(video, name === "canplay" ? "ready" : name));
        }
        if (Date.now() - lastSent >= 900) void emit(video);
      }
      lastSent = Date.now();
    } catch { binding = ""; } finally { busy = false; }
  }
  window.addEventListener("message", event => {
    if (event.source !== parent || event.data?.type !== "FLIXA_GROUP_TARGET" || typeof event.data.binding !== "string") return;
    void chrome.runtime.sendMessage({ type: "FLIXA_GROUP_REGISTER_ROOT", binding: event.data.binding }).then(result => { if (result.ok) void scan(); }).catch(() => {});
  });
  let pending = Promise.resolve();
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type !== "FLIXA_GROUP_MEDIA_COMMAND") return;
    pending = pending.catch(() => {}).then(async () => {
      if (!binding || message.binding !== binding) return { error: "Player não está conectado à sessão." };
      const video = videos().find(item => ids.get(item) === message.videoId);
      if (!video || video.error || !Number.isFinite(video.duration) || video.duration < 600) return { error: "Vídeo não está pronto para sincronizar." };
      try {
        if (message.command === "play") {
          let timer;
          await Promise.race([video.play(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error("Reprodução demorou a iniciar.")), 7000); })]).finally(() => clearTimeout(timer));
        } else if (message.command === "pause") video.pause();
        else if (message.command === "seek" && Number.isFinite(message.time) && message.time >= 0 && message.time <= 604800) video.currentTime = Math.min(message.time, video.duration);
        else if (message.command !== "getStatus") return { error: "Comando inválido." };
        await emit(video); return { ok: true };
      } catch (error) {
        return { error: error.name === "NotAllowedError" ? "Clique no play dentro do vídeo uma vez para liberar a reprodução." : error.message };
      }
    });
    pending.then(respond, () => respond({ error: "Falha no controle do vídeo." })); return true;
  });
  void scan(); setInterval(() => void scan(), 1000);
})();
