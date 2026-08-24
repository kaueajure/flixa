"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Usuario = {
  id: number;
  nome: string;
  username: string | null;
  email: string;
  administrador: boolean;
};

type ModoAuth = "login" | "cadastro";

export default function LoginForm() {
  const router = useRouter();
  const [modo, setModo] = useState<ModoAuth>("login");
  const [nome, setNome] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [checandoSessao, setChecandoSessao] = useState(true);

  useEffect(() => {
    let ativo = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);

    fetch("/api/auth/me", { cache: "no-store", credentials: "include", signal: controller.signal })
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
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });
    return () => {
      ativo = false;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [router]);

  function trocarModo(proximo: ModoAuth) {
    setModo(proximo);
    setErro("");
    setSenha("");
    setConfirmarSenha("");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro("");

    if (modo === "cadastro") {
      if (nome.trim().length < 2) {
        setErro("Informe um nome com pelo menos 2 caracteres.");
        return;
      }
      const normalizedUsername = username.trim().toLowerCase().replace(/^@+/, "");
      if (!/^[a-z0-9](?:[a-z0-9._]{1,18}[a-z0-9])$/.test(normalizedUsername)) {
        setErro("Escolha um username de 3 a 20 caracteres usando letras, números, ponto ou underline.");
        return;
      }
      if (senha.length < 6) {
        setErro("A senha deve ter pelo menos 6 caracteres.");
        return;
      }
      if (senha !== confirmarSenha) {
        setErro("As senhas não coincidem.");
        return;
      }
    }

    setCarregando(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);
    try {
      const endpoint = modo === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        modo === "login"
          ? { email, senha }
          : { nome: nome.trim(), username: username.trim().toLowerCase().replace(/^@+/, ""), email, senha };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify(payload),
      });

      const raw = await res.text();
      let data: { erro?: string; usuario?: Usuario } = {};
      try {
        data = raw ? (JSON.parse(raw) as { erro?: string; usuario?: Usuario }) : {};
      } catch {
        setErro(
          res.status >= 500
            ? "Servidor indisponível no momento. Tente de novo."
            : "Resposta inválida do servidor.",
        );
        return;
      }

      if (!res.ok || !data.usuario) {
        setErro(data.erro || (modo === "login" ? "Não foi possível entrar." : "Não foi possível cadastrar."));
        return;
      }

      // Navegação full page para garantir que o cookie de sessão vá junto e
      // preservar um convite de sessão compartilhada recebido antes do login.
      const atual = new URL(window.location.href);
      const destino = new URL("/", window.location.origin);
      destino.searchParams.set("welcome", "1");
      const sala = atual.searchParams.get("party");
      if (sala) destino.searchParams.set("party", sala);
      destino.hash = atual.hash;
      window.location.assign(`${destino.pathname}${destino.search}${destino.hash}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setErro("Demorou demais para responder. Confira o MySQL/env na Hostinger.");
      } else {
        setErro("Falha de conexão com o servidor.");
      }
    } finally {
      window.clearTimeout(timeoutId);
      setCarregando(false);
    }
  }

  if (checandoSessao) {
    return (
      <main className="login-shell">
        <div className="login-card">
          <img className="login-logo" src="/logo-transparent.png" alt="Flixa" />
          <p>Verificando sessão…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-brand">
          <img className="login-logo" src="/logo-transparent.png" alt="Flixa" />
          <p>
            {modo === "login"
              ? "Entre para acessar o catálogo em português."
              : "Crie sua conta para salvar lista e histórico."}
          </p>
        </div>

        <div className="login-tabs" role="tablist" aria-label="Autenticação">
          <button
            type="button"
            role="tab"
            aria-selected={modo === "login"}
            className={modo === "login" ? "is-active" : ""}
            onClick={() => trocarModo("login")}
          >
            Entrar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={modo === "cadastro"}
            className={modo === "cadastro" ? "is-active" : ""}
            onClick={() => trocarModo("cadastro")}
          >
            Criar conta
          </button>
        </div>

        <form className="login-form" onSubmit={onSubmit}>
          {modo === "cadastro" ? (
            <>
              <label>
                <span>Nome</span>
                <input
                  type="text"
                  autoComplete="name"
                  value={nome}
                  onChange={(event) => setNome(event.target.value)}
                  placeholder="Seu nome"
                  required
                />
              </label>
              <label>
                <span>Username</span>
                <div className="username-input-wrap">
                  <b aria-hidden="true">@</b>
                  <input
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 20))}
                    placeholder="seu.username"
                    minLength={3}
                    maxLength={20}
                    required
                  />
                </div>
              </label>
            </>
          ) : null}

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
              autoComplete={modo === "login" ? "current-password" : "new-password"}
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              placeholder="••••••••"
              required
              minLength={modo === "cadastro" ? 6 : undefined}
            />
          </label>

          {modo === "cadastro" ? (
            <label>
              <span>Confirmar senha</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmarSenha}
                onChange={(event) => setConfirmarSenha(event.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </label>
          ) : null}

          {erro ? <p className="login-error">{erro}</p> : null}

          <button className="login-submit" type="submit" disabled={carregando}>
            {carregando
              ? modo === "login"
                ? "Entrando…"
                : "Criando conta…"
              : modo === "login"
                ? "Entrar"
                : "Criar conta"}
          </button>
        </form>
      </section>
    </main>
  );
}
