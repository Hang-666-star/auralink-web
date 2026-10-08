import type { Metadata } from "next";

import { PaintingDetailScreen } from "@/components/painting-detail-screen";
import { ProtectedRoute } from "@/components/protected-route";

export const metadata: Metadata = { title: "作品详情" };

export default async function PaintingDetailPage({ params }: { params: Promise<{ paintingId: string }> }) {
  const { paintingId } = await params;
  return (
    <main className="page-shell detail-page">
      <ProtectedRoute><PaintingDetailScreen paintingId={paintingId} /></ProtectedRoute>
    </main>
  );
}
