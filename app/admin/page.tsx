"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AdminUser = {
  id: number;
  nome: string;
  email: string;
  administrador: boolean;
  criado_em?: string | null;
};

type Stats = {
  usuarios: number;
  itens_lista: number;
  itens_historico: number;
  itens_progresso: number;
};

type ServerStatus = "unknown" | "online" | "offline";

type AdminServer = {
  id: string;
  name: string;
  domain: string;
  testUrl: string;
  testTvUrl: string;
  supportsMovie: boolean;
  supportsTv: boolean;
  enabled: boolean;
  disabled_until: string | null;
  last_status: ServerStatus;
  last_http_status: number | null;
  last_latency_ms: number | null;
  last_message: string | null;
  last_tested_at: string | null;
};

type AdminTab = "usuarios" | "servidores";

function formatDate(value: string | null) {
  if (!value) return "Nunca";
  const parsed = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
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

  const serverStats = useMemo(() => ({
    online: servidores.filter((server) => server.last_status === "online").length,
    offline: servidores.filter((server) => server.last_status === "offline").length,
    enabled: servidores.filter((server) => server.enabled).length,
  }), [servidores]);

  function handleUnauthorized(status: number) {
    if (status === 401 || status === 403) {
      router.replace(status === 401 ? "/login" : "/");
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
    carregar()
      .catch((error) => {
        if (active) setErro(error instanceof Error ? error.message : "Falha ao carregar");
      })
      .finally(() => {
        if (active) setCarregando(false);
      });
    return () => {
      active = false;
    };
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
      const response = await fetch("/api/admin/servidores", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const data = await responseJson<{ servidores?: AdminServer[] }>(response);
      if (!response.ok || !Array.isArray(data.servidores)) throw new Error(data.erro || "Teste em lote não concluído");
      setServidores(data.servidores);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao testar servidores");
    } finally {
      setTestingAll(false);
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
        body: JSON.stringify({ action: "confirm", id: modalServer.id, ok }),
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
    return <main className="admin-shell"><p>Carregando painel…</p></main>;
  }

  return (
    <main className="admin-shell">
      <header className="admin-head">
        <div>
          <p className="eyebrow">Flixa</p>
          <h1>Painel Admin</h1>
          <p>Usuários, disponibilidade e testes reais dos servidores de reprodução.</p>
        </div>
        <a className="admin-back" href="/">Voltar ao catálogo</a>
      </header>

      {erro ? <p className="login-error">{erro}</p> : null}

      <nav className="admin-tabs" aria-label="Seções do painel">
        <button className={tab === "usuarios" ? "is-active" : ""} type="button" onClick={() => setTab("usuarios")}>Usuários</button>
        <button className={tab === "servidores" ? "is-active" : ""} type="button" onClick={() => setTab("servidores")}>Servidores <span>{servidores.length}</span></button>
      </nav>

      {tab === "usuarios" ? (
        <>
          {stats ? (
            <section className="admin-stats" aria-label="Estatísticas">
              <article><strong>{stats.usuarios}</strong><span>Usuários</span></article>
              <article><strong>{stats.itens_lista}</strong><span>Itens na lista</span></article>
              <article><strong>{stats.itens_historico}</strong><span>Histórico</span></article>
              <article><strong>{stats.itens_progresso}</strong><span>Progressos</span></article>
            </section>
          ) : null}

          <section className="admin-table-wrap">
            <h2>Usuários</h2>
            <table className="admin-table">
              <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Ações</th></tr></thead>
              <tbody>
                {usuarios.map((user) => {
                  const isSelf = user.id === euId;
                  return (
                    <tr key={user.id}>
                      <td>{user.nome}</td><td>{user.email}</td><td>{user.administrador ? "Admin" : "Usuário"}</td>
                      <td className="admin-actions">
                        <button type="button" disabled={busyId === `user:${user.id}` || (isSelf && user.administrador)} onClick={() => void toggleAdmin(user)}>{user.administrador ? "Remover admin" : "Tornar admin"}</button>
                        <button type="button" className="is-danger" disabled={busyId === `user:${user.id}` || isSelf} onClick={() => void excluir(user)}>Excluir</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      ) : (
        <>
          <section className="admin-stats admin-server-stats" aria-label="Estado dos servidores">
            <article><strong>{servidores.length}</strong><span>Total</span></article>
            <article className="is-online"><strong>{serverStats.online}</strong><span>Verdes</span></article>
            <article className="is-offline"><strong>{serverStats.offline}</strong><span>Vermelhos</span></article>
            <article><strong>{serverStats.enabled}</strong><span>Habilitados</span></article>
          </section>

          <section className="admin-table-wrap admin-servers-wrap">
            <div className="admin-section-head">
              <div><h2>Servidores</h2><p>Teste automático de acesso e confirmação visual do vídeo.</p></div>
              <div className="admin-server-toolbar">
                <label>Desativar por
                  <select value={disableMinutes} onChange={(event) => setDisableMinutes(Number(event.target.value))}>
                    <option value={60}>1 hora</option><option value={360}>6 horas</option><option value={1440}>24 horas</option><option value={0}>Indefinidamente</option>
                  </select>
                </label>
                <button type="button" className="admin-test-all" disabled={testingAll} onClick={() => void testarTodos()}>{testingAll ? "Testando todos…" : "Testar todos"}</button>
              </div>
            </div>

            <table className="admin-table admin-server-table">
              <thead><tr><th>Status</th><th>Servidor</th><th>Cobertura</th><th>Último teste</th><th>Uso</th><th>Ações</th></tr></thead>
              <tbody>
                {servidores.map((server) => (
                  <tr key={server.id} className={!server.enabled ? "is-disabled" : ""}>
                    <td><span className={`server-status is-${server.last_status}`}><i aria-hidden="true" />{server.last_status === "online" ? "Online" : server.last_status === "offline" ? "Falhou" : "Não testado"}</span></td>
                    <td><strong>{server.name}</strong><small className="server-domain">{server.domain}</small></td>
                    <td>{[server.supportsMovie ? "Filmes" : null, server.supportsTv ? "Séries" : null].filter(Boolean).join(" + ")}</td>
                    <td className="server-last-test"><strong>{formatDate(server.last_tested_at)}</strong><small>{server.last_latency_ms != null ? `${server.last_latency_ms} ms · ` : ""}{server.last_http_status ? `HTTP ${server.last_http_status} · ` : ""}{server.last_message || "Aguardando teste"}</small></td>
                    <td><span className={`server-enabled ${server.enabled ? "is-on" : "is-off"}`}>{server.enabled ? "Habilitado" : "Desativado"}</span>{!server.enabled && server.disabled_until ? <small className="server-domain">até {formatDate(server.disabled_until)}</small> : null}</td>
                    <td className="admin-actions server-actions">
                      <button type="button" disabled={busyId === `test:${server.id}` || testingAll} onClick={() => void testarServidor(server)}>{busyId === `test:${server.id}` ? "Testando…" : "Testar"}</button>
                      <button type="button" className={server.enabled ? "is-danger" : "is-enable"} disabled={busyId === `toggle:${server.id}`} onClick={() => void setServerEnabled(server, !server.enabled)}>{server.enabled ? "Desativar" : "Habilitar"}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {modalServer ? (
        <div className="server-test-modal" role="dialog" aria-modal="true" aria-label={`Teste de ${modalServer.name}`}>
          <div className="server-test-dialog">
            <header><div><p className="eyebrow">Teste visual</p><h2>{modalServer.name}</h2><span>{modalServer.testUrl}</span></div><button type="button" aria-label="Fechar teste" onClick={() => setModalServer(null)}>×</button></header>
            <div className="server-test-frame-wrap">
              {!modalLoaded ? <div className="server-test-loading">Carregando o player real…</div> : null}
              <iframe key={modalServer.testUrl} src={modalServer.testUrl} title={`Player de teste ${modalServer.name}`} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-orientation-lock allow-fullscreen allow-popups" onLoad={() => setModalLoaded(true)} />
            </div>
            <footer><p>Pressione Play. O vídeo realmente abriu?</p><div><button type="button" className="is-danger" disabled={busyId === `confirm:${modalServer.id}`} onClick={() => void confirmarModal(false)}>Não funciona</button><button type="button" className="is-success" disabled={busyId === `confirm:${modalServer.id}`} onClick={() => void confirmarModal(true)}>Funciona</button></div></footer>
          </div>
        </div>
      ) : null}
    </main>
  );
}
