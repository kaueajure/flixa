"use client";

import { useEffect, useState } from "react";
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

export default function AdminPage() {
  const router = useRouter();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [usuarios, setUsuarios] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [euId, setEuId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function carregar() {
    setErro("");
    const res = await fetch("/api/admin/usuarios", { cache: "no-store", credentials: "include" });
    const data = (await res.json()) as {
      erro?: string;
      usuarios?: AdminUser[];
      estatisticas?: Stats;
      eu?: { id: number };
    };
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        router.replace(res.status === 401 ? "/login" : "/");
        return;
      }
      throw new Error(data.erro || "Falha ao carregar painel");
    }
    setUsuarios(Array.isArray(data.usuarios) ? data.usuarios : []);
    setStats(data.estatisticas ?? null);
    setEuId(data.eu?.id ?? null);
  }

  useEffect(() => {
    let ativo = true;
    carregar()
      .catch((error) => {
        if (ativo) setErro(error instanceof Error ? error.message : "Falha ao carregar");
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [router]);

  async function toggleAdmin(user: AdminUser) {
    setBusyId(user.id);
    setErro("");
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, administrador: !user.administrador }),
      });
      const data = (await res.json()) as { erro?: string };
      if (!res.ok) throw new Error(data.erro || "Não foi possível atualizar");
      await carregar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao atualizar");
    } finally {
      setBusyId(null);
    }
  }

  async function excluir(user: AdminUser) {
    if (!window.confirm(`Excluir a conta de ${user.nome}?`)) return;
    setBusyId(user.id);
    setErro("");
    try {
      const res = await fetch(`/api/admin/usuarios?id=${user.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json()) as { erro?: string };
      if (!res.ok) throw new Error(data.erro || "Não foi possível excluir");
      await carregar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao excluir");
    } finally {
      setBusyId(null);
    }
  }

  if (carregando) {
    return (
      <main className="admin-shell">
        <p>Carregando painel…</p>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-head">
        <div>
          <p className="eyebrow">Flixa</p>
          <h1>Painel Admin</h1>
          <p>Gestão de usuários e visão do conteúdo salvo no MySQL.</p>
        </div>
        <a className="admin-back" href="/">
          Voltar ao catálogo
        </a>
      </header>

      {erro ? <p className="login-error">{erro}</p> : null}

      {stats ? (
        <section className="admin-stats" aria-label="Estatísticas">
          <article>
            <strong>{stats.usuarios}</strong>
            <span>Usuários</span>
          </article>
          <article>
            <strong>{stats.itens_lista}</strong>
            <span>Itens na lista</span>
          </article>
          <article>
            <strong>{stats.itens_historico}</strong>
            <span>Histórico</span>
          </article>
          <article>
            <strong>{stats.itens_progresso}</strong>
            <span>Progressos</span>
          </article>
        </section>
      ) : null}

      <section className="admin-table-wrap">
        <h2>Usuários</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((user) => {
              const isSelf = user.id === euId;
              return (
                <tr key={user.id}>
                  <td>{user.nome}</td>
                  <td>{user.email}</td>
                  <td>{user.administrador ? "Admin" : "Usuário"}</td>
                  <td className="admin-actions">
                    <button
                      type="button"
                      disabled={busyId === user.id || (isSelf && user.administrador)}
                      onClick={() => void toggleAdmin(user)}
                    >
                      {user.administrador ? "Remover admin" : "Tornar admin"}
                    </button>
                    <button
                      type="button"
                      className="is-danger"
                      disabled={busyId === user.id || isSelf}
                      onClick={() => void excluir(user)}
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
