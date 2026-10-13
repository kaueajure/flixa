(() => {
  if (globalThis.flixaGroupBridge) return;
  globalThis.flixaGroupBridge = true;
  const channels = new Set(); let binding = ""; let channel = ""; let sourceUrl = "";
  const send = payload => window.postMessage({ type: "flixa-group:extension", ...payload }, location.origin);
  function target() {
    if (!binding) return;
    const iframe = document.querySelector("iframe[data-flixa-group-player]");
    if (iframe?.src === sourceUrl) iframe.contentWindow?.postMessage({ type: "FLIXA_GROUP_TARGET", binding }, "*");
  }
  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.type !== "flixa-group:site") return;
    const data = event.data;
    if (typeof data.channel !== "string" || data.channel.length > 100 || !["ping", "bind", "command", "release"].includes(data.action)) return;
    if (data.action === "bind") {
      const iframe = document.querySelector("iframe[data-flixa-group-player]");
      if (!iframe || iframe.src !== data.sourceUrl) return;
    }
    channels.add(data.channel);
    void chrome.runtime.sendMessage({ ...data, type: "FLIXA_GROUP_SITE" }).then(response => {
      if (data.action === "bind" && response.binding) { binding = response.binding; channel = data.channel; sourceUrl = data.sourceUrl; target(); }
      if (data.action === "release" && channel === data.channel) { binding = ""; channel = ""; }
      send({ kind: "response", channel: data.channel, requestId: data.requestId, action: data.action, ...response });
    }).catch(() => send({ kind: "response", channel: data.channel, requestId: data.requestId, error: "Extensão desconectada. Recarregue a página." }));
  });
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type !== "FLIXA_GROUP_EVENT" || !channels.has(message.channel) || message.sourceUrl !== sourceUrl) return;
    send({ ...message, type: "flixa-group:extension" });
  });
  setInterval(target, 1500);
})();
