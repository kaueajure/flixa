"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AccountSettingsPage, { type AccountUser } from "../account-settings-page";
import { useLivePresence } from "../../lib/use-live-presence";

export default function AccountSettingsRoute() {
  const router = useRouter();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useLivePresence(Boolean(user), "settings");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", {
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace("/login");
          return null;
        }
        const data = await response.json() as { usuario?: AccountUser | null; erro?: string };
        if (!response.ok || !data.usuario) throw new Error(data.erro || "Não foi possível carregar sua conta.");
        return data.usuario;
      })
      .then((accountUser) => {
        if (accountUser) setUser(accountUser);
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Falha ao carregar sua conta.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [router]);

  useEffect(() => {
    document.title = "Configurações da conta — Flixa";
  }, []);

  if (loading) {
    return <main className="account-page-state" aria-live="polite"><span /><strong>Carregando sua conta…</strong></main>;
  }
  if (error || !user) {
    return (
      <main className="account-page-state is-error">
        <strong>Não foi possível abrir as configurações</strong>
        <p>{error || "Sua sessão não está disponível."}</p>
        <Link href="/#home">Voltar ao Flixa</Link>
      </main>
    );
  }
  return <AccountSettingsPage user={user} onUpdated={setUser} />;
}
