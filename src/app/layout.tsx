import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ARGUS // Autonomous Reasoning Companion",
  description: "Personal AI Decision Support Companion",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#070b12] text-zinc-100 antialiased overflow-hidden">
        {children}
      </body>
    </html>
  );
}
