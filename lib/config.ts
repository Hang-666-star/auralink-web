const LOCAL_API_ORIGIN = "http://localhost:5000";

export function normalizeApiBaseUrl(value: string | undefined): string {
  const candidate = value?.trim() || LOCAL_API_ORIGIN;
  let parsed: URL;

  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("NEXT_PUBLIC_API_BASE_URL 必须是有效的 HTTP(S) 地址");
  }

  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL 只允许不含凭据的 HTTP(S) 地址");
  }

  return parsed.toString().replace(/\/$/, "");
}

export const API_BASE_URL = normalizeApiBaseUrl(
  process.env.NEXT_PUBLIC_API_BASE_URL,
);
