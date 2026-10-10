"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useFavorites } from "@/components/favorite-provider";
import { PaintingCard } from "@/components/painting-card";
import { useSession } from "@/components/session-provider";
import { StatePanel } from "@/components/state-panel";
import { api, ApiError, errorMessage } from "@/lib/api";
import { formatProfileDate } from "@/lib/profile-contract";
import type { PaintingPage, PaintingSummary, UserProfile } from "@/lib/types";

export function MeScreen() {
  const router = useRouter();
  const { token, sessionIdentity, signOut, signOutIfCurrent, isCurrentSession } = useSession();
  const { isFavorited, isFavoriteBusy, toggleFavorite } = useFavorites();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [favorites, setFavorites] = useState<PaintingPage | null>(null);
  const [pageNumber, setPageNumber] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((caught: unknown) => {
    if (caught instanceof ApiError && caught.kind === "unauthorized") signOutIfCurrent(sessionIdentity);
    setError(errorMessage(caught));
  }, [sessionIdentity, signOutIfCurrent]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([api.profile(token), api.favoritePaintings(pageNumber, 12, token)])
      .then(([profileResult, favoriteResult]) => {
        if (!active) return;
        setProfile(profileResult);
        setFavorites(favoriteResult);
      })
      .catch((caught) => {
        if (active) handleError(caught);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [handleError, pageNumber, token]);

  const removeFavorite = async (painting: PaintingSummary) => {
    if (!token) return;
    const requestToken = token;
    const requestIdentity = sessionIdentity;
    setError(null);
    try {
      await toggleFavorite(painting.paintingId, isFavorited(painting.paintingId, painting.favorited));
      if (!isCurrentSession(requestIdentity)) return;
      const refreshed = await api.favoritePaintings(pageNumber, 12, requestToken);
      if (!isCurrentSession(requestIdentity)) return;
      setFavorites(refreshed);
      if (refreshed.items.length === 0 && pageNumber > 0) setPageNumber((current) => current - 1);
    } catch (caught) {
      if (!isCurrentSession(requestIdentity)) return;
      handleError(caught);
    }
  };

  const logout = () => {
    signOut();
    router.push("/");
  };

  const displayedFavorites = favorites?.items.filter(
    (painting) => isFavorited(painting.paintingId, painting.favorited),
  ) ?? [];

  if (loading) return <StatePanel kind="loading" title="正在读取个人空间" />;
  if (error && !profile) return <StatePanel kind="error" title="个人空间加载失败" description={error} />;
  if (!profile) return null;

  return (
    <div className="me-layout">
      <aside className="me-sidebar glass-panel">
        <span className="me-avatar" aria-hidden="true">{(profile.fullName || profile.username).slice(0, 1)}</span>
        <h1>{profile.fullName || profile.username}</h1>
        <p>@{profile.username}</p>
        <dl>
          <div><dt>收藏</dt><dd>{favorites?.totalElements ?? 0}</dd></div>
          <div><dt>账号 ID</dt><dd>{profile.id}</dd></div>
        </dl>
        <button className="button button-wide" type="button" onClick={logout}>退出登录</button>
      </aside>

      <div className="me-content">
        <section className="profile-panel glass-panel" aria-labelledby="profile-title">
          <div className="section-heading section-heading-left"><h2 id="profile-title">账号信息</h2><p>以下信息由当前登录用户接口返回。</p></div>
          <dl className="profile-facts">
            <div><dt>用户名</dt><dd>{profile.username}</dd></div>
            <div><dt>姓名</dt><dd>{profile.fullName || "未填写"}</dd></div>
            <div><dt>邮箱</dt><dd>{profile.email}</dd></div>
            {profile.createdAt ? <div><dt>注册时间</dt><dd>{formatProfileDate(profile.createdAt)}</dd></div> : null}
          </dl>
          <div className="profile-unavailable"><strong>资料与头像编辑</strong><span>暂未开放</span></div>
        </section>

        <section className="favorites-panel" aria-labelledby="favorites-title">
          <div className="section-heading section-heading-left"><h2 id="favorites-title">我的收藏</h2><p>取消收藏会立即调用真实后端并刷新列表。</p></div>
          {error ? <p className="inline-error" role="alert">{error}</p> : null}
          {favorites && displayedFavorites.length ? (
            <>
              <div className="painting-grid me-painting-grid">
                {displayedFavorites
                  .map((painting) => <PaintingCard key={painting.paintingId} painting={{ ...painting, favorited: isFavorited(painting.paintingId, painting.favorited) }} authenticated favoriteBusy={isFavoriteBusy(painting.paintingId)} onFavorite={removeFavorite} />)}
              </div>
              <nav className="pagination" aria-label="收藏分页">
                <button className="button" type="button" disabled={favorites.first} onClick={() => setPageNumber((current) => Math.max(0, current - 1))}>上一页</button>
                <span>第 {favorites.page + 1} / {Math.max(favorites.totalPages, 1)} 页</span>
                <button className="button" type="button" disabled={favorites.last} onClick={() => setPageNumber((current) => current + 1)}>下一页</button>
              </nav>
            </>
          ) : <StatePanel kind="empty" title="还没有收藏作品" description="去画廊发现喜欢的作品吧。" actionLabel="前往画廊" actionHref="/gallery" />}
        </section>

        <section className="me-unavailable-grid">
          <section className="me-creation-link glass-panel">
            <div><h2>我的作品</h2><p>真实 Creation 列表、状态与结果已在创作工坊接入。</p></div>
            <Link className="button" href="/studio">前往创作工坊</Link>
          </section>
          <StatePanel compact kind="unavailable" title="帖子与点赞" description="社区后端尚未开放。" />
        </section>
      </div>
    </div>
  );
}
