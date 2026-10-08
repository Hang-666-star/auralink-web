import type { Metadata } from "next";

import { AccountSessionScreen } from "@/components/account-session-screen";
import { ProtectedRoute } from "@/components/protected-route";

export const metadata: Metadata = { title: "账号" };

export default function AccountPage() {
  return (
    <main className="page-shell me-page">
      <ProtectedRoute><AccountSessionScreen /></ProtectedRoute>
    </main>
  );
}
