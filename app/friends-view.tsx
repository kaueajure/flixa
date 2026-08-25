"use client";

import { useCallback, useEffect, useState } from "react";

export type FriendActivity = {
  id: string;
  tmdb_id: string | null;
  kind: "movie" | "tv";
  title: string;
  poster: string;
  progress: number;
  season: number | null;
  episode: number | null;
  updatedAt: string;
};

type Friend = {
  id: number;
  nome: string;
  username: string;
  activity?: FriendActivity | null;
};

type SearchResult = Friend & { relation: "amigo" | "enviada" | "recebida" | "nenhuma" };

export default function FriendsView({
  username,
  onOpenActivity,
}: {
  username: string;
  onOpenActivity: (activity: FriendActivity) => void;
}) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<Friend[]>([]);
  const [sent, setSent] = useState<Friend[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [activityClock, setActivityClock] = useState(() => Date.now());

  const load = useCallback(async () => {
    const response = await fetch("/api/amigos", { cache: "no-store", credentials: "include" });
    const data = await response.json() as { amigos?: Friend[]; solicitacoes?: Friend[]; enviadas?: Friend[]; erro?: string };
    if (!response.ok) throw new Error(data.erro || "Não foi possível carregar seus amigos.");
    setFriends(Array.isArray(data.amigos) ? data.amigos : []);
    setRequests(Array.isArray(data.solicitacoes) ? data.solicitacoes : []);
    setSent(Array.isArray(data.enviadas) ? data.enviadas : []);
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void load().catch((cause) => active && setError(cause instanceof Error ? cause.message : "Falha ao carregar.")).finally(() => active && setLoading(false));
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setActivityClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const normalized = query.trim().replace(/^@+/, "");
    if (normalized.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/amigos?q=${encodeURIComponent(normalized)}`, { cache: "no-store", credentials: "include", signal: controller.signal })
        .then(async (response) => {
          const data = await response.json() as { resultados?: SearchResult[]; erro?: string };
          if (!response.ok) throw new Error(data.erro || "Busca indisponível.");
          setResults(Array.isArray(data.resultados) ? data.resultados : []);
        })
        .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Busca indisponível."); });
    }, 280);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);

  async function act(action: "request" | "accept" | "reject" | "remove" | "cancel", friend: Friend) {
    setBusyId(friend.id);
    setError("");
    try {
      const response = await fetch("/api/amigos", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, username: friend.username, userId: friend.id }),
      });
      const data = await response.json() as { erro?: string };
      if (!response.ok) throw new Error(data.erro || "Não foi possível atualizar a amizade.");
      await load();
      setResults((current) => current.map((item) => item.id === friend.id
        ? { ...item, relation: action === "request" ? "enviada" : action === "accept" ? "amigo" : "nenhuma" }
        : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a amizade.");
    } finally {
      setBusyId(null);
    }
  }

  function activityLabel(activity: FriendActivity) {
    const normalized = activity.updatedAt.includes("T") ? activity.updatedAt : `${activity.updatedAt.replace(" ", "T")}Z`;
    const age = activityClock - Date.parse(normalized);
    return Number.isFinite(age) && age >= 0 && age < 5 * 60_000 ? "Assistindo agora" : "Assistiu recentemente";
  }

  return (
    <section className="list-view friends-view" id="amigos">
      <div className="friends-hero">
        <div>
          <p className="eyebrow">Sua comunidade</p>
          <h1>Amigos</h1>
          <p>Encontre pessoas pelo username e veja o que seus amigos estão assistindo.</p>
        </div>
        <div className="friends-own-username"><span>Seu perfil</span><strong>@{username}</strong></div>
      </div>

      <div className="friends-search">
        <label htmlFor="friend-search">Encontrar amigos</label>
        <div><b aria-hidden="true">@</b><input id="friend-search" value={query} onChange={(event) => {
          const next = event.target.value.toLowerCase().replace(/[^a-z0-9._@]/g, "").slice(0, 21);
          setQuery(next);
          if (next.trim().replace(/^@+/, "").length < 2) setResults([]);
        }} placeholder="buscar.username" /></div>
        {query.trim().replace(/^@+/, "").length >= 2 ? (
          <div className="friends-search-results">
            {results.length ? results.map((person) => (
              <article key={person.id}>
                <span className="friend-avatar">{person.nome.slice(0, 1).toUpperCase()}</span>
                <div><strong>{person.nome}</strong><small>@{person.username}</small></div>
                {person.relation === "nenhuma" ? <button disabled={busyId === person.id} onClick={() => void act("request", person)}>Adicionar</button> : null}
                {person.relation === "recebida" ? <button disabled={busyId === person.id} onClick={() => void act("accept", person)}>Aceitar</button> : null}
                {person.relation === "enviada" ? <em>Solicitação enviada</em> : null}
                {person.relation === "amigo" ? <em>Amigo</em> : null}
              </article>
            )) : <p>Nenhum usuário encontrado.</p>}
          </div>
        ) : null}
      </div>

      {error ? <p className="friends-error" role="status">{error}</p> : null}

      {requests.length ? (
        <section className="friend-section">
          <div className="friend-section-title"><h2>Solicitações</h2><span>{requests.length}</span></div>
          <div className="friend-request-grid">{requests.map((person) => (
            <article className="friend-request-card" key={person.id}>
              <span className="friend-avatar">{person.nome.slice(0, 1).toUpperCase()}</span>
              <div><strong>{person.nome}</strong><small>@{person.username}</small></div>
              <button disabled={busyId === person.id} onClick={() => void act("accept", person)}>Aceitar</button>
              <button className="is-muted" disabled={busyId === person.id} onClick={() => void act("reject", person)}>Recusar</button>
            </article>
          ))}</div>
        </section>
      ) : null}

      <section className="friend-section">
        <div className="friend-section-title"><h2>Seus amigos</h2><span>{friends.length}</span></div>
        {loading ? <div className="friends-empty">Carregando amigos…</div> : friends.length ? (
          <div className="friend-grid">{friends.map((friend) => (
            <article className="friend-card" key={friend.id}>
              <header><span className="friend-avatar">{friend.nome.slice(0, 1).toUpperCase()}</span><div><strong>{friend.nome}</strong><small>@{friend.username}</small></div></header>
              {friend.activity ? (
                <button className="friend-activity" onClick={() => onOpenActivity(friend.activity!)}>
                  {friend.activity.poster ? <img src={friend.activity.poster} alt="" /> : <span />}
                  <div><small className={activityLabel(friend.activity) === "Assistindo agora" ? "is-live" : ""}>{activityLabel(friend.activity)}</small><strong>{friend.activity.title}</strong><em>{friend.activity.kind === "tv" && friend.activity.season && friend.activity.episode ? `T${friend.activity.season} E${friend.activity.episode} · ` : ""}{Math.round(friend.activity.progress)}%</em></div>
                </button>
              ) : <p className="friend-no-activity">Nenhuma atividade recente.</p>}
              <button className="friend-remove" disabled={busyId === friend.id} onClick={() => void act("remove", friend)}>Remover amizade</button>
            </article>
          ))}</div>
        ) : <div className="friends-empty"><strong>Sua lista de amigos está vazia</strong><span>Pesquise pelo username para adicionar alguém.</span></div>}
      </section>

      {sent.length ? <p className="friends-sent">{sent.length} solicitação{sent.length === 1 ? "" : "ões"} aguardando resposta.</p> : null}
    </section>
  );
}
