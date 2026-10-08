// API-key + admin-password auth helpers for the public endpoints.
import { kvGet, kvSet } from "./storage.server";
import { constantTimeEqual, isKeyValid, type ApiKey } from "./core.server";

export async function requireApiKey(request: Request, body: Record<string, unknown> = {}) {
  const raw =
    request.headers.get("x-api-key") ||
    (body["apiKey"] as string | undefined) ||
    new URL(request.url).searchParams.get("apiKey") ||
    "";
  if (!raw) return { ok: false as const, error: "مفتاح API مفقود" };
  const keys = await kvGet<ApiKey[]>("api_keys", []);
  const k = keys.find((x) => x.key === raw);
  if (!k || !isKeyValid(k)) return { ok: false as const, error: "مفتاح API غير صحيح أو منتهي الصلاحية" };
  k.usageCount = (k.usageCount || 0) + 1;
  k.lastUsed = new Date().toISOString();
  await kvSet("api_keys", keys);
  return { ok: true as const, key: k };
}

export function requireAdmin(request: Request): { ok: true } | { ok: false; error: string } {
  const expected = process.env["ADMIN_PASS"] || "";
  if (!expected) return { ok: false, error: "ADMIN_PASS غير مضبوط على السيرفر" };
  const pass =
    request.headers.get("x-admin-pass") ||
    new URL(request.url).searchParams.get("pass") ||
    "";
  if (!constantTimeEqual(pass, expected)) return { ok: false, error: "Unauthorized" };
  return { ok: true };
}
