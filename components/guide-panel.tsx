"use client";

import { StatePanel } from "@/components/state-panel";
import type { PaintingGuide } from "@/lib/types";

const sectionLabels: Record<keyof PaintingGuide["sections"], string> = {
  artistAndEra: "画家与时代",
  subjectAndScene: "题材与场景",
  composition: "构图",
  brushworkAndInk: "笔墨",
  colorAndMaterial: "设色与材质",
  artisticConception: "艺术意境",
  culturalMeaning: "文化意涵",
  musicAssociation: "音乐联想",
};

type GuidePanelProps = {
  guide: PaintingGuide | null;
  state: "loading" | "missing" | "available" | "generating" | "error";
  error?: string | null;
  onGenerate: () => void;
  onRetry: () => void;
};

export function GuidePanel({ guide, state, error, onGenerate, onRetry }: GuidePanelProps) {
  if (state === "loading") return <StatePanel compact kind="loading" title="正在查找已生成导览" />;
  if (state === "missing") {
    return <StatePanel compact kind="empty" title="这幅作品尚无导览" description="仅在你明确开始后，后端才会生成并保存标准作品导览。" actionLabel="生成作品导览" onAction={onGenerate} />;
  }
  if (state === "generating") return <StatePanel compact kind="loading" title="后端正在生成作品导览" description="请求使用真实同步 Guide 契约，请保持页面开启。" />;
  if (state === "error") return <StatePanel compact kind="error" title="作品导览暂不可用" description={error || undefined} actionLabel="重试读取" onAction={onRetry} />;
  if (!guide) return null;

  const sections = Object.entries(guide.sections).filter(
    (entry): entry is [keyof PaintingGuide["sections"], string] => Boolean(entry[1]),
  );

  return (
    <div className="guide-result">
      <div className="guide-summary"><span>{guide.cacheStatus === "GENERATED" ? "新生成" : "已有导览"}</span><p>{guide.summary}</p></div>
      {guide.highlights.length ? <ul className="guide-highlights">{guide.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul> : null}
      <div className="guide-sections">
        {sections.map(([key, value]) => <article key={key}><h3>{sectionLabels[key]}</h3><p>{value}</p></article>)}
      </div>
      {guide.knowledgeReferences.length ? (
        <div className="guide-references"><h3>知识依据</h3><ul>{guide.knowledgeReferences.map((reference) => <li key={`${reference.sourceType}:${reference.sourceId}`}>{reference.title} <span>{reference.sourceType}</span></li>)}</ul></div>
      ) : null}
      <p className="guide-time">更新于 {new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(guide.updatedAt))}</p>
    </div>
  );
}
