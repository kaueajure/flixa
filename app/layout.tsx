import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flixa",
  description: "Filmes e séries com catálogo TMDB, lista pessoal e player Flixa.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
