const records = new Map();
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type !== "FLIXA_AUDIT_RECORD" || !sender.tab) return;
  const frames = records.get(sender.tab.id) || new Map();
  frames.set(sender.frameId, { ...message.record, frameId: sender.frameId, receivedAt: Date.now() });
  records.set(sender.tab.id, frames);
});
// Accessible only through the debugger in the dedicated test profile, never through a web page.
globalThis.flixaAudit = {
  records: (tabId) => Array.from(records.get(tabId)?.values() || []),
  tabs: async () => chrome.tabs.query({}),
  command: async (tabId, frameId, command, args = {}) => chrome.tabs.sendMessage(tabId, { type: "FLIXA_AUDIT_COMMAND", command, ...args }, { frameId }),
  cleanup: (tabId) => records.delete(tabId),
};
