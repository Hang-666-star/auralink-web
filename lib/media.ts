import { API_BASE_URL } from "./config.ts";

const LOGICAL_MEDIA_PATH = /^\/api\/v1\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(content|download)$/i;

export function resolveMediaUrl(value: string | null | undefined): string | null {
  if (!value || !LOGICAL_MEDIA_PATH.test(value)) {
    return null;
  }

  return `${API_BASE_URL}${value}`;
}
