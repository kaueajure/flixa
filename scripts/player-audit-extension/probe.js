(() => {
  const roots = () => {
    const list = [document];
    for (let index = 0; index < list.length && index < 80; index++) {
      for (const node of list[index].querySelectorAll("*")) if (node.shadowRoot) list.push(node.shadowRoot);
    }
    return list;
  };
  const query = (selector) => roots().flatMap((root) => Array.from(root.querySelectorAll(selector)));
  const cleanUrl = (value) => {
    try { const url = new URL(value, location.href); return ["http:", "https:"].includes(url.protocol) ? `${url.origin}${url.pathname}` : url.href; } catch { return ""; }
  };
  const snapshot = (video) => ({
    paused: video.paused, time: video.currentTime, duration: Number.isFinite(video.duration) ? video.duration : null,
    ready: video.readyState, network: video.networkState, error: video.error ? { code: video.error.code, message: video.error.message?.slice(0, 180) } : null,
    muted: video.muted, tracks: Array.from(video.audioTracks || [], (track) => ({ language: track.language, label: track.label, enabled: track.enabled })),
  });
  const clickTargets = () => query("button,[role=button],input[type=button],[onclick],a,video").map((node) => {
    const rect = node.getBoundingClientRect();
    return { label: `${node.getAttribute("aria-label") || ""} ${node.getAttribute("title") || ""} ${node.textContent || ""} ${node.getAttribute("value") || ""}`.trim().replace(/\s+/g, " ").slice(0, 120), tag: node.tagName, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: rect.width, height: rect.height };
  }).filter((node) => node.width > 0 && node.height > 0);
  const collect = () => ({
    url: cleanUrl(location.href), title: document.title, text: document.body?.innerText?.slice(0, 1800) || "",
    videos: query("video").map(snapshot), clickTargets: clickTargets().slice(0, 50),
    scripts: Array.from(document.scripts, (script) => cleanUrl(script.src)).filter(Boolean).slice(0, 30),
    iframes: query("iframe").map((frame) => cleanUrl(frame.src)).slice(0, 20),
  });
  const emit = () => { try { chrome.runtime.sendMessage({ type: "FLIXA_AUDIT_RECORD", record: collect() }).catch(() => {}); } catch { /* Tab is being closed. */ } };
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== "FLIXA_AUDIT_COMMAND") return;
    (async () => {
      if (message.command === "snapshot") return collect();
      const video = query("video")[message.videoIndex || 0];
      if (!video) return { error: "video_not_found" };
      const before = snapshot(video);
      try {
        if (message.command === "play") {
          if (message.muted === true) video.muted = true;
          await Promise.race([video.play(), new Promise((_, reject) => setTimeout(() => reject(Error("play_timeout")), 6000))]);
        } else if (message.command === "pause") video.pause();
        else if (message.command === "seek") video.currentTime = message.time;
        else return { error: "unknown_command" };
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { before, after: snapshot(video) };
      } catch (error) { return { before, after: snapshot(video), error: `${error.name}: ${error.message}` }; }
    })().then(sendResponse, (error) => sendResponse({ error: String(error) }));
    return true;
  });
  emit();
  setInterval(emit, 1500);
})();
