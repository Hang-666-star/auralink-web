import { Navigation } from "@/components/navigation";
import { MiniAppBackButton } from "@/components/miniapp-back-button";
import Script from "next/script";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://res.wx.qq.com/open/js/jweixin-1.6.0.js" strategy="afterInteractive" />
      <Navigation />
      <MiniAppBackButton />
      {children}
      <footer className="site-footer">
        <span>ArtLIVE 画智体</span>
        <span>让中国画在数字空间中被看见、理解与延续</span>
      </footer>
    </>
  );
}

