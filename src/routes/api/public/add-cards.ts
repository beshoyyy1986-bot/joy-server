import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, preflight } from "@/lib/fb-tool/cors.server";
import { requireApiKey } from "@/lib/fb-tool/auth.server";
import { addCards } from "@/lib/fb-tool/core.server";

export const Route = createFileRoute("/api/public/add-cards")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => preflight(request),
      POST: async ({ request }) => {
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return jsonResponse(request, { ok: false, error: "Invalid JSON body" }, { status: 400 });
        }
        const auth = await requireApiKey(request, body);
        if (!auth.ok) return jsonResponse(request, { ok: false, error: auth.error }, { status: 401 });
        try {
          const session = body["session"] as Record<string, unknown> | undefined;
          const cards = (body["cards"] as Array<{ sharedId: string; label?: string }>) || [];
          if (!session?.["cookies"]) {
            return jsonResponse(request, { error: "cookies مفقودة" }, { status: 400 });
          }
          const result = await addCards({
            // deno-lint-ignore no-explicit-any
            session: session as any,
            cards,
            delaySec: Number(body["delaySec"] ?? 1),
            country: body["country"] ? String(body["country"]) : undefined,
          });
          const proxyLabel = process.env["BRIGHT_DATA_KEY"]
            ? `BrightData Web Unlocker${body["country"] ? ` (${body["country"]})` : ""}`
            : "بدون بروكسي";
          return jsonResponse(request, { ...result, proxyUsed: proxyLabel });
        } catch (err) {
          return jsonResponse(request, { ok: false, error: (err as Error).message });
        }
      },
    },
  },
});
