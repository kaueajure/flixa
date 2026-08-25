"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ProfileAvatar from "./profile-avatar";

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
  avatarId?: string | null;
  activity?: FriendActivity | null;
  unreadRecommendations?: number;
};

type CatalogTitle = {
  id: string;
  tmdb_id?: string;
  kind: "movie" | "tv";
  title: string;
  poster: string;
  backdrop?: string;
  year?: number;
};

type Recommendation = {
  id: number;
  mine: boolean;
  titleKey: string;
  tmdb_id: string | null;
  imdb_id: string | null;
  kind: "movie" | "tv";
  title: string;
  poster: string;
  backdrop: string;
  year: number | null;
  sentAt: string;
  seen: boolean;
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
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recommendationQuery, setRecommendationQuery] = useState("");
  const [titleResults, setTitleResults] = useState<CatalogTitle[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [searchingTitles, setSearchingTitles] = useState(false);
  const [sendingTitleId, setSendingTitleId] = useState<string | null>(null);
  const [recommendationError, setRecommendationError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const loadRecommendations = useCallback(async (friendId: number) => {
    const response = await fetch(`/api/amigos/recomendacoes?friendId=${friendId}`, { cache: "no-store", credentials: "include" });
    const data = await response.json() as { recomendacoes?: Recommendation[]; erro?: string };
    if (!response.ok) throw new Error(data.erro || "Não foi possível carregar os envios.");
    setRecommendations(Array.isArray(data.recomendacoes) ? data.recomendacoes : []);
    setFriends((current) => current.map((friend) => friend.id === friendId ? { ...friend, unreadRecommendations: 0 } : friend));
  }, []);

  useEffect(() => {
    if (!selectedFriend) return;
    const timer = window.setTimeout(() => {
      setLoadingRecommendations(true);
      setRecommendationError("");
      void loadRecommendations(selectedFriend.id)
        .catch((cause) => setRecommendationError(cause instanceof Error ? cause.message : "Falha ao carregar."))
        .finally(() => setLoadingRecommendations(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedFriend, loadRecommendations]);

  useEffect(() => {
    const normalized = recommendationQuery.trim();
    if (!selectedFriend || normalized.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchingTitles(true);
      fetch(`/api/movies?q=${encodeURIComponent(normalized)}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          const data = await response.json() as { movies?: CatalogTitle[] };
          if (!response.ok) throw new Error("Busca indisponível.");
          setTitleResults(Array.isArray(data.movies) ? data.movies.slice(0, 8) : []);
        })
        .catch((cause) => { if (!controller.signal.aborted) setRecommendationError(cause instanceof Error ? cause.message : "Busca indisponível."); })
        .finally(() => { if (!controller.signal.aborted) setSearchingTitles(false); });
    }, 320);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [recommendationQuery, selectedFriend]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [recommendations]);

  useEffect(() => {
    if (!selectedFriend) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedFriend(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedFriend]);

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

  function openRecommendations(friend: Friend) {
    setRecommendations([]);
    setRecommendationQuery("");
    setTitleResults([]);
    setRecommendationError("");
    setSelectedFriend(friend);
  }

  async function sendTitle(movie: CatalogTitle) {
    if (!selectedFriend || !movie.tmdb_id) return;
    setSendingTitleId(movie.id);
    setRecommendationError("");
    try {
      const response = await fetch("/api/amigos/recomendacoes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendId: selectedFriend.id, movie }),
      });
      const data = await response.json() as { erro?: string };
      if (!response.ok) throw new Error(data.erro || "Não foi possível enviar este título.");
      await loadRecommendations(selectedFriend.id);
      setRecommendationQuery("");
      setTitleResults([]);
    } catch (cause) {
      setRecommendationError(cause instanceof Error ? cause.message : "Não foi possível enviar este título.");
    } finally {
      setSendingTitleId(null);
    }
  }

  function openRecommendation(item: Recommendation) {
    onOpenActivity({
      id: item.titleKey,
      tmdb_id: item.tmdb_id,
      kind: item.kind,
      title: item.title,
      poster: item.poster,
      progress: 0,
      season: null,
      episode: null,
      updatedAt: item.sentAt,
    });
  }

  function sentLabel(value: string) {
    const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
    return Number.isNaN(date.getTime()) ? "Enviado" : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
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
                <ProfileAvatar avatarId={person.avatarId} name={person.nome} className="friend-avatar" loading="lazy" />
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
              <ProfileAvatar avatarId={person.avatarId} name={person.nome} className="friend-avatar" loading="lazy" />
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
              <header><ProfileAvatar avatarId={friend.avatarId} name={friend.nome} className="friend-avatar" loading="lazy" /><div><strong>{friend.nome}</strong><small>@{friend.username}</small></div></header>
              {friend.activity ? (
                <button className="friend-activity" onClick={() => onOpenActivity(friend.activity!)}>
                  {friend.activity.poster ? <img src={friend.activity.poster} alt="" /> : <span />}
                  <div><small className={activityLabel(friend.activity) === "Assistindo agora" ? "is-live" : ""}>{activityLabel(friend.activity)}</small><strong>{friend.activity.title}</strong><em>{friend.activity.kind === "tv" && friend.activity.season && friend.activity.episode ? `T${friend.activity.season} E${friend.activity.episode} · ` : ""}{Math.round(friend.activity.progress)}%</em></div>
                </button>
              ) : <p className="friend-no-activity">Nenhuma atividade recente.</p>}
              <button className="friend-send-title" type="button" onClick={() => openRecommendations(friend)}>
                <span aria-hidden="true">➤</span>
                Enviar filme
                {friend.unreadRecommendations ? <em>{friend.unreadRecommendations}</em> : null}
              </button>
              <button className="friend-remove" disabled={busyId === friend.id} onClick={() => void act("remove", friend)}>Remover amizade</button>
            </article>
          ))}</div>
        ) : <div className="friends-empty"><strong>Sua lista de amigos está vazia</strong><span>Pesquise pelo username para adicionar alguém.</span></div>}
      </section>

      {sent.length ? <p className="friends-sent">{sent.length} solicitação{sent.length === 1 ? "" : "ões"} aguardando resposta.</p> : null}

      {selectedFriend ? (
        <div className="recommendation-chat-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedFriend(null); }}>
          <section className="recommendation-chat" role="dialog" aria-modal="true" aria-labelledby="recommendation-chat-title">
            <header>
              <ProfileAvatar avatarId={selectedFriend.avatarId} name={selectedFriend.nome} className="friend-avatar" />
              <div><small>Envios de filmes</small><h2 id="recommendation-chat-title">{selectedFriend.nome}</h2></div>
              <button type="button" onClick={() => setSelectedFriend(null)} aria-label="Fechar envios">×</button>
            </header>

            <div className="recommendation-chat-note"><span aria-hidden="true">✦</span> Aqui só entram filmes e séries — sem mensagens de texto.</div>

            <div className="recommendation-messages" aria-live="polite">
              {loadingRecommendations ? <p className="recommendation-empty">Carregando envios…</p> : recommendations.length ? recommendations.map((item) => (
                <article className={item.mine ? "is-mine" : ""} key={item.id}>
                  <small>{item.mine ? "Você enviou" : `${selectedFriend.nome.split(/\s+/)[0]} enviou`}</small>
                  <button type="button" onClick={() => openRecommendation(item)}>
                    {item.poster ? <img src={item.poster} alt="" /> : <span className="recommendation-poster-placeholder">▶</span>}
                    <div><strong>{item.title}</strong><em>{[item.kind === "tv" ? "Série" : "Filme", item.year].filter(Boolean).join(" · ")}</em><b>Abrir título</b></div>
                  </button>
                  <time>{sentLabel(item.sentAt)}{item.mine && item.seen ? " · visto" : ""}</time>
                </article>
              )) : <p className="recommendation-empty"><strong>Nenhum filme enviado ainda.</strong><span>Busque um título abaixo para começar.</span></p>}
              <div ref={messagesEndRef} />
            </div>

            <div className="recommendation-composer">
              <label htmlFor="recommendation-search">Escolher um filme ou série</label>
              <div className="recommendation-search-box"><span aria-hidden="true">⌕</span><input id="recommendation-search" type="search" autoComplete="off" value={recommendationQuery} onChange={(event) => {
                const next = event.target.value.slice(0, 80);
                setRecommendationQuery(next);
                if (next.trim().length < 2) setTitleResults([]);
              }} placeholder={`Buscar para enviar a ${selectedFriend.nome.split(/\s+/)[0]}`} /></div>
              {recommendationError ? <p className="friends-error" role="status">{recommendationError}</p> : null}
              {recommendationQuery.trim().length >= 2 ? (
                <div className="recommendation-results">
                  {searchingTitles ? <p>Buscando no catálogo…</p> : titleResults.length ? titleResults.map((movie) => (
                    <article key={movie.id}>
                      {movie.poster ? <img src={movie.poster} alt="" /> : <span />}
                      <div><strong>{movie.title}</strong><small>{[movie.kind === "tv" ? "Série" : "Filme", movie.year].filter(Boolean).join(" · ")}</small></div>
                      <button type="button" disabled={!movie.tmdb_id || sendingTitleId === movie.id} onClick={() => void sendTitle(movie)}>{sendingTitleId === movie.id ? "Enviando…" : "Enviar"}</button>
                    </article>
                  )) : <p>Nenhum título encontrado.</p>}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
