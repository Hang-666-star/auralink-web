import type { Metadata } from "next";
import { AvailabilityPage } from "@/components/availability-page";
export const metadata: Metadata = { title: "知识库" };
export default function KnowledgePage() { return <AvailabilityPage title="知识库" description="当前静态知识仅用于服务端作品导览，尚无知识库浏览或搜索 API。" />; }
