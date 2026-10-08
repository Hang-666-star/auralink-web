import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { FavoriteProvider } from "@/components/favorite-provider";
import { SessionProvider } from "@/components/session-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ArtLIVE 画智体",
    template: "%s · ArtLIVE 画智体",
  },
  description: "以真实中国画目录、作品导览与数字创作为核心的文化艺术平台。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <SessionProvider>
          <FavoriteProvider>
            <AppShell>{children}</AppShell>
          </FavoriteProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
