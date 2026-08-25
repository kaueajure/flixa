"use client";

import { type FormEvent, useState } from "react";

type PublicUser = {
  id: number;
  nome: string;
  username: string | null;
  avatarId: string | null;
  email: string;
  administrador: boolean;
};

export default function UsernameSetupModal({
  user,
  onComplete,
}: {
  user: PublicUser;
  onComplete: (user: PublicUser) => void;
}) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = username.trim().toLowerCase().replace(/^@+/, "");
    if (!/^[a-z0-9](?:[a-z0-9._]{1,18}[a-z0-9])$/.test(normalized)) {
      setError("Use de 3 a 20 caracteres: letras, números, ponto ou underline.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: normalized }),
      });
      const data = await response.json() as { usuario?: PublicUser; erro?: string };
      if (!response.ok || !data.usuario) throw new Error(data.erro || "Não foi possível salvar o username.");
      onComplete(data.usuario);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o username.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="username-modal-backdrop" role="presentation">
      <section className="username-modal" role="dialog" aria-modal="true" aria-labelledby="username-title">
        <span className="username-modal-icon" aria-hidden="true">@</span>
        <p className="eyebrow">Seu perfil no Flixa</p>
        <h2 id="username-title">Como seus amigos vão encontrar você?</h2>
        <p>Olá, {user.nome}. Escolha um username único. Depois disso, seus amigos poderão pesquisar, adicionar e acompanhar o que você está assistindo.</p>
        <form onSubmit={submit}>
          <label htmlFor="first-username">Seu username</label>
          <div className="username-input-wrap">
            <b aria-hidden="true">@</b>
            <input
              id="first-username"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 20))}
              placeholder="seu.username"
              minLength={3}
              maxLength={20}
              required
            />
          </div>
          <small>Use letras sem acento, números, ponto ou underline.</small>
          {error ? <p className="username-modal-error" role="alert">{error}</p> : null}
          <button className="primary-action" type="submit" disabled={saving}>{saving ? "Salvando…" : "Criar meu username"}</button>
        </form>
      </section>
    </div>
  );
}
