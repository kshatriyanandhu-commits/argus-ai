import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARGUS — Intelligence, amplified",
  description: "Your personal reasoning companion for ideas, decisions, writing, and everything in between.",
  applicationName: "ARGUS AI",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
