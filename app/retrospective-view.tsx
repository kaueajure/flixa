"use client";

import { useEffect, useState } from "react";

type Retrospective = {
  mode: "month" | "year";
  periodLabel: string;
  minutes: number;
  realMinutes: number;
  completedTitles: number;
  favoriteGenre: string | null;
  favoriteDecade: string | null;
  marathon: { date: string; minutes: number } | null;
  bestFriend: { name: string; username: string; compatibility: number } | null;
  rouletteDiscovery: { title: string; poster: string | null; genre: string | null } | null;
  hasEstimatedData: boolean;
};

function timeLabel(minutes: number) {
  const hours = Math.floor(minutes / 60); const rest = minutes % 60;
  return hours ? `${hours}h ${rest ? `${rest}min` : ""}`.trim() : `${minutes}min`;
}

export default function RetrospectiveView({ name }: { name: string }) {
  const [mode, setMode] = useState<"month" | "year">("month");
  const [data, setData] = useState<Retrospective | null>(null);
  const [loading, setLoading] = useState(true);
  const [shared, setShared] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/retrospectiva?mode=${mode}`, { cache: "no-store", credentials: "include", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => setData(payload?.retrospectiva || null))
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [mode]);

  function changeMode(next: "month" | "year") {
    if (next === mode) return;
    setLoading(true);
    setMode(next);
  }

  async function share() {
    if (!data) return;
    const text = `Minha Retrospectiva Flixa · ${data.periodLabel}\n${timeLabel(data.minutes)} assistidos · ${data.completedTitles} concluídos${data.favoriteGenre ? ` · ${data.favoriteGenre}` : ""}`;
    if (navigator.share) await navigator.share({ title: "Minha Retrospectiva Flixa", text }).catch(() => null);
    else await navigator.clipboard.writeText(text);
    setShared(true); window.setTimeout(() => setShared(false), 1800);
  }

  function downloadCard() {
    if (!data) return;
    const canvas = document.createElement("canvas"); canvas.width = 1080; canvas.height = 1350;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const gradient = ctx.createLinearGradient(0, 0, 1080, 1350); gradient.addColorStop(0, "#24070b"); gradient.addColorStop(.45, "#0c0c10"); gradient.addColorStop(1, "#050506");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = "#e50914"; ctx.fillRect(72, 72, 12, 1206);
    ctx.fillStyle = "#fff"; ctx.font = "900 72px system-ui"; ctx.fillText("FLIXA", 125, 175);
    ctx.fillStyle = "#a7a7ad"; ctx.font = "600 32px system-ui"; ctx.fillText(`RETROSPECTIVA · ${data.periodLabel.toUpperCase()}`, 125, 245);
    ctx.fillStyle = "#fff"; ctx.font = "800 52px system-ui"; ctx.fillText(name.split(/\s+/)[0], 125, 350);
    ctx.font = "900 128px system-ui"; ctx.fillText(timeLabel(data.minutes), 125, 560);
    ctx.fillStyle = "#b7b7bd"; ctx.font = "500 34px system-ui"; ctx.fillText("tempo aproximado assistido", 125, 615);
    const stats = [["TÍTULOS CONCLUÍDOS", String(data.completedTitles)], ["GÊNERO FAVORITO", data.favoriteGenre || "Descobrindo"], ["DÉCADA FAVORITA", data.favoriteDecade || "Variada"], ["MAIOR MARATONA", data.marathon ? timeLabel(data.marathon.minutes) : "Sem dados"]];
    stats.forEach(([label, value], index) => { const y = 770 + index * 125; ctx.fillStyle = "#777780"; ctx.font = "700 24px system-ui"; ctx.fillText(label, 125, y); ctx.fillStyle = "#fff"; ctx.font = "800 42px system-ui"; ctx.fillText(value, 125, y + 52); });
    ctx.fillStyle = "#777780"; ctx.font = "500 23px system-ui"; ctx.fillText("flixa.run · dados reais e estimados identificados", 125, 1260);
    const link = document.createElement("a"); link.download = `flixa-retrospectiva-${data.mode}.png`; link.href = canvas.toDataURL("image/png"); link.click();
  }

  return <section className="retro-view" id="retrospectiva">
    <header className="retro-hero"><div><p className="eyebrow">Sua história no Flixa</p><h1>Retrospectiva</h1><p>Um retrato honesto do que você descobriu e assistiu.</p></div><div className="retro-switch"><button className={mode === "month" ? "is-active" : ""} onClick={() => changeMode("month")}>Este mês</button><button className={mode === "year" ? "is-active" : ""} onClick={() => changeMode("year")}>Este ano</button></div></header>
    {loading ? <div className="retro-empty">Preparando sua retrospectiva…</div> : !data || data.minutes === 0 ? <div className="retro-empty"><strong>Sua história está começando</strong><span>O tempo assistido a partir de agora aparecerá aqui, sem reaproveitar o progresso impreciso antigo.</span></div> : <>
      <div className="retro-card">
        <div className="retro-card-brand"><span>FLIXA</span><small>{data.periodLabel}</small></div>
        <p>Tempo aproximado assistido</p><strong className="retro-time">{timeLabel(data.minutes)}</strong>
        {data.hasEstimatedData ? <small className="retro-accuracy">{timeLabel(data.realMinutes)} confirmados por eventos reais · restante estimado</small> : <small className="retro-accuracy is-real">Progresso confirmado pelo player</small>}
        <div className="retro-grid">
          <article><small>Concluídos</small><strong>{data.completedTitles}</strong><span>títulos</span></article>
          <article><small>Seu gênero</small><strong>{data.favoriteGenre || "Explorador"}</strong><span>mais presente</span></article>
          <article><small>Sua década</small><strong>{data.favoriteDecade || "Variada"}</strong><span>mais assistida</span></article>
          <article><small>Maior maratona</small><strong>{data.marathon ? timeLabel(data.marathon.minutes) : "—"}</strong><span>{data.marathon ? new Date(`${data.marathon.date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "sem dados"}</span></article>
        </div>
        <div className="retro-highlights">
          <article><span>♥</span><div><small>Maior compatibilidade</small><strong>{data.bestFriend ? `${data.bestFriend.name} · ${data.bestFriend.compatibility}%` : "Convide amigos para comparar"}</strong></div></article>
          <article><span>✦</span><div><small>Descoberta da roleta</small><strong>{data.rouletteDiscovery?.title || "Gire o Surpreenda-me"}</strong></div></article>
        </div>
      </div>
      <div className="retro-actions"><button className="primary-action" onClick={() => void share()}>{shared ? "Compartilhado!" : "Compartilhar resumo"}</button><button className="secondary-action" onClick={downloadCard}>Baixar cartão</button></div>
    </>}
  </section>;
}
