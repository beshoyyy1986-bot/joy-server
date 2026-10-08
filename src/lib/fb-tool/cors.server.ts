// CORS helper: allow business.facebook.com, chrome-extension://*, and same-origin.
const DEFAULT_ALLOW = ["https://business.facebook.com", "https://www.facebook.com"];

function allowed(origin: string | null): string {
  if (!origin) return "*";
  if (DEFAULT_ALLOW.includes(origin)) return origin;
  if (origin.startsWith("chrome-extension://")) return origin;
  if (origin.endsWith(".facebook.com") || origin.endsWith(".lovable.app") || origin.endsWith(".lovable.dev")) return origin;
  return origin; // Bookmarklet-friendly: echo origin so the browser accepts it.
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": allowed(origin),
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-pass, x-api-key, authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function jsonResponse(request: Request, body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  for (const [k, v] of Object.entries(corsHeaders(request))) headers.set(k, v);
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
