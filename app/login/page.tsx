"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Usuario = {
  id: number;
  nome: string;
  email: string;
  administrador: boolean;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [checandoSessao, setChecandoSessao] = useState(true);

  useEffect(() => {
    let ativo = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as { usuario?: Usuario | null };
        return data.usuario ?? null;
      })
      .then((usuario) => {
        if (!ativo) return;
        if (usuario) router.replace("/");
        else setChecandoSessao(false);
      })
      .catch(() => {
        if (ativo) setChecandoSessao(false);
      });
    return () => {
      ativo = false;
    };
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      const data = (await res.json()) as { erro?: string; usuario?: Usuario };
      if (!res.ok || !data.usuario) {
        setErro(data.erro || "Não foi possível entrar.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setErro("Falha de conexão com o servidor.");
    } finally {
      setCarregando(false);
    }
  }

  if (checandoSessao) {
    return (
      <main className="login-shell">
        <div className="login-card">
          <span className="brand-mark" />
          <p>Verificando sessão…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-brand">
          <span className="brand-mark" />
          <h1>FLIXA</h1>
          <p>Entre para acessar o catálogo em português.</p>
        </div>

        <form className="login-form" onSubmit={onSubmit}>
          <label>
            <span>E-mail</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="seu@email.com"
              required
            />
          </label>

          <label>
            <span>Senha</span>
            <input
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              placeholder="••••••••"
              required
            />
          </label>

          {erro ? <p className="login-error">{erro}</p> : null}

          <button className="login-submit" type="submit" disabled={carregando}>
            {carregando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
