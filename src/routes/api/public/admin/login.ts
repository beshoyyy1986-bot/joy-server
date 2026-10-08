import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, preflight } from "@/lib/fb-tool/cors.server";
import { requireAdmin } from "@/lib/fb-tool/auth.server";

// Simple admin-password check — the UI uses it to validate the password
// before showing the dashboard.
export const Route = createFileRoute("/api/public/admin/login")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => preflight(request),
      POST: ({ request }) => {
        const a = requireAdmin(request);
        if (!a.ok) return jsonResponse(request, { ok: false, error: a.error }, { status: 401 });
        return jsonResponse(request, { ok: true });
      },
    },
  },
});
