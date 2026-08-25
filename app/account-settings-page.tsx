"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { PROFILE_AVATAR_COLLECTIONS, PROFILE_AVATARS, findProfileAvatar } from "../lib/profile-avatars";
import ProfileAvatar from "./profile-avatar";

export type AccountUser = {
  id: number;
  nome: string;
  username: string | null;
  avatarId: string | null;
  email: string;
  administrador: boolean;
};

type Props = {
  user: AccountUser;
  onUpdated: (user: AccountUser) => void;
};

async function readResponse(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) as { erro?: string; mensagem?: string; usuario?: AccountUser } : {};
  } catch {
    return { erro: "O servidor enviou uma resposta inválida." };
  }
}

export default function AccountSettingsPage({ user, onUpdated }: Props) {
  const [nome, setNome] = useState(user.nome);
  const [email, setEmail] = useState(user.email);
  const [senhaEmail, setSenhaEmail] = useState("");
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [profileStatus, setProfileStatus] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [passwordStatus, setPasswordStatus] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const currentAvatar = findProfileAvatar(user.avatarId);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarCollectionId, setAvatarCollectionId] = useState<string | null>(null);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(user.avatarId);
  const [savingAvatarId, setSavingAvatarId] = useState<string | null | undefined>(undefined);
  const [avatarStatus, setAvatarStatus] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase();

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileStatus(null);
    setSavingProfile(true);
    try {
      const response = await fetch("/api/auth/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ action: "profile", nome, email, senhaAtual: senhaEmail }),
      });
      const data = await readResponse(response);
      if (!response.ok || !data.usuario) {
        setProfileStatus({ kind: "error", text: data.erro || "Não foi possível salvar." });
        return;
      }
      onUpdated(data.usuario);
      setSenhaEmail("");
      setProfileStatus({ kind: "success", text: data.mensagem || "Dados atualizados." });
    } catch {
      setProfileStatus({ kind: "error", text: "Falha de conexão com o servidor." });
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordStatus(null);
    if (novaSenha !== confirmarSenha) {
      setPasswordStatus({ kind: "error", text: "As novas senhas não coincidem." });
      return;
    }
    setSavingPassword(true);
    try {
      const response = await fetch("/api/auth/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ action: "password", senhaAtual, novaSenha, confirmarSenha }),
      });
      const data = await readResponse(response);
      if (!response.ok) {
        setPasswordStatus({ kind: "error", text: data.erro || "Não foi possível alterar a senha." });
        return;
      }
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarSenha("");
      setPasswordStatus({ kind: "success", text: data.mensagem || "Senha alterada." });
    } catch {
      setPasswordStatus({ kind: "error", text: "Falha de conexão com o servidor." });
    } finally {
      setSavingPassword(false);
    }
  }

  async function saveAvatar(avatarId: string | null) {
    setSavingAvatarId(avatarId);
    setAvatarStatus(null);
    try {
      const response = await fetch("/api/auth/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ action: "avatar", avatarId }),
      });
      const data = await readResponse(response);
      if (!response.ok || !data.usuario) {
        setAvatarStatus({ kind: "error", text: data.erro || "Não foi possível trocar a foto." });
        return;
      }
      onUpdated(data.usuario);
      setAvatarStatus({ kind: "success", text: data.mensagem || "Foto atualizada." });
      setAvatarPickerOpen(false);
      setAvatarCollectionId(null);
    } catch {
      setAvatarStatus({ kind: "error", text: "Falha de conexão com o servidor." });
    } finally {
      setSavingAvatarId(undefined);
    }
  }

  const avatarCollection = PROFILE_AVATAR_COLLECTIONS.find((collection) => collection.id === avatarCollectionId) || null;

  function openAvatarPicker() {
    setSelectedAvatarId(user.avatarId);
    setAvatarCollectionId(null);
    setAvatarStatus(null);
    setAvatarPickerOpen(true);
  }

  function closeAvatarPicker() {
    setAvatarPickerOpen(false);
    setAvatarCollectionId(null);
    setSelectedAvatarId(user.avatarId);
  }

  return (
    <main className={`account-page${avatarPickerOpen ? " is-avatar-picker" : ""}`}>
      <header className="account-page-topbar">
        <Link className="account-page-brand" href="/#home" aria-label="Voltar ao Flixa"><span>F</span><strong>Flixa</strong></Link>
        <div className="account-page-user">
          <ProfileAvatar avatarId={user.avatarId} name={user.nome} className="account-page-user-avatar" />
          <span><strong>{user.nome}</strong><small>{user.username ? `@${user.username}` : "Sem username"}</small></span>
        </div>
      </header>
      <div className="account-page-layout">
        <aside className="account-page-intro">
          <small>Sua conta</small>
          <h1>Configurações</h1>
          <p>Gerencie sua foto, seus dados de acesso e a segurança da conta.</p>
          <Link href="/#home"><span aria-hidden="true">←</span> Voltar para o Flixa</Link>
        </aside>
        <section className={`account-settings-panel${avatarPickerOpen ? " is-avatar-picker" : ""}`} aria-labelledby="account-page-title">
        {avatarPickerOpen ? (
          <div className="avatar-picker">
            <header className="avatar-picker-header">
              <button type="button" className="avatar-picker-back" onClick={avatarCollection ? () => setAvatarCollectionId(null) : closeAvatarPicker} aria-label="Voltar">
                <span aria-hidden="true">←</span>
              </button>
              <div>
                <small>Foto do perfil</small>
                <h2 id="account-page-title">{avatarCollection ? avatarCollection.name : "Escolha uma coleção"}</h2>
                <p>{avatarCollection ? "Agora escolha um personagem." : "Escolha uma coleção para ver os personagens."}</p>
              </div>
            </header>

            {!avatarCollection ? (
              <div className="avatar-collection-grid" aria-label="Coleções de personagens">
                {PROFILE_AVATAR_COLLECTIONS.map((collection) => {
                  const active = currentAvatar?.collectionId === collection.id;
                  return (
                    <button key={collection.id} type="button" className={active ? "is-current" : ""} onClick={() => setAvatarCollectionId(collection.id)}>
                      <ProfileAvatar avatarId={collection.characters[0].id} name={collection.name} className="avatar-collection-cover" loading="lazy" />
                      <span>
                        <strong>{collection.name}</strong>
                        <small>{collection.characters.length} {collection.characters.length === 1 ? "personagem" : "personagens"}</small>
                      </span>
                      <i aria-hidden="true">›</i>
                    </button>
                  );
                })}
              </div>
            ) : (
              <>
                <div className="avatar-choice-grid" aria-label={`Personagens de ${avatarCollection.name}`}>
                  {avatarCollection.characters.map((avatar) => (
                    <button
                      key={avatar.id}
                      type="button"
                      className={selectedAvatarId === avatar.id ? "is-selected" : ""}
                      disabled={savingAvatarId !== undefined}
                      onClick={() => setSelectedAvatarId(avatar.id)}
                      aria-pressed={selectedAvatarId === avatar.id}
                    >
                      <ProfileAvatar avatarId={avatar.id} name={avatar.name} className="avatar-choice-image" loading="lazy" />
                      <strong>{avatar.name}</strong>
                      {selectedAvatarId === avatar.id ? <i aria-hidden="true">✓</i> : null}
                    </button>
                  ))}
                </div>
                <footer className="avatar-picker-footer">
                  <button type="button" className="avatar-use-initial" disabled={savingAvatarId !== undefined} onClick={() => setSelectedAvatarId(null)}>Usar inicial do nome</button>
                  <div>
                    <button type="button" className="avatar-cancel" onClick={closeAvatarPicker}>Cancelar</button>
                    <button type="button" className="avatar-confirm" disabled={savingAvatarId !== undefined || selectedAvatarId === user.avatarId} onClick={() => void saveAvatar(selectedAvatarId)}>
                      {savingAvatarId !== undefined ? "Salvando…" : "Usar esta foto"}
                    </button>
                  </div>
                </footer>
                {avatarStatus ? <p className={`account-status avatar-picker-status is-${avatarStatus.kind}`} role="status">{avatarStatus.text}</p> : null}
              </>
            )}
          </div>
        ) : (
          <>
        <header>
          <div>
            <small>Visão geral</small>
            <h2 id="account-page-title">Dados da conta</h2>
          </div>
        </header>

        <section className="account-section account-avatar-section" aria-labelledby="account-avatar-title">
          <div className="account-avatar-heading">
            <ProfileAvatar avatarId={user.avatarId} name={user.nome} className="account-avatar-preview" />
            <div className="account-section-title">
              <h3 id="account-avatar-title">Foto do perfil</h3>
              <p>{currentAvatar ? `${currentAvatar.name} · ${currentAvatar.collectionName}` : "Você está usando a inicial do seu nome."}</p>
            </div>
            <button type="button" className="account-avatar-change" onClick={openAvatarPicker}>Trocar foto</button>
          </div>
          <small className="account-avatar-count">{PROFILE_AVATARS.length} personagens organizados em {PROFILE_AVATAR_COLLECTIONS.length} coleções.</small>
          {avatarStatus ? <p className={`account-status is-${avatarStatus.kind}`} role="status">{avatarStatus.text}</p> : null}
        </section>

        <form className="account-section" onSubmit={saveProfile}>
          <div className="account-section-title">
            <h3>Perfil e acesso</h3>
            <p>O nome aparece para você e para seus amigos.</p>
          </div>
          <label>
            <span>Nome</span>
            <input type="text" autoComplete="name" value={nome} onChange={(event) => setNome(event.target.value)} minLength={2} maxLength={120} required />
          </label>
          <label>
            <span>Username</span>
            <div className="account-locked-field">
              <input type="text" value={user.username ? `@${user.username}` : "Ainda não definido"} disabled readOnly />
              <small>Seu username é permanente e não pode ser alterado.</small>
            </div>
          </label>
          <label>
            <span>E-mail</span>
            <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          {emailChanged ? (
            <label>
              <span>Senha atual para confirmar o novo e-mail</span>
              <input type="password" autoComplete="current-password" value={senhaEmail} onChange={(event) => setSenhaEmail(event.target.value)} required />
            </label>
          ) : null}
          {profileStatus ? <p className={`account-status is-${profileStatus.kind}`} role="status">{profileStatus.text}</p> : null}
          <button className="account-save" type="submit" disabled={savingProfile}>{savingProfile ? "Salvando…" : "Salvar dados"}</button>
        </form>

        <form className="account-section" onSubmit={savePassword}>
          <div className="account-section-title">
            <h3>Trocar senha</h3>
            <p>Ao alterar, suas outras sessões serão encerradas.</p>
          </div>
          <label>
            <span>Senha atual</span>
            <input type="password" autoComplete="current-password" value={senhaAtual} onChange={(event) => setSenhaAtual(event.target.value)} required />
          </label>
          <div className="account-password-grid">
            <label>
              <span>Nova senha</span>
              <input type="password" autoComplete="new-password" value={novaSenha} onChange={(event) => setNovaSenha(event.target.value)} minLength={6} required />
            </label>
            <label>
              <span>Confirmar nova senha</span>
              <input type="password" autoComplete="new-password" value={confirmarSenha} onChange={(event) => setConfirmarSenha(event.target.value)} minLength={6} required />
            </label>
          </div>
          {passwordStatus ? <p className={`account-status is-${passwordStatus.kind}`} role="status">{passwordStatus.text}</p> : null}
          <button className="account-save" type="submit" disabled={savingPassword}>{savingPassword ? "Alterando…" : "Alterar senha"}</button>
        </form>
          </>
        )}
        </section>
      </div>
    </main>
  );
}
