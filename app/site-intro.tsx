"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const INTRO_DURATION_MS = 9_200;

export default function SiteIntro({ name }: { name: string }) {
  const finishingRef = useRef(false);
  const [visible, setVisible] = useState(false);
  const [started, setStarted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const displayName = name.trim().split(/\s+/)[0] || "Cinéfilo";
  const brandLetters = "FLIXA".split("");

  const finish = useCallback(() => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setLeaving(true);
    window.setTimeout(() => setVisible(false), 780);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("welcome") !== "1") return;
    url.searchParams.delete("welcome");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);

    let animationFrame = 0;
    const showFrame = window.requestAnimationFrame(() => {
      setVisible(true);
      animationFrame = window.requestAnimationFrame(() => setStarted(true));
    });
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finishTimer = window.setTimeout(finish, reducedMotion ? 2_200 : INTRO_DURATION_MS);
    return () => {
      window.cancelAnimationFrame(showFrame);
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(finishTimer);
    };
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

  return (
    <div
      className={`site-intro ${started ? "is-started" : ""} ${leaving ? "is-leaving" : ""}`}
      role="dialog"
      aria-label={`Seja bem-vindo ao Flixa, ${displayName}`}
      aria-modal="true"
    >
      <div className="site-intro-aurora" aria-hidden="true" />
      <div className="site-intro-grid" aria-hidden="true" />
      <div className="site-intro-orbits" aria-hidden="true">
        <i /><i /><i />
      </div>
      <div className="site-intro-flare" aria-hidden="true" />

      <div className="site-intro-scene">
        <div className="site-intro-brand" data-text="FLIXA" aria-label="Flixa">
          {brandLetters.map((letter, index) => (
            <span key={letter} style={{ "--letter-index": index } as React.CSSProperties} aria-hidden="true">
              {letter}
            </span>
          ))}
        </div>

        <div className="site-intro-greeting">
          <p className="site-intro-kicker"><i aria-hidden="true" /> Sessão reconhecida</p>
          <h1>
            <span className="site-intro-welcome">Seja bem-vindo,</span>
            <span className="site-intro-name" data-text={displayName}>{displayName}</span>
          </h1>
          <p className="site-intro-tagline">A próxima história começa com você.</p>
        </div>

        <div className="site-intro-progress" aria-hidden="true">
          <span><i /></span>
          <small>Preparando sua experiência</small>
        </div>
      </div>

      <button className="site-intro-skip" type="button" onClick={finish}>
        Entrar agora <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
