import type { Metadata } from "next";
import Link from "next/link";

import { ArrowIcon } from "@/components/icons";
import { HomeHero } from "@/components/home-hero";

export const metadata: Metadata = { title: "首页" };

const features = [
  { href: "/gallery", title: "画廊", description: "浏览真实后端目录、每日推荐与作品详情。", status: "已接入" },
  { href: "/studio", title: "创作工坊", description: "能力与工作流将在下一轮按后端就绪状态接入。", status: "正在接入" },
  { href: "/knowledge", title: "知识库", description: "知识库产品浏览与搜索后端尚未开放。", status: "暂未开放" },
  { href: "/community", title: "社区", description: "社区发布、互动与内容后端尚未开放。", status: "暂未开放" },
  { href: "/assistant", title: "助手", description: "通用对话助手不属于当前已验证后端能力。", status: "暂未开放" },
  { href: "/about", title: "关于", description: "了解 ArtLIVE 画智体的产品边界与设计方向。", status: "了解项目" },
] as const;

export default function HomePage() {
  return (
    <main className="home-page">
      <HomeHero />
      <section className="home-features page-shell" id="home-features" aria-labelledby="feature-title">
        <div className="section-heading">
          <h2 id="feature-title">从一幅画，进入文化世界</h2>
          <p>每一处可操作内容都来自当前已验证的 ArtLIVE 后端；未完成能力保持清晰状态。</p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <Link className="feature-card glass-panel" href={feature.href} key={feature.href}>
              <div>
                <span className="feature-status">{feature.status}</span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
              <ArrowIcon />
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
