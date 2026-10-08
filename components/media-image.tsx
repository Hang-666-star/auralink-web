"use client";

import { useEffect, useState } from "react";

import { resolveMediaUrl } from "@/lib/media";
import type { PaintingImage } from "@/lib/types";

type MediaImageProps = {
  image: PaintingImage | null;
  alt: string;
  className?: string;
};

export function MediaImage({ image, alt, className }: MediaImageProps) {
  const [failed, setFailed] = useState(false);
  const source = resolveMediaUrl(image?.contentUrl);

  useEffect(() => setFailed(false), [source]);

  if (!source || failed) {
    return (
      <div className={`media-fallback${className ? ` ${className}` : ""}`} role="img" aria-label={`${alt}：图像暂不可用`}>
        <span aria-hidden="true">画</span>
        <small>图像暂不可用</small>
      </div>
    );
  }

  // The backend returns public logical MediaAsset URLs. A native image element
  // keeps the API origin dynamic without allowing arbitrary remote hosts.
  return <img className={className} src={source} alt={alt} onError={() => setFailed(true)} />;
}
