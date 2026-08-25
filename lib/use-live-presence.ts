"use client";

import { useEffect } from "react";

const PRESENCE_HEARTBEAT_MS = 25_000;
let documentClientId: string | null = null;

function getDocumentClientId() {
  if (documentClientId) return documentClientId;
  documentClientId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return documentClientId;
}

/** Mantém presença somente enquanto esta página autenticada está realmente visível. */
export function useLivePresence(enabled: boolean, area: "app" | "admin" | "settings") {
  useEffect(() => {
    if (!enabled) return;
    const clientId = getDocumentClientId();
    let mounted = true;

    const heartbeat = () => {
      if (!mounted || document.visibilityState !== "visible") return;
      void fetch("/api/auth/presence", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, area, state: "online" }),
      }).catch(() => null);
    };

    const disconnect = () => {
      const body = JSON.stringify({ clientId, area, state: "offline" });
      if (typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon("/api/auth/presence", new Blob([body], { type: "application/json" }));
        return;
      }
      void fetch("/api/auth/presence", {
        method: "POST",
        credentials: "include",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body,
      }).catch(() => null);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") heartbeat();
      else disconnect();
    };

    heartbeat();
    const interval = window.setInterval(heartbeat, PRESENCE_HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", disconnect);
    return () => {
      mounted = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", disconnect);
      disconnect();
    };
  }, [area, enabled]);
}
