import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, preflight } from "@/lib/fb-tool/cors.server";
import { requireApiKey } from "@/lib/fb-tool/auth.server";

// Proxy agents (HTTP/SOCKS) aren't supported on Cloudflare Workers.
// Report that cleanly so the client-side UI can show a hint; we still
// accept and record the attempt for compatibility with the old bookmarklet.
export const Route = createFileRoute("/api/public/check-proxy")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => preflight(request),
      POST: async ({ request }) => {
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          /* empty */
        }
        const auth = await requireApiKey(request, body);
        if (!auth.ok) return jsonResponse(request, { ok: false, error: auth.error }, { status: 401 });
        return jsonResponse(request, {
          ok: false,
          error: "البروكسيات اليدوية غير مدعومة على هذه المنصة — استخدم الدولة (BrightData Web Unlocker)",
          type: null,
        });
      },
    },
  },
});
