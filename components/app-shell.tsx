import { Navigation } from "@/components/navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navigation />
      {children}
      <footer className="site-footer">
        <span>ArtLIVE 画智体</span>
        <span>让中国画在数字空间中被看见、理解与延续</span>
      </footer>
    </>
  );
}
