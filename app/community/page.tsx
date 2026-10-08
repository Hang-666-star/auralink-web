import type { Metadata } from "next";
import { AvailabilityPage } from "@/components/availability-page";
export const metadata: Metadata = { title: "社区" };
export default function CommunityPage() { return <AvailabilityPage title="社区" description="作品分享、发帖与互动需要完整的社区后端。" />; }
