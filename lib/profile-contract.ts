import type { UserProfile } from "./types.ts";

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}无效`);
  }
  return value as JsonRecord;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label}无效`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return requiredString(value, label);
}

function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${label}无效`);
  }
  return value;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/**
 * Spring's current UserProfileResponse serializes LocalDateTime as
 * [year, month, day, hour, minute, second?, nanosecond?].  Normalize that
 * transport shape at the boundary so UI code only receives valid strings.
 */
export function parseProfileDateTime(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    if (Number.isNaN(new Date(value).getTime())) throw new Error(`${label}无效`);
    return value;
  }
  if (!Array.isArray(value) || value.length < 5 || value.length > 7) {
    throw new Error(`${label}无效`);
  }

  const [rawYear, rawMonth, rawDay, rawHour, rawMinute, rawSecond = 0, rawNanosecond = 0] = value;
  const year = integer(rawYear, label);
  const month = integer(rawMonth, label);
  const day = integer(rawDay, label);
  const hour = integer(rawHour, label);
  const minute = integer(rawMinute, label);
  const second = integer(rawSecond, label);
  const nanosecond = integer(rawNanosecond, label);
  if (month < 1 || month > 12 || day < 1 || hour < 0 || hour > 23 || minute < 0 || minute > 59
    || second < 0 || second > 59 || nanosecond < 0 || nanosecond > 999_999_999) {
    throw new Error(`${label}无效`);
  }

  const millisecond = Math.floor(nanosecond / 1_000_000);
  const checked = new Date(0);
  checked.setUTCFullYear(year, month - 1, day);
  checked.setUTCHours(hour, minute, second, millisecond);
  if (
    checked.getUTCFullYear() !== year
    || checked.getUTCMonth() !== month - 1
    || checked.getUTCDate() !== day
    || checked.getUTCHours() !== hour
    || checked.getUTCMinutes() !== minute
    || checked.getUTCSeconds() !== second
  ) {
    throw new Error(`${label}无效`);
  }

  const base = `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
  return millisecond ? `${base}.${pad(millisecond, 3)}` : base;
}

export function parseUserProfile(value: unknown): UserProfile {
  const source = record(value, "用户资料响应");
  return {
    id: integer(source.id, "用户 ID"),
    username: requiredString(source.username, "用户名"),
    fullName: nullableString(source.fullName, "姓名"),
    email: requiredString(source.email, "邮箱"),
    createdAt: parseProfileDateTime(source.createdAt, "注册时间"),
    updatedAt: parseProfileDateTime(source.updatedAt, "更新时间"),
  };
}

export function formatProfileDate(value: string | null): string {
  if (!value) return "未详";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未详";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date);
}
