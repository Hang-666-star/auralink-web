import type { Metadata } from "next";
import { GalleryScreen } from "@/components/gallery-screen";

export const metadata: Metadata = { title: "画廊" };
export default function GalleryPage() { return <GalleryScreen />; }
