import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "J.A.R.V.I.S — Assistente Pessoal Inteligente",
  description:
    "Just A Rather Very Intelligent System — Assistente pessoal de voz e texto alimentado por IA.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🤖</text></svg>",
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
