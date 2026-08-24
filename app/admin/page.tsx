"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type AdminUser = {
  id: number;
  nome: string;
  username?: string | null;
  email: string;
  administrador: boolean;
  criado_em?: string | null;
  atualizado_em?: string | null;
  ultima_atividade?: string | null;
  itens_lista?: number;
  itens_historico?: number;
  itens_progresso?: number;
  sessoes_ativas?: number;
};

type Stats = {
  usuarios: number;
  itens_lista: number;
  itens_historico: number;
  itens_progresso: number;
  administradores: number;
  novos_30_dias: number;
  usuarios_com_progresso: number;
};

type ServerStatus = "unknown" | "online" | "degraded" | "offline";

type ServerIssue = {
  code: string;
  stage: string;
  severity: "warning" | "error";
  message: string;
  evidence?: string;
};

type ServerEndpointCheck = {
  kind: "movie" | "tv";
  status: ServerStatus;
  httpStatus: number | null;
  latencyMs: number;
  message: string;
  finalUrl: string;
  issues: ServerIssue[];
  evidence: {
    verification: "automatic" | "manual";
    playbackConfirmed: boolean;
    confidence: "none" | "low" | "medium" | "high";
    playerSignals: string[];
    iframeUrls: string[];
    mediaUrls: string[];
    mediaProbe: {
      status: "passed" | "failed";
      httpStatus: number | null;
      message: string;
      audioLanguages?: string[];
      hasPortugueseAudio?: boolean | null;
      audioMetadataSource?: "hls" | "dash" | "mp4";
    } | null;
  };
};

type ServerDiagnostic = {
  status: ServerStatus;
  testedAt: string;
  checks: ServerEndpointCheck[];
  audioAudit?: Array<{
    tmdbId: string;
    title: string;
    url: string;
    status: ServerStatus;
    portugueseAudio: "confirmed" | "not-detected" | "unverified";
    message: string;
    check: ServerEndpointCheck;
  }>;
};

type AdminServer = {
  id: string;
  name: string;
  domain: string;
  testUrl: string;
  testTvUrl: string;
  supportsMovie: boolean;
  supportsTv: boolean;
  advertisingProfile: "none-declared" | "minimal-declared" | "unknown";
  watchPartySupport: "full" | "none";
  prioritizesPortugueseAudio: boolean;
  priority: number;
  protectedEmbedCompatible: boolean;
  enabledByDefault: boolean;
  compatibilityMessage?: string;
  blockedReason?: string;
  enabled: boolean;
  disabled_until: string | null;
  last_status: ServerStatus;
  last_http_status: number | null;
  last_latency_ms: number | null;
  last_message: string | null;
  last_diagnostic: ServerDiagnostic | null;
  last_tested_at: string | null;
};

type AdminTab = "usuarios" | "servidores";

type CatalogCheck = {
  status: "online" | "offline";
  tested_at: string;
  total: number;
  valid: number;
  invalid: number;
  problems: Array<{ key: string; title: string; issues: string[] }>;
  rules: string[];
};

