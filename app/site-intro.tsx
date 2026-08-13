"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const INTRO_SESSION_KEY = "flixa-intro-seen-v1";

export default function SiteIntro() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const finishingRef = useRef(false);
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(true);

  const finish = useCallback(() => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    try {
      window.sessionStorage.setItem(INTRO_SESSION_KEY, "1");
    } catch {
      // A abertura continua funcionando mesmo com o armazenamento bloqueado.
    }
    setLeaving(true);
    window.setTimeout(() => setVisible(false), 700);
  }, []);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(INTRO_SESSION_KEY) === "1") {
        setVisible(false);
        return;
      }
    } catch {
      // Sem armazenamento, mostramos a abertura normalmente.
    }

    const safetyTimer = window.setTimeout(finish, 30000);
    return () => window.clearTimeout(safetyTimer);
  }, [finish]);

  useEffect(() => {
    if (!visible) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [visible]);

  if (!visible) return null;

  function toggleSound() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    void video.play().catch(() => undefined);
  }

  return (
    <div
      className={`site-intro ${ready ? "is-ready" : ""} ${leaving ? "is-leaving" : ""}`}
      role="dialog"
      aria-label="Abertura Flixa"
      aria-modal="true"
    >
      <video
        ref={videoRef}
        className="site-intro-video"
        src="/intro.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        poster="/logo.png"
        onCanPlay={() => setReady(true)}
        onEnded={finish}
        onError={finish}
      />
      <div className="site-intro-vignette" aria-hidden="true" />
      <div className="site-intro-loading" aria-hidden={ready}>
        <img src="/logo.png" alt="" />
        <span />
      </div>
      <div className="site-intro-actions">
        <button type="button" onClick={toggleSound} aria-label={muted ? "Ativar som" : "Desativar som"}>
          <span aria-hidden="true">{muted ? "Som desligado" : "Som ligado"}</span>
        </button>
        <button type="button" onClick={finish}>Pular abertura</button>
      </div>
    </div>
  );
}
