import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, preflight } from "@/lib/fb-tool/cors.server";
import { requireAdmin } from "@/lib/fb-tool/auth.server";
import { kvGet, kvSet } from "@/lib/fb-tool/storage.server";
import { generateApiKey, type ApiKey } from "@/lib/fb-tool/core.server";

async function getKeys() {
  return kvGet<ApiKey[]>("api_keys", []);
}
async function saveKeys(k: ApiKey[]) {
  await kvSet("api_keys", k);
}

export const Route = createFileRoute("/api/public/admin/keys")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => preflight(request),
      GET: async ({ request }) => {
        const a = requireAdmin(request);
        if (!a.ok) return jsonResponse(request, { error: a.error }, { status: 401 });
        const keys = await getKeys();
        const now = Date.now();
        const list = keys.map((k) => {
          const expMs = k.expiresAt ? new Date(k.expiresAt).getTime() : null;
          const daysLeft = expMs ? Math.max(0, Math.ceil((expMs - now) / 86400000)) : null;
          return {
            id: k.id,
            label: k.label,
            keyPreview: k.key.slice(0, 12) + "…",
            enabled: k.enabled,
            createdAt: k.createdAt,
            expiresAt: k.expiresAt,
            maxUsage: k.maxUsage,
            usageCount: k.usageCount || 0,
            lastUsed: k.lastUsed,
            isExpired: expMs ? expMs < now : false,
            isExhausted: k.maxUsage ? (k.usageCount || 0) >= k.maxUsage : false,
            daysLeft,
          };
        });
        return jsonResponse(request, {
          keys: list,
          total: list.length,
          active: list.filter((k) => k.enabled && !k.isExpired && !k.isExhausted).length,
        });
      },
      POST: async ({ request }) => {
        const a = requireAdmin(request);
        if (!a.ok) return jsonResponse(request, { error: a.error }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const label = String(body["label"] || "مفتاح جديد").slice(0, 80);
        const durationDays = body["durationDays"] ? parseInt(String(body["durationDays"])) : null;
        const expiresAt = body["expiresAt"]
          ? new Date(String(body["expiresAt"])).toISOString()
          : durationDays && durationDays > 0
            ? new Date(Date.now() + durationDays * 86400000).toISOString()
            : null;
        const maxUsage = body["maxUsage"] ? parseInt(String(body["maxUsage"])) : null;
        const newKey: ApiKey = {
          id: "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          key: generateApiKey(),
          label,
          enabled: true,
          createdAt: new Date().toISOString(),
          expiresAt,
          maxUsage,
          usageCount: 0,
          lastUsed: null,
        };
        const keys = await getKeys();
        keys.push(newKey);
        await saveKeys(keys);
        return jsonResponse(request, { ok: true, key: newKey });
      },
      PATCH: async ({ request }) => {
        const a = requireAdmin(request);
        if (!a.ok) return jsonResponse(request, { error: a.error }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const id = String(body["id"] || "");
        const keys = await getKeys();
        const k = keys.find((x) => x.id === id);
        if (!k) return jsonResponse(request, { error: "not found" }, { status: 404 });
        if (body["label"] !== undefined) k.label = String(body["label"]).slice(0, 80);
        if (body["enabled"] !== undefined) k.enabled = !!body["enabled"];
        if (body["expiresAt"] !== undefined)
          k.expiresAt = body["expiresAt"] ? new Date(String(body["expiresAt"])).toISOString() : null;
        if (body["maxUsage"] !== undefined)
          k.maxUsage = body["maxUsage"] ? parseInt(String(body["maxUsage"])) : null;
        if (body["resetUsage"]) {
          k.usageCount = 0;
          k.lastUsed = null;
        }
        if (body["reveal"]) {
          await saveKeys(keys);
          return jsonResponse(request, { ok: true, key: k.key, label: k.label });
        }
        await saveKeys(keys);
        return jsonResponse(request, { ok: true });
      },
      DELETE: async ({ request }) => {
        const a = requireAdmin(request);
        if (!a.ok) return jsonResponse(request, { error: a.error }, { status: 401 });
        const url = new URL(request.url);
        const id = url.searchParams.get("id") || "";
        const keys = await getKeys();
        const next = keys.filter((k) => k.id !== id);
        await saveKeys(next);
        return jsonResponse(request, { ok: next.length < keys.length });
      },
    },
  },
});
