import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Configurações da conta — Flixa",
  description: "Gerencie seu perfil, foto, e-mail e senha no Flixa.",
  robots: { index: false, follow: false },
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
  },
};

export default function AccountSettingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
