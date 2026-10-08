import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, preflight } from "@/lib/fb-tool/cors.server";

export const Route = createFileRoute("/api/public/ping")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => preflight(request),
      GET: ({ request }) =>
        jsonResponse(request, { ok: true, time: new Date().toISOString() }),
    },
  },
});
