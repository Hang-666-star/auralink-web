"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ArrowIcon, HeartIcon } from "@/components/icons";
import { useFavorites } from "@/components/favorite-provider";
import { MediaImage } from "@/components/media-image";
import { useSession } from "@/components/session-provider";
import { StatePanel } from "@/components/state-panel";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { PaintingDetail } from "@/lib/types";

export function PaintingDetailScreen({ paintingId }: { paintingId: string }) {
  const { token, sessionIdentity, signOutIfCurrent, isCurrentSession } = useSession();
  const { isFavorited, isFavoriteBusy, toggleFavorite: toggleSessionFavorite } = useFavorites();
  const [painting, setPainting] = useState<PaintingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleAuthError = useCallback((caught: unknown) => {
    if (caught instanceof ApiError && caught.kind === "unauthorized") signOutIfCurrent(sessionIdentity);
  }, [sessionIdentity, signOutIfCurrent]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    setError(null);
    void api.painting(paintingId, token).then((result) => {
      if (active) setPainting(result);
    }).catch((caught) => {
      if (!active) return;
      handleAuthError(caught);
      setError(errorMessage(caught));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [handleAuthError, paintingId, token]);

  const toggleFavorite = async () => {
    if (!painting || !token) return;
    const requestIdentity = sessionIdentity;
    setError(null);
    try {
      const favorited = await toggleSessionFavorite(paintingId, isFavorited(paintingId, painting.favorited));
      if (isCurrentSession(requestIdentity)) setPainting((current) => current ? { ...current, favorited } : current);
    } catch (caught) {
      if (!isCurrentSession(requestIdentity)) return;
      if (caught instanceof ApiError && caught.kind === "unauthorized") {
        signOutIfCurrent(requestIdentity);
        return;
      }
      setError(errorMessage(caught));
    }
  };

  if (loading) return <StatePanel kind="loading" title="正在展开作品详情" />;
  if (error && !painting) return <StatePanel kind="error" title="作品详情加载失败" description={error} actionLabel="返回画廊" actionHref="/gallery" />;
  if (!painting) return <StatePanel kind="empty" title="作品不存在或当前不可用" actionLabel="返回画廊" actionHref="/gallery" />;

  const favorited = isFavorited(painting.paintingId, painting.favorited);
  const facts: Array<[string, string | null]> = [
    ["目录序号", painting.sourceSequence],
    ["图像标识", painting.imageStorageName],
    ["年代", painting.creationDynastyNormalized || painting.creationDynastyRaw],
    ["创作年代", painting.creationYear],
    ["作者生年", painting.authorBirthYear],
    ["作者籍贯", painting.authorBirthPlace],
    ["作者师承", painting.authorSchool],
    ["尺寸", painting.actualSize],
    ["馆藏", painting.collectionInstitution],
    ["分类", painting.category],
    ["题材", painting.subject],
    ["画派", painting.paintingSchool],
    ["风格", painting.style],
    ["材质", painting.paintingMaterial],
    ["设色", painting.color],
    ["构图", painting.composition],
    ["笔法", painting.brushwork],
    ["墨法", painting.inkMethod],
    ["颜料", painting.pigment],
    ["钤印", painting.seal],
    ["文化意象", painting.culturalSymbol],
    ["收藏平台", painting.collectionPlatform],
  ];

  return (
    <div className="detail-layout">
      <section className="detail-artwork">
        <div className="detail-media glass-panel"><MediaImage image={painting.image} alt={painting.title || "无题画作"} /></div>
        <div className="detail-actions">
          <Link className="button" href="/gallery"><ArrowIcon direction="left" /> 返回画廊</Link>
          <button className={`button${favorited ? " button-primary" : ""}`} type="button" disabled={isFavoriteBusy(painting.paintingId)} onClick={toggleFavorite}><HeartIcon filled={favorited} /> {favorited ? "已收藏" : "收藏"}</button>
        </div>
        {error ? <p className="inline-error" role="alert">{error}</p> : null}
      </section>

      <section className="detail-info glass-panel">
        <header><span>{painting.creationDynastyNormalized || painting.creationDynastyRaw || "年代未详"}</span><h1>{painting.title || "无题"}</h1><p>{painting.authorName || "佚名"}</p></header>
        {painting.generatedText ? <div className="detail-section"><h2>作品资料</h2><p>{painting.generatedText}</p></div> : null}
        <dl className="fact-grid">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "未详"}</dd></div>)}</dl>
        <StatePanel compact kind="unavailable" title="作品导览暂未开放" description="当前详情仅展示已存储的官方目录资料，不会发起导览生成或任何提供方请求。" />
        <div className="unsupported-row"><div><h2>智能评析</h2><p>暂未开放</p></div><div><h2>导览音频</h2><p>暂未开放</p></div></div>
      </section>
    </div>
  );
}
