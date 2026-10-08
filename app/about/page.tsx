import type { Metadata } from "next";

import { BrandIcon } from "@/components/icons";

export const metadata: Metadata = { title: "关于" };

const principles = [
  ["真实目录", "作品列表、检索、详情与媒体均来自 Spring Boot 的官方 Painting 与 MediaAsset 契约。"],
  ["边界清晰", "浏览器不连接模型或 Python 服务；供应商、密钥与运行时细节始终留在服务端。"],
  ["诚实可用", "尚无产品后端的社区、助手、知识库与视频能力不会以演示数据代替。"],
  ["循序创作", "创作工作流将在能力发现和异步 Creation 状态契约接入后开放。"],
] as const;

export default function AboutPage() {
  return (
    <main className="page-shell about-page">
      <header className="about-hero glass-panel">
        <span className="about-mark"><BrandIcon width={28} height={28} /></span>
        <h1>ArtLIVE 画智体</h1>
        <p className="about-tagline">让每一幅中国画，成为可以被理解与延续的文化入口</p>
        <div className="about-formula" aria-label="产品方法">
          <span>一画为入口</span><i>·</i><span>知识为依据</span><i>·</i><span>智能为工具</span><i>·</i><span>创作为路径</span>
        </div>
        <p className="about-lead">当前版本专注于可验证的核心路径：身份认证、官方画作浏览、真实媒体、收藏与作品导览。其他能力会在对应后端契约就绪后逐步开放。</p>
      </header>

      <section className="about-section glass-panel" aria-labelledby="principles-title">
        <div className="section-heading section-heading-left">
          <h2 id="principles-title">当前产品原则</h2>
          <p>参考 ArtLIVE 的水墨与通透视觉语言，以真实数据边界重新建立交互。</p>
        </div>
        <div className="principle-grid">
          {principles.map(([title, description]) => <article key={title}><span>{title.slice(0, 1)}</span><h3>{title}</h3><p>{description}</p></article>)}
        </div>
      </section>
    </main>
  );
}
