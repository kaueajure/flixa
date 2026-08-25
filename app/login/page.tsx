import type { Metadata } from "next";
import LoginForm from "../login-form";

export const metadata: Metadata = {
  title: "Entrar ou recuperar senha — Flixa",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function LoginRoute() {
  return <LoginForm />;
}
