import type { Metadata } from "next";
import { AvailabilityPage } from "@/components/availability-page";
export const metadata: Metadata = { title: "助手" };
export default function AssistantPage() { return <AvailabilityPage title="助手" description="通用问答与多轮对话后端尚未形成可用产品契约。" />; }