function formatDate(value: string | null) {
  if (!value) return "Nunca";
  const parsed = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function statusLabel(status: ServerStatus) {
  if (status === "online") return "Operacional";
  if (status === "degraded") return "Aguardando confirmação";
  if (status === "offline") return "Falhou";
  return "Não testado";
}

function kindLabel(kind: "movie" | "tv") {
  return kind === "movie" ? "Filme" : "Série";
}

const ISSUE_TITLES: Record<string, string> = {
  SANDBOX_COMPATIBILITY_RISK: "Proteção anti-pop-up possivelmente incompatível",
  KNOWN_PROVIDER_ISSUE: "Problema conhecido deste provedor",
  NETWORK_TIMEOUT: "Servidor demorou demais para responder",
  NETWORK_ERROR: "Falha de rede ou domínio",
  HTTP_ERROR: "Endpoint respondeu com erro HTTP",
  ANTI_BOT_CHALLENGE: "CAPTCHA ou proteção anti-bot",
  INVALID_DOCUMENT: "Página de erro ou bloqueio",
  UNEXPECTED_CONTENT_TYPE: "Resposta não é uma página de player",
  EMPTY_DOCUMENT: "Página vazia ou incompleta",
  IFRAME_BLOCKED_X_FRAME_OPTIONS: "Player bloqueia iframe externo",
  IFRAME_BLOCKED_CSP: "Política CSP bloqueia o Flixa",
  NESTED_IFRAME_HTTP_ERROR: "Player interno respondeu com erro HTTP",
  NESTED_IFRAME_BLOCKED_X_FRAME_OPTIONS: "Player interno bloqueia o iframe",
  NESTED_IFRAME_BLOCKED_CSP: "CSP bloqueia o player interno",
  NESTED_IFRAME_INVALID: "Player interno abriu página inválida",
  NESTED_IFRAME_CONTENT_TYPE: "Player interno retornou conteúdo inesperado",
  NESTED_IFRAME_TIMEOUT: "Player interno excedeu o tempo limite",
  NESTED_IFRAME_NETWORK_ERROR: "Falha de rede no player interno",
  PLAYER_NOT_FOUND: "Nenhum player encontrado",
  PLAYER_NOT_CONFIRMED: "Player dinâmico não confirmado",
  WEAK_PLAYER_EVIDENCE: "Player não pôde ser comprovado",
  PLAYBACK_NOT_CONFIRMED: "Player abriu, mas o Play não foi confirmado",
  MEDIA_PROBE_FAILED: "Manifesto, arquivo ou segmento de vídeo falhou",
  MANUAL_PLAYBACK_FAILED: "Reprodução falhou no teste manual",
};

function issueTitle(code: string) {
  return ISSUE_TITLES[code] ?? code.replaceAll("_", " ").toLocaleLowerCase("pt-BR");
}

function ServerDiagnosticDetails({ diagnostic, compact = false }: { diagnostic: ServerDiagnostic | null; compact?: boolean }) {
  if (!diagnostic?.checks?.length) return null;
  return (
    <div className={`server-diagnostic ${compact ? "is-compact" : ""}`}>
      {diagnostic.checks.map((check) => (
        <details key={check.kind} open={!compact && check.status !== "online"}>
          <summary>
            <span className={`server-status is-${check.status}`}><i aria-hidden="true" />{kindLabel(check.kind)}: {statusLabel(check.status)}</span>
            <small>{check.evidence.playbackConfirmed ? "Play confirmado" : `Confiança ${check.evidence.confidence}`}</small>
          </summary>
          <p>{check.message}</p>
          {check.evidence.playerSignals?.length ? <small>Sinais: {check.evidence.playerSignals.join(", ")}</small> : null}
          {check.evidence.mediaProbe ? <small>Mídia: {check.evidence.mediaProbe.message}</small> : null}
          {check.evidence.mediaProbe?.audioLanguages?.length
            ? <small>Idiomas de áudio declarados no manifesto: {check.evidence.mediaProbe.audioLanguages.join(", ")}</small>
            : null}
          {check.issues?.length ? (
            <ul>
              {check.issues.map((item, index) => (
                <li key={`${item.code}:${index}`} className={`is-${item.severity}`}>
                  <strong>{issueTitle(item.code)}</strong> — {item.message}<code>{item.code}</code>{item.evidence ? <small>{item.evidence}</small> : null}
                </li>
              ))}
            </ul>
          ) : <small>Nenhum problema detectado.</small>}
        </details>
      ))}
    </div>
  );
}

async function responseJson<T>(response: Response): Promise<T & { erro?: string }> {
  return (await response.json().catch(() => ({}))) as T & { erro?: string };
}

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<AdminTab>("usuarios");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [usuarios, setUsuarios] = useState<AdminUser[]>([]);
  const [servidores, setServidores] = useState<AdminServer[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [euId, setEuId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testingAll, setTestingAll] = useState(false);
  const [disableMinutes, setDisableMinutes] = useState(360);
  const [modalServer, setModalServer] = useState<AdminServer | null>(null);
  const [modalLoaded, setModalLoaded] = useState(false);
  const [modalKind, setModalKind] = useState<"movie" | "tv">("movie");
  const [catalogChecking, setCatalogChecking] = useState(false);
  const [catalogCheck, setCatalogCheck] = useState<CatalogCheck | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [serverSearch, setServerSearch] = useState("");
  const [serverFilter, setServerFilter] = useState<"all" | ServerStatus | "enabled" | "pt">("all");

  const serverStats = useMemo(() => ({
    online: servidores.filter((server) => server.last_status === "online").length,
    degraded: servidores.filter((server) => server.last_status === "degraded").length,
    offline: servidores.filter((server) => server.last_status === "offline").length,
    enabled: servidores.filter((server) => server.enabled).length,
    ptPriority: servidores.filter((server) => server.prioritizesPortugueseAudio).length,
    ptConfirmed: servidores.filter((server) => server.last_diagnostic?.audioAudit?.every((sample) => sample.portugueseAudio === "confirmed")).length,
  }), [servidores]);

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLocaleLowerCase("pt-BR");
    if (!term) return usuarios;
    return usuarios.filter((user) => `${user.nome} ${user.username ?? ""} ${user.email}`.toLocaleLowerCase("pt-BR").includes(term));
  }, [usuarios, userSearch]);

  const filteredServers = useMemo(() => {
    const term = serverSearch.trim().toLocaleLowerCase("pt-BR");
    return servidores.filter((server) => {
      const matchesSearch = !term || `${server.name} ${server.domain} ${server.id}`.toLocaleLowerCase("pt-BR").includes(term);
      const matchesFilter = serverFilter === "all"
        || (serverFilter === "enabled" ? server.enabled : serverFilter === "pt" ? server.prioritizesPortugueseAudio : server.last_status === serverFilter);
      return matchesSearch && matchesFilter;
    });
  }, [servidores, serverFilter, serverSearch]);

  function handleUnauthorized(status: number) {
    if (status === 401 || status === 403) {
      router.replace("/");
      return true;
    }
    return false;
  }

  async function carregar() {
    setErro("");
    const [usersResponse, serversResponse] = await Promise.all([
      fetch("/api/admin/usuarios", { cache: "no-store", credentials: "include" }),
      fetch("/api/admin/servidores", { cache: "no-store", credentials: "include" }),
    ]);
    if (handleUnauthorized(usersResponse.status) || handleUnauthorized(serversResponse.status)) return;

    const usersData = await responseJson<{ usuarios?: AdminUser[]; estatisticas?: Stats; eu?: { id: number } }>(usersResponse);
    const serversData = await responseJson<{ servidores?: AdminServer[] }>(serversResponse);
    if (!usersResponse.ok) throw new Error(usersData.erro || "Falha ao carregar painel");
    if (!serversResponse.ok) throw new Error(serversData.erro || "Falha ao carregar servidores");

    setUsuarios(Array.isArray(usersData.usuarios) ? usersData.usuarios : []);
    setStats(usersData.estatisticas ?? null);
    setEuId(usersData.eu?.id ?? null);
    setServidores(Array.isArray(serversData.servidores) ? serversData.servidores : []);
  }

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void carregar()
        .catch((error) => {
          if (active) setErro(error instanceof Error ? error.message : "Falha ao carregar");
        })
        .finally(() => {
          if (active) setCarregando(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
    // A carga inicial é intencionalmente executada uma vez por montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!modalServer) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModalServer(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalServer]);

  function mergeServer(next: AdminServer) {
    setServidores((current) => current.map((server) => (server.id === next.id ? next : server)));
    setModalServer((current) => (current?.id === next.id ? { ...current, ...next } : current));
  }

  async function toggleAdmin(user: AdminUser) {
    setBusyId(`user:${user.id}`);
    setErro("");
    try {
      const response = await fetch("/api/admin/usuarios", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, administrador: !user.administrador }),
      });
      const data = await responseJson<Record<string, never>>(response);
      if (!response.ok) throw new Error(data.erro || "Não foi possível atualizar");
      await carregar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao atualizar");
    } finally {
      setBusyId(null);
    }
  }

  async function excluir(user: AdminUser) {
    if (!window.confirm(`Excluir a conta de ${user.nome}?`)) return;
    setBusyId(`user:${user.id}`);
    setErro("");
    try {
      const response = await fetch(`/api/admin/usuarios?id=${user.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await responseJson<Record<string, never>>(response);
      if (!response.ok) throw new Error(data.erro || "Não foi possível excluir");
      await carregar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao excluir");
    } finally {
      setBusyId(null);
    }
  }

  async function setServerEnabled(server: AdminServer, enabled: boolean) {
    setBusyId(`toggle:${server.id}`);
    setErro("");
    try {
      const response = await fetch("/api/admin/servidores", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: server.id,
          enabled,
          minutes: enabled ? null : disableMinutes || null,
        }),
      });
      const data = await responseJson<{ servidor?: AdminServer }>(response);
      if (!response.ok || !data.servidor) throw new Error(data.erro || "Não foi possível atualizar o servidor");
      mergeServer(data.servidor);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao atualizar servidor");
    } finally {
      setBusyId(null);
    }
  }

  async function testarServidor(server: AdminServer) {
    setBusyId(`test:${server.id}`);
    setErro("");
    try {
      const response = await fetch("/api/admin/servidores", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", id: server.id }),
      });
      const data = await responseJson<{ servidores?: AdminServer[] }>(response);
      if (!response.ok || !data.servidores?.[0]) throw new Error(data.erro || "Teste não concluído");
      mergeServer(data.servidores[0]);
      setModalLoaded(false);
      setModalKind("movie");
      setModalServer(data.servidores[0]);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao testar servidor");
    } finally {
      setBusyId(null);
    }
  }

  async function testarTodos() {
    setTestingAll(true);
    setErro("");
    try {
      const batches: string[][] = [];
      for (let index = 0; index < servidores.length; index += 5) {
        batches.push(servidores.slice(index, index + 5).map((server) => server.id));
      }
      const testedBatches: AdminServer[][] = [];
      for (let index = 0; index < batches.length; index += 2) {
        const wave = await Promise.all(batches.slice(index, index + 2).map(async (ids) => {
          const response = await fetch("/api/admin/servidores", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "test", ids }),
          });
          const data = await responseJson<{ servidores?: AdminServer[] }>(response);
          if (!response.ok || !Array.isArray(data.servidores)) throw new Error(data.erro || "Teste em lote não concluído");
          return data.servidores;
        }));
        testedBatches.push(...wave);
      }
      const tested = new Map(testedBatches.flat().map((server) => [server.id, server]));
      setServidores((current) => current.map((server) => tested.get(server.id) ?? server));
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao testar servidores");
    } finally {
      setTestingAll(false);
    }
  }

  async function validarCatalogo() {
    setCatalogChecking(true);
    setErro("");
    try {
      const response = await fetch("/api/admin/catalogo", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await responseJson<CatalogCheck>(response);
      if (!response.ok || !data.status) throw new Error(data.erro || "Validação do catálogo não concluída");
      setCatalogCheck(data);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao validar catálogo");
    } finally {
      setCatalogChecking(false);
    }
  }

  async function confirmarModal(ok: boolean) {
    if (!modalServer) return;
    setBusyId(`confirm:${modalServer.id}`);
    setErro("");
    try {
      const response = await fetch("/api/admin/servidores", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", id: modalServer.id, kind: modalKind, ok }),
      });
      const data = await responseJson<{ servidor?: AdminServer }>(response);
      if (!response.ok || !data.servidor) throw new Error(data.erro || "Confirmação não concluída");
      mergeServer(data.servidor);
      setModalServer(null);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao confirmar teste");
    } finally {
      setBusyId(null);
    }
  }

  if (carregando) {
    return <main className="admin-v4-loading"><span className="admin-v4-loader" /><strong>Preparando o Flixa Control</strong><small>Carregando dados operacionais…</small></main>;
  }

  const modalUrl = modalServer
    ? modalKind === "tv" && modalServer.testTvUrl
      ? modalServer.testTvUrl
      : modalServer.testUrl
    : "";
  const modalCheck = modalServer?.last_diagnostic?.checks.find((check) => check.kind === modalKind) ?? null;
  const healthPercent = servidores.length
    ? Math.round(((serverStats.online + serverStats.degraded * 0.5) / servidores.length) * 100)
    : 0;

  return (
    <main className="admin-v4-shell">
      <aside className="admin-v4-sidebar">
        <div className="admin-v4-brand"><span>F</span><div><strong>Flixa</strong><small>Control center</small></div></div>
        <div className="admin-v4-nav-label">Gerenciamento</div>
        <nav aria-label="Seções administrativas">
          <button type="button" className={tab === "usuarios" ? "is-active" : ""} onClick={() => setTab("usuarios")}><span aria-hidden="true">◎</span><div><strong>Usuários</strong><small>Contas e atividade</small></div><em>{usuarios.length}</em></button>
          <button type="button" className={tab === "servidores" ? "is-active" : ""} onClick={() => setTab("servidores")}><span aria-hidden="true">◈</span><div><strong>Servidores</strong><small>Saúde e reprodução</small></div><em>{servidores.length}</em></button>
        </nav>
        <div className="admin-v4-sidebar-status">
          <div><span className="is-live" /><strong>Sistema operacional</strong></div>
          <p>{serverStats.enabled} de {servidores.length} provedores habilitados.</p>
          <div className="admin-v4-mini-progress"><i style={{ width: `${Math.round((serverStats.enabled / Math.max(servidores.length, 1)) * 100)}%` }} /></div>
        </div>
        <Link className="admin-v4-exit" href="/"><span aria-hidden="true">←</span> Voltar ao Flixa</Link>
      </aside>

      <section className="admin-v4-workspace">
        <header className="admin-v4-topbar">
          <div><small>Administração / {tab === "usuarios" ? "Usuários" : "Servidores"}</small><h1>{tab === "usuarios" ? "Visão de usuários" : "Operação dos servidores"}</h1></div>
          <div className="admin-v4-top-actions"><span className="admin-v4-live"><i /> Ao vivo</span><div className="admin-v4-avatar">A</div></div>
        </header>

        <div className="admin-v4-content">
          {erro ? <div className="admin-v4-alert" role="alert"><span>!</span><p>{erro}</p><button type="button" onClick={() => setErro("")} aria-label="Fechar alerta">×</button></div> : null}

          {tab === "usuarios" ? (
            <>
              <section className="admin-v4-hero admin-v4-user-hero">
                <div className="admin-v4-hero-copy"><span className="admin-v4-kicker">Comunidade Flixa</span><h2>Entenda quem usa a plataforma.</h2><p>Acompanhe crescimento, atividade e consumo sem sair desta tela.</p></div>
                <div className="admin-v4-hero-number"><small>Base total</small><strong>{stats?.usuarios ?? usuarios.length}</strong><span>contas cadastradas</span></div>
              </section>

              <section className="admin-v4-metric-grid" aria-label="Métricas de usuários">
                <article className="is-red"><div><span aria-hidden="true">↗</span><small>Crescimento</small></div><strong>+{stats?.novos_30_dias ?? 0}</strong><p>novos usuários em 30 dias</p></article>
                <article className="is-purple"><div><span aria-hidden="true">◐</span><small>Engajamento</small></div><strong>{stats?.usuarios_com_progresso ?? 0}</strong><p>usuários com reprodução</p></article>
                <article className="is-gold"><div><span aria-hidden="true">★</span><small>Biblioteca</small></div><strong>{stats?.itens_lista ?? 0}</strong><p>títulos salvos em listas</p></article>
                <article className="is-blue"><div><span aria-hidden="true">●</span><small>Histórico</small></div><strong>{stats?.itens_historico ?? 0}</strong><p>títulos reproduzidos</p></article>
              </section>

              <section className="admin-v4-panel">
                <header className="admin-v4-panel-head"><div><span className="admin-v4-kicker">Diretório</span><h2>Todos os usuários</h2><p>{filteredUsers.length} resultados encontrados</p></div><label className="admin-v4-search"><span aria-hidden="true">⌕</span><input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Buscar por nome, username ou e-mail" /></label></header>
                <div className="admin-v4-user-list">
                  <div className="admin-v4-user-labels"><span>Perfil</span><span>Consumo</span><span>Atividade</span><span>Acesso</span><span>Ações</span></div>
                  {filteredUsers.map((user) => {
                    const isSelf = user.id === euId;
                    return (
                      <article className="admin-v4-user-row" key={user.id}>
                        <div className="admin-v4-person"><span>{user.nome.slice(0, 2).toUpperCase()}</span><div><strong>{user.nome}</strong><small>{user.username ? `@${user.username}` : "Sem username"}</small><p>{user.email}</p></div></div>
                        <div className="admin-v4-consumption"><span><strong>{user.itens_lista ?? 0}</strong><small>na lista</small></span><span><strong>{user.itens_historico ?? 0}</strong><small>assistidos</small></span><span><strong>{user.itens_progresso ?? 0}</strong><small>em curso</small></span></div>
                        <div className="admin-v4-activity"><strong>{formatDate(user.ultima_atividade ?? null)}</strong><small>Entrou em {formatDate(user.criado_em ?? null)}</small></div>
                        <div className="admin-v4-access"><span className={(user.sessoes_ativas ?? 0) > 0 ? "is-online" : "is-idle"}><i />{(user.sessoes_ativas ?? 0) > 0 ? "Online" : "Offline"}</span><small>{user.administrador ? "Administrador" : "Membro"}</small></div>
                        <div className="admin-v4-row-actions"><button type="button" disabled={busyId === `user:${user.id}` || (isSelf && user.administrador)} onClick={() => void toggleAdmin(user)}>{user.administrador ? "Remover admin" : "Promover"}</button><button type="button" className="is-danger" disabled={busyId === `user:${user.id}` || isSelf} onClick={() => void excluir(user)} aria-label={`Excluir ${user.nome}`}>×</button></div>
                      </article>
                    );
                  })}
                  {!filteredUsers.length ? <div className="admin-v4-empty"><span>⌕</span><strong>Nenhum usuário encontrado</strong><p>Tente outro nome, username ou e-mail.</p></div> : null}
                </div>
              </section>
            </>
          ) : (
            <>
              <section className="admin-v4-server-overview">
                <article className="admin-v4-health-card"><div className="admin-v4-health-ring" style={{ "--health": `${healthPercent * 3.6}deg` } as React.CSSProperties}><span><strong>{healthPercent}%</strong><small>saúde geral</small></span></div><div><span className="admin-v4-kicker">Infraestrutura</span><h2>Visão da rede</h2><p>Estado consolidado dos provedores e auditorias de reprodução.</p><div className="admin-v4-health-legend"><span><i className="is-online" />{serverStats.online} online</span><span><i className="is-warning" />{serverStats.degraded} instáveis</span><span><i className="is-offline" />{serverStats.offline} offline</span></div></div></article>
                <div className="admin-v4-server-metrics"><article><span>Provedores</span><strong>{servidores.length}</strong><small>{serverStats.enabled} habilitados</small></article><article><span>Foco PT-BR</span><strong>{serverStats.ptPriority}</strong><small>{serverStats.ptConfirmed} com auditoria 3/3</small></article><article><span>Em progresso</span><strong>{stats?.itens_progresso ?? 0}</strong><small>reproduções salvas</small></article><article><span>Latência média</span><strong>{Math.round(servidores.reduce((sum, server) => sum + (server.last_latency_ms ?? 0), 0) / Math.max(servidores.filter((server) => server.last_latency_ms != null).length, 1))}<em>ms</em></strong><small>entre testes registrados</small></article></div>
              </section>

              <section className={`admin-v4-catalog ${catalogCheck ? `is-${catalogCheck.status}` : ""}`}><div className="admin-v4-catalog-icon"><span>✓</span></div><div><span className="admin-v4-kicker">Qualidade do catálogo</span><h3>{catalogCheck ? (catalogCheck.status === "online" ? "Catálogo validado" : "Foram encontrados problemas") : "Validação pendente"}</h3><p>{catalogCheck ? `${catalogCheck.valid}/${catalogCheck.total} títulos válidos nos provedores ativos` : "Verifique IDs, imagens, duplicidades e disponibilidade dos títulos."}</p>{catalogCheck?.problems.length ? <small>{catalogCheck.problems.slice(0, 2).map((problem) => `${problem.title}: ${problem.issues.join(", ")}`).join(" · ")}</small> : null}</div><button type="button" disabled={catalogChecking} onClick={() => void validarCatalogo()}>{catalogChecking ? "Validando…" : "Executar validação"}</button></section>

              <section className="admin-v4-panel admin-v4-provider-panel">
                <header className="admin-v4-panel-head admin-v4-provider-head"><div><span className="admin-v4-kicker">Provedores</span><h2>Servidores de reprodução</h2><p>{filteredServers.length} de {servidores.length} exibidos</p></div><div className="admin-v4-provider-tools"><label className="admin-v4-search"><span aria-hidden="true">⌕</span><input value={serverSearch} onChange={(event) => setServerSearch(event.target.value)} placeholder="Buscar servidor" /></label><select aria-label="Filtrar servidores" value={serverFilter} onChange={(event) => setServerFilter(event.target.value as typeof serverFilter)}><option value="all">Todos os estados</option><option value="enabled">Habilitados</option><option value="pt">Foco PT-BR</option><option value="online">Online</option><option value="degraded">Instáveis</option><option value="offline">Offline</option><option value="unknown">Não testados</option></select><button type="button" className="admin-v4-primary" disabled={testingAll} onClick={() => void testarTodos()}>{testingAll ? "Testando…" : "Testar todos"}</button></div></header>
                <div className="admin-v4-disable-window"><span>Ao desativar um servidor, manter indisponível por</span><select value={disableMinutes} onChange={(event) => setDisableMinutes(Number(event.target.value))}><option value={60}>1 hora</option><option value={360}>6 horas</option><option value={1440}>24 horas</option><option value={0}>tempo indeterminado</option></select></div>
                <div className="admin-v4-provider-grid">
                  {filteredServers.map((server) => {
                    const samples = server.last_diagnostic?.audioAudit ?? [];
                    const confirmed = samples.filter((sample) => sample.portugueseAudio === "confirmed").length;
                    return (
                      <article className={`admin-v4-provider-card is-${server.last_status} ${!server.enabled ? "is-disabled" : ""}`} key={server.id}>
                        <header><div className="admin-v4-provider-rank">{String(server.priority + 1).padStart(2, "0")}</div><div className="admin-v4-provider-name"><div><h3>{server.name}</h3><span className={`admin-v4-status is-${server.last_status}`}><i />{statusLabel(server.last_status)}</span></div><p>{server.domain}</p></div><button type="button" className={`admin-v4-switch ${server.enabled ? "is-on" : ""}`} disabled={busyId === `toggle:${server.id}`} onClick={() => void setServerEnabled(server, !server.enabled)} aria-label={server.enabled ? `Desativar ${server.name}` : `Habilitar ${server.name}`}><i /></button></header>
                        <div className="admin-v4-provider-tags"><span>{server.supportsMovie ? "Filmes" : ""}{server.supportsMovie && server.supportsTv ? " + " : ""}{server.supportsTv ? "Séries" : ""}</span>{server.prioritizesPortugueseAudio ? <span className="is-pt">PT-BR prioritário</span> : <span>Idioma variável</span>}{server.advertisingProfile === "none-declared" ? <span className="is-clean">Sem ads declarado</span> : null}</div>
                        <div className="admin-v4-audit-head"><div><strong>Auditoria de áudio</strong><small>3 filmes de referência</small></div><span className={confirmed === 3 ? "is-complete" : ""}>{confirmed}/3 PT-BR</span></div>
                        <div className="admin-v4-audit-list">{samples.length ? samples.map((sample) => <div key={sample.tmdbId}><i className={`is-${sample.portugueseAudio}`} /><span><strong>{sample.title}</strong><small>{sample.portugueseAudio === "confirmed" ? "Português confirmado" : sample.portugueseAudio === "not-detected" ? "Português não encontrado" : "Idioma não verificável"}</small></span><em className={`is-${sample.status}`}>{sample.status === "online" ? "OK" : sample.status === "offline" ? "Falha" : "Revisar"}</em></div>) : <div className="is-empty"><span><strong>Auditoria pendente</strong><small>Execute o teste deste servidor.</small></span></div>}</div>
                        {server.compatibilityMessage || server.blockedReason ? <p className="admin-v4-provider-warning"><span>!</span>{server.blockedReason || server.compatibilityMessage}</p> : null}
                        <div className="admin-v4-provider-diagnostic"><div><span>Último teste</span><strong>{formatDate(server.last_tested_at)}</strong></div><div><span>Latência</span><strong>{server.last_latency_ms != null ? `${server.last_latency_ms} ms` : "—"}</strong></div><div><span>HTTP</span><strong>{server.last_http_status ?? "—"}</strong></div></div>
                        <ServerDiagnosticDetails diagnostic={server.last_diagnostic} compact />
                        <footer><button type="button" className="admin-v4-test" disabled={busyId === `test:${server.id}` || testingAll} onClick={() => void testarServidor(server)}><span aria-hidden="true">▷</span>{busyId === `test:${server.id}` ? "Testando servidor…" : "Testar e abrir player"}</button><span className={server.enabled ? "is-enabled" : "is-disabled"}><i />{server.enabled ? "Em uso" : server.disabled_until ? `Até ${formatDate(server.disabled_until)}` : "Desativado"}</span></footer>
                      </article>
                    );
                  })}
                  {!filteredServers.length ? <div className="admin-v4-empty"><span>◈</span><strong>Nenhum servidor encontrado</strong><p>Altere a busca ou o filtro selecionado.</p></div> : null}
                </div>
              </section>
            </>
          )}
        </div>
      </section>

      {modalServer ? (
        <div className="server-test-modal" role="dialog" aria-modal="true" aria-label={`Teste de ${modalServer.name}`}>
          <div className="server-test-dialog">
            <header><div><p className="eyebrow">Teste visual protegido</p><h2>{modalServer.name}</h2><span>{modalUrl}</span></div><button type="button" aria-label="Fechar teste" onClick={() => setModalServer(null)}>×</button></header>
            {modalServer.supportsTv && modalServer.testTvUrl ? (
              <div className="server-test-kind" role="tablist" aria-label="Tipo de conteúdo para testar">
                <button type="button" role="tab" aria-selected={modalKind === "movie"} className={modalKind === "movie" ? "is-active" : ""} onClick={() => { setModalLoaded(false); setModalKind("movie"); }}>Filme</button>
                <button type="button" role="tab" aria-selected={modalKind === "tv"} className={modalKind === "tv" ? "is-active" : ""} onClick={() => { setModalLoaded(false); setModalKind("tv"); }}>Série</button>
              </div>
            ) : null}
            <div className="server-test-frame-wrap">
              {!modalLoaded ? <div className="server-test-loading">Carregando o player real…</div> : null}
              <iframe key={modalUrl} src={modalUrl} title={`Player de teste ${modalServer.name}`} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-orientation-lock allow-fullscreen allow-popups allow-popups-to-escape-sandbox" onLoad={() => setModalLoaded(true)} />
            </div>
            <div className="server-test-diagnostic">
              <strong>Diagnóstico automático de {kindLabel(modalKind)}</strong>
              {modalCheck ? <ServerDiagnosticDetails diagnostic={{ status: modalCheck.status, testedAt: modalServer.last_diagnostic?.testedAt ?? "", checks: [modalCheck] }} /> : <small>Execute o teste automático para gerar os detalhes.</small>}
            </div>
            <footer><p>Pressione Play e confirme a reprodução. O diagnóstico de PT-BR usa os manifestos dos três filmes de auditoria.</p><div><button type="button" className="is-danger" disabled={busyId === `confirm:${modalServer.id}`} onClick={() => void confirmarModal(false)}>Não funciona</button><button type="button" className="is-success" disabled={busyId === `confirm:${modalServer.id}`} onClick={() => void confirmarModal(true)}>Funciona</button></div></footer>
          </div>
        </div>
      ) : null}
    </main>
  );
}
