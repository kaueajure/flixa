"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WATCH_PARTY_ENABLED } from "../lib/feature-flags";

type Usuario = { id: number; nome: string; username: string | null; avatarId: string | null; email: string; administrador: boolean };
type ModoAuth = "login" | "cadastro" | "recuperar" | "redefinir";

export default function LoginForm() {
  const router = useRouter();
  const [modo, setModo] = useState<ModoAuth>("login");
  const [nome, setNome] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [devResetUrl, setDevResetUrl] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [checandoSessao, setChecandoSessao] = useState(true);

  useEffect(() => {
    const token = new URL(window.location.href).searchParams.get("reset");
    if (token) {
      queueMicrotask(() => {
        setResetToken(token);
        setModo("redefinir");
        setChecandoSessao(false);
      });
      return;
    }

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
      .catch(() => { if (ativo) setChecandoSessao(false); })
      .finally(() => window.clearTimeout(timeoutId));
    return () => {
      ativo = false;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [router]);

  function trocarModo(proximo: ModoAuth) {
    setModo(proximo);
    setErro("");
    setMensagem("");
    setDevResetUrl("");
    setSenha("");
    setConfirmarSenha("");
  }

  async function parseResponse(response: Response) {
    const raw = await response.text();
    try {
      return raw ? JSON.parse(raw) as { erro?: string; mensagem?: string; usuario?: Usuario; devResetUrl?: string } : {};
    } catch {
      return { erro: response.status >= 500 ? "Servidor indisponível no momento. Tente de novo." : "Resposta inválida do servidor." };
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro("");
    setMensagem("");

    if (modo === "cadastro") {
      if (nome.trim().length < 2) return setErro("Informe um nome com pelo menos 2 caracteres.");
      const normalizedUsername = username.trim().toLowerCase().replace(/^@+/, "");
      if (!/^[a-z0-9](?:[a-z0-9._]{1,18}[a-z0-9])$/.test(normalizedUsername)) {
        return setErro("Escolha um username de 3 a 20 caracteres usando letras, números, ponto ou underline.");
      }
      if (senha.length < 6) return setErro("A senha deve ter pelo menos 6 caracteres.");
      if (senha !== confirmarSenha) return setErro("As senhas não coincidem.");
    }
    if (modo === "redefinir") {
      if (senha.length < 6) return setErro("A nova senha deve ter pelo menos 6 caracteres.");
      if (senha !== confirmarSenha) return setErro("As senhas não coincidem.");
    }

    setCarregando(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);
    try {
      if (modo === "recuperar") {
        const response = await fetch("/api/auth/password-recovery", {
          method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: controller.signal,
          body: JSON.stringify({ email }),
        });
        const data = await parseResponse(response);
        if (!response.ok) return setErro(data.erro || "Não foi possível solicitar o link agora.");
        setMensagem(data.mensagem || "Confira seu e-mail para continuar.");
        setDevResetUrl(data.devResetUrl || "");
        return;
      }

      if (modo === "redefinir") {
        const response = await fetch("/api/auth/password-recovery", {
          method: "PUT", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: controller.signal,
          body: JSON.stringify({ token: resetToken, novaSenha: senha, confirmarSenha }),
        });
        const data = await parseResponse(response);
        if (!response.ok) return setErro(data.erro || "Não foi possível redefinir a senha.");
        window.history.replaceState(null, "", window.location.pathname);
        trocarModo("login");
        setMensagem(data.mensagem || "Senha redefinida. Agora você já pode entrar.");
        return;
      }

      const endpoint = modo === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload = modo === "login"
        ? { email, senha }
        : { nome: nome.trim(), username: username.trim().toLowerCase().replace(/^@+/, ""), email, senha };
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", cache: "no-store", signal: controller.signal,
        body: JSON.stringify(payload),
      });
      const data = await parseResponse(response);
      if (!response.ok || !data.usuario) {
        return setErro(data.erro || (modo === "login" ? "Não foi possível entrar." : "Não foi possível cadastrar."));
      }

      const atual = new URL(window.location.href);
      const destino = new URL("/", window.location.origin);
      destino.searchParams.set("welcome", "1");
      const sala = atual.searchParams.get("party");
      if (WATCH_PARTY_ENABLED && sala) destino.searchParams.set("party", sala);
      destino.hash = atual.hash;
      window.location.assign(`${destino.pathname}${destino.search}${destino.hash}`);
    } catch (error) {
      setErro(error instanceof DOMException && error.name === "AbortError" ? "Demorou demais para responder. Tente novamente." : "Falha de conexão com o servidor.");
    } finally {
      window.clearTimeout(timeoutId);
      setCarregando(false);
    }
  }

  if (checandoSessao) {
    return <main className="login-shell"><div className="login-card"><img className="login-logo" src="/logo-transparent.png" alt="Flixa" /><p>Verificando sessão…</p></div></main>;
  }

  const description = modo === "login" ? "Entre para acessar o catálogo em português."
    : modo === "cadastro" ? "Crie sua conta para salvar lista e histórico."
      : modo === "recuperar" ? "Informe seu e-mail para receber um link seguro."
        : "Escolha uma nova senha para sua conta.";

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-brand"><img className="login-logo" src="/logo-transparent.png" alt="Flixa" /><p>{description}</p></div>

        {modo === "login" || modo === "cadastro" ? (
          <div className="login-tabs" role="tablist" aria-label="Autenticação">
            <button type="button" role="tab" aria-selected={modo === "login"} className={modo === "login" ? "is-active" : ""} onClick={() => trocarModo("login")}>Entrar</button>
            <button type="button" role="tab" aria-selected={modo === "cadastro"} className={modo === "cadastro" ? "is-active" : ""} onClick={() => trocarModo("cadastro")}>Criar conta</button>
          </div>
        ) : <button type="button" className="login-back" onClick={() => trocarModo("login")}>← Voltar para entrar</button>}

        <form className="login-form" onSubmit={onSubmit}>
          {modo === "cadastro" ? (
            <>
              <label><span>Nome</span><input type="text" autoComplete="name" value={nome} onChange={(event) => setNome(event.target.value)} placeholder="Seu nome" minLength={2} required /></label>
              <label><span>Username</span><div className="username-input-wrap"><b aria-hidden="true">@</b><input type="text" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 20))} placeholder="seu.username" minLength={3} maxLength={20} required /></div></label>
            </>
          ) : null}

          {modo !== "redefinir" ? <label><span>E-mail</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="seu@email.com" required /></label> : null}
          {modo !== "recuperar" ? <label><span>{modo === "redefinir" ? "Nova senha" : "Senha"}</span><input type="password" autoComplete={modo === "login" ? "current-password" : "new-password"} value={senha} onChange={(event) => setSenha(event.target.value)} placeholder="••••••••" required minLength={modo === "login" ? undefined : 6} /></label> : null}
          {modo === "cadastro" || modo === "redefinir" ? <label><span>{modo === "redefinir" ? "Confirmar nova senha" : "Confirmar senha"}</span><input type="password" autoComplete="new-password" value={confirmarSenha} onChange={(event) => setConfirmarSenha(event.target.value)} placeholder="••••••••" required minLength={6} /></label> : null}

          {modo === "login" ? <button className="login-forgot" type="button" onClick={() => trocarModo("recuperar")}>Esqueci minha senha</button> : null}
          {erro ? <p className="login-error" role="alert">{erro}</p> : null}
          {mensagem ? <p className="login-success" role="status">{mensagem}</p> : null}
          {devResetUrl ? <a className="login-dev-link" href={devResetUrl}>Abrir link de desenvolvimento</a> : null}
          <button className="login-submit" type="submit" disabled={carregando || (modo === "recuperar" && Boolean(mensagem))}>
            {carregando ? "Aguarde…" : modo === "login" ? "Entrar" : modo === "cadastro" ? "Criar conta" : modo === "recuperar" ? "Enviar link" : "Criar nova senha"}
          </button>
        </form>
      </section>
    </main>
  );
}
