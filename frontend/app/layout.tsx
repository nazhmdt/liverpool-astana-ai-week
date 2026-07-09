import type { Metadata } from "next";
import { PT_Serif, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import AuthGate from "@/components/AuthGate";

const ptSerif = PT_Serif({
  variable: "--font-source-serif",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "700"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "LiverPool AI",
  description: "ИИ-платформа раннего выявления заболеваний печени и хронических вирусных гепатитов",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${ptSerif.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full flex">
        <AuthGate>
          <Sidebar />
          <main className="flex-1 min-w-0">{children}</main>
        </AuthGate>
      </body>
    </html>
  );
}
