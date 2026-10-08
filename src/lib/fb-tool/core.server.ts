// Core Facebook BM logic ported from the Express server to Cloudflare Workers.
// Uses global fetch — no node agents, no socks/https proxies.
// BrightData Web Unlocker is supported for country/location routing.

export const SESSION_ORIGIN = "https://business.facebook.com";

export const BSH_COUNTRIES: Array<[string, string]> = [
  ["US", "الولايات المتحدة الأمريكية"],
  ["GB", "المملكة المتحدة"],
  ["DE", "ألمانيا"],
  ["FR", "فرنسا"],
  ["RU", "روسيا"],
  ["SE", "السويد"],
  ["CY", "قبرص"],
  ["NG", "نيجيريا"],
  ["BE", "بلجيكا"],
  ["PK", "باكستان"],
  ["QA", "قطر"],
  ["SA", "السعودية"],
  ["AE", "الإمارات"],
  ["JO", "الأردن"],
  ["EG", "مصر"],
  ["TR", "تركيا"],
  ["IN", "الهند"],
  ["BR", "البرازيل"],
  ["CA", "كندا"],
  ["AU", "أستراليا"],
];
export const COUNTRY_LABEL: Record<string, string> = Object.fromEntries(BSH_COUNTRIES);

const SESSION_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ar,en-US;q=0.7,en;q=0.3",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

// ─── BrightData Web Unlocker (optional, supports country) ───────────────────
function brightDataKey() {
  return process.env["BRIGHT_DATA_KEY"] || "";
}
function brightDataZone() {
  return process.env["BRIGHT_DATA_ZONE"] || "web_unlocker1";
}

async function brightDataFetch(url: string, options: RequestInit & { body?: string } = {}, country = "") {
  const key = brightDataKey();
  const payload: Record<string, unknown> = {
    zone: brightDataZone(),
    url,
    format: "raw",
    method: options.method || "GET",
  };
  if (country) payload["country"] = country.toLowerCase();
  if (options.headers) {
    const h: Record<string, string> = {};
    new Headers(options.headers as HeadersInit).forEach((v, k) => (h[k] = v));
    payload["headers"] = h;
  }
  if (options.body) payload["body"] = options.body;
  return fetch("https://api.brightdata.com/request", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function routedFetch(
  url: string,
  options: RequestInit = {},
  country = "",
): Promise<Response> {
  const useBright = !!brightDataKey() && (country || process.env["USE_BRIGHT_DATA"] !== "false");
  if (useBright) {
    try {
      return await brightDataFetch(url, options as RequestInit & { body?: string }, country);
    } catch (err) {
      console.log("BrightData failed, direct fallback:", (err as Error).message);
    }
  }
  return fetch(url, options);
}

// ─── Cookie / URL / HTML parsers ────────────────────────────────────────────
export function extractUserIdFromCookies(cookieStr: string): string {
  const m = String(cookieStr || "").match(/(?:^|;\s*)c_user=([^;]+)/);
  return m ? m[1].trim() : "";
}

function extractDtsgFromCookies(cookieStr: string): string {
  const s = String(cookieStr || "");
  for (const name of ["fb_dtsg", "dtsg_ag", "dtsg"]) {
    const m = s.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    if (m) {
      try {
        return decodeURIComponent(m[1].trim());
      } catch {
        return m[1].trim();
      }
    }
  }
  return "";
}

export function parseBillingUrl(url: string): { businessId: string; adAccountId: string } {
  let businessId = "";
  let adAccountId = "";
  if (!url) return { businessId, adAccountId };
  try {
    const u = new URL(url);
    businessId = u.searchParams.get("business_id") || "";
    for (const p of ["act", "act_id", "ad_account_id", "account_id", "aaid", "asset_id", "payment_account_id"]) {
      const v = u.searchParams.get(p);
      if (v) {
        adAccountId = v.replace(/^act_/i, "");
        break;
      }
    }
    if (!adAccountId) {
      const pm = u.pathname.match(/act_(\d+)/);
      if (pm) adAccountId = pm[1];
    }
  } catch {
    /* ignore */
  }
  if (!businessId) {
    const m = url.match(/[?&]business_id=(\d+)/);
    if (m) businessId = m[1];
  }
  if (!adAccountId) {
    const m = url.match(/act_(\d+)/);
    if (m) adAccountId = m[1];
  }
  if (!adAccountId) {
    const m = url.match(/[?&](?:account_id|asset_id|payment_account_id)=(\d+)/);
    if (m) adAccountId = m[1];
  }
  return { businessId, adAccountId };
}

function _first(str: string, patterns: RegExp[], filter?: (v: string) => boolean) {
  if (!str) return null;
  for (const p of patterns) {
    const m = str.match(p);
    if (m?.[1]) {
      const val = m[1].trim();
      if (!filter || filter(val)) return val;
    }
  }
  return null;
}

function parseDtsg(html: string) {
  if (!html) return "";
  const notEaa = (v: string) => !!v && !v.startsWith("EAA");
  return (
    _first(
      html,
      [
        /DTSGInitialData[^}]{0,300}"token"\s*:\s*"([^"]{8,100})"/,
        /"DTSGInitialData"[^}]{0,300}"token"\s*:\s*"([^"]{8,100})"/,
        /"dtsg"\s*:\s*\{\s*"token"\s*:\s*"([^"]+)"/,
        /name="fb_dtsg"\s+value="([^"]+)"/,
        /name="fb_dtsg"\s+value='([^']+)'/,
        /"fb_dtsg"\s*,\s*"[^"]*"\s*,\s*"([^"]+)"/,
        /"s"\s*:\s*"fb_dtsg"\s*,\s*"v"\s*:\s*"([^"]+)"/,
        /"token"\s*:\s*"(NA[A-Za-z0-9_-]{6,}[A-Za-z0-9_-]+)"/,
        /"fb_dtsg"\s*:\s*"([A-Za-z0-9_-]{8,})"/,
        /__DTSG\s*=\s*['"]([A-Za-z0-9_-]+)['"]/,
        /"token"\s*:\s*"([A-Za-z0-9_-]{12,80})"/,
      ],
      notEaa,
    ) || ""
  );
}

function parseLsd(html: string) {
  if (!html) return "";
  return (
    _first(html, [
      /\["LSD",\[\d+\],\{"token":"([^"]+)"\}\]/,
      /\["LSD",\[\d+\],\{token:"([^"]+)"\}\]/,
      /"lsd"\s*:\s*"([^"]+)"/,
      /name="lsd"\s+value="([^"]+)"/,
      /"lsdToken"\s*:\s*"([^"]+)"/,
      /\["LSD",[^\]]*,"([A-Za-z0-9_-]{4,20})"\]/,
      /<meta\s+name="lsd"\s+content="([^"]+)"/,
    ]) || ""
  );
}

function extractFromAllScripts(html: string) {
  if (!html) return { dtsg: "", lsd: "" };
  const blocks = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
  const joined = blocks
    .map((s) => {
      const m = s.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
      return m ? m[1] : "";
    })
    .join("\n");
  return {
    dtsg: parseDtsg(joined) || parseDtsg(html),
    lsd: parseLsd(joined) || parseLsd(html),
  };
}

// ─── Session resolver ───────────────────────────────────────────────────────
export async function serverSideSession(cookies: string, pageUrl: string, country = "") {
  const userId = extractUserIdFromCookies(cookies);
  if (!userId) throw new Error("لم يتم العثور على c_user في الكوكيز — يجب تسجيل الدخول أولاً");

  const bId = parseBillingUrl(pageUrl).businessId;
  const urls = [
    pageUrl,
    bId && `${SESSION_ORIGIN}/latest/billing_hub/?business_id=${bId}`,
    bId && `${SESSION_ORIGIN}/latest/billing_hub/payment_accounts/?business_id=${bId}`,
    bId && `${SESSION_ORIGIN}/billing_hub/payment_accounts/?business_id=${bId}`,
    `${SESSION_ORIGIN}/settings/billing/payment_methods/`,
    `${SESSION_ORIGIN}/billing_hub/`,
    bId && `${SESSION_ORIGIN}/overview?business_id=${bId}`,
    `${SESSION_ORIGIN}/`,
    "https://www.facebook.com/",
    "https://adsmanager.facebook.com/adsmanager/",
  ].filter(Boolean) as string[];

  let dtsg = "";
  let lsd = "";
  for (const url of [...new Set(urls)]) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      let resp: Response;
      try {
        resp = await routedFetch(
          url,
          {
            method: "GET",
            headers: { ...SESSION_HEADERS, Cookie: cookies, Referer: SESSION_ORIGIN },
            redirect: "follow",
            signal: ctrl.signal,
          },
          country,
        );
      } finally {
        clearTimeout(timer);
      }
      const finalUrl = resp.url || url;
      if (/login|checkpoint|recover|disabled/i.test(finalUrl)) continue;
      if (resp.status < 200 || resp.status >= 400) continue;
      const html = await resp.text();
      const fromHtml = { dtsg: parseDtsg(html), lsd: parseLsd(html) };
      const fromScripts = !fromHtml.dtsg || !fromHtml.lsd ? extractFromAllScripts(html) : fromHtml;
      dtsg = dtsg || fromHtml.dtsg || fromScripts.dtsg;
      lsd = lsd || fromHtml.lsd || fromScripts.lsd;
      if (dtsg && lsd) break;
    } catch (err) {
      console.log("[session] error:", (err as Error).message);
    }
  }
  if (!dtsg) {
    const ck = extractDtsgFromCookies(cookies);
    if (ck) dtsg = ck;
  }
  if (!dtsg) {
    throw new Error(
      "تعذّر استخراج fb_dtsg — تأكد من: (1) أنك فاتح business.facebook.com, (2) الكوكيز لم تنته, (3) الحساب غير موقوف",
    );
  }
  return { dtsg, lsd, userId };
}

// ─── GraphQL helpers ────────────────────────────────────────────────────────
function fbHeaders(cookies: string, extra: Record<string, string> = {}) {
  return {
    "sec-ch-ua": '"Google Chrome";v="120", "Chromium";v="120", "Not?A_Brand";v="8"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "x-fb-friendly-name": extra["x-fb-friendly-name"] || "GraphQL",
    "x-fb-lsd": extra["x-fb-lsd"] || "",
    "content-type": "application/x-www-form-urlencoded",
    "x-requested-with": "XMLHttpRequest",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    accept: "*/*",
    origin: "https://business.facebook.com",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
    referer: "https://business.facebook.com/",
    "accept-language": "en-US,en;q=0.9",
    cookie: cookies,
    ...extra,
  };
}

async function fbGraphql(
  params: Record<string, string | number>,
  cookies: string,
  lsd: string,
  country = "",
) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.append(k, String(v));
  const headers = fbHeaders(cookies, {
    "x-fb-friendly-name": String(params["fb_api_req_friendly_name"] || "GraphQL"),
    "x-fb-lsd": lsd || "",
  });
  const resp = await routedFetch(
    `${SESSION_ORIGIN}/api/graphql/`,
    { method: "POST", headers, body: body.toString() },
    country,
  );
  const text = await resp.text();
  const clean = text.replace(/^for\s*\(;;\s*\);?/, "");
  try {
    return JSON.parse(clean);
  } catch {
    return { _raw: text.slice(0, 300), errors: [{ message: "استجابة غير صالحة من Facebook" }] };
  }
}

// ─── fetchCards ─────────────────────────────────────────────────────────────
export async function fetchCards(opts: {
  cookies: string;
  businessId: string;
  adAccountId?: string;
  pageUrl?: string;
  country?: string;
}) {
  const { cookies, businessId, pageUrl = "", country = "" } = opts;
  if (!cookies) return { ok: false as const, error: "الكوكيز مطلوبة" };
  if (!businessId) return { ok: false as const, error: "business_id مطلوب" };

  const startUrl = pageUrl || `${SESSION_ORIGIN}/latest/billing_hub/?business_id=${businessId}`;
  const session = await serverSideSession(cookies, startUrl, country);
  const { dtsg: fb_dtsg, lsd, userId } = session;

  let adId = opts.adAccountId || "";
  if (!adId && pageUrl) adId = parseBillingUrl(pageUrl).adAccountId;
  if (!adId) {
    return {
      ok: false as const,
      error: "تعذّر استخراج معرّف الحساب (account_id / asset_id) من رابط الصفحة",
    };
  }

  const r1 = await fbGraphql(
    {
      av: userId,
      __user: userId,
      __bid: businessId,
      __aaid: adId,
      fb_dtsg,
      lsd,
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: "BillingHubPaymentMethodsViewQuery",
      variables: JSON.stringify({ businessID: businessId }),
      doc_id: "23945721255021756",
    },
    cookies,
    lsd,
    country,
  );
  const payAccountId: string | undefined = r1?.data?.business?.billing_payment_account?.id;
  if (!payAccountId) {
    const msg = r1?.errors?.[0]?.message || r1?._raw || "لم يتم العثور على حساب الفوترة";
    return { ok: false as const, error: `حساب الفوترة غير موجود: ${msg}` };
  }

  const r2 = await fbGraphql(
    {
      av: userId,
      __user: userId,
      __bid: businessId,
      __aaid: adId,
      fb_dtsg,
      lsd,
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: "BillingHubPaymentMethodsBusinessSectionQuery",
      variables: JSON.stringify({
        paymentAccountID: payAccountId,
        billable_account_types: ["FB_ADS", "WHATSAPP"],
        connected_asset_limit: 26,
        connected_asset_detail_limit: 5,
      }),
      doc_id: "24585166657733775",
    },
    cookies,
    lsd,
    country,
  );
  const methods: Array<{ credential: Record<string, unknown> }> | undefined =
    r2?.data?.payment_account?.billing_payment_methods;
  if (!methods || methods.length === 0) {
    const msg = r2?.errors?.[0]?.message || "لا توجد بطاقات مرتبطة بهذا الـ BM";
    return { ok: false as const, error: msg };
  }

  const cards = methods
    .map((m) => {
      const c = m.credential as Record<string, unknown>;
      return {
        ...c,
        sharedId: c["credential_id"] as string,
        name: (c["card_association_name"] as string) || "",
        last4: (c["last_four_digits"] as string) || "",
      };
    })
    .filter((c) => !!c.sharedId);

  if (!cards.length) return { ok: false as const, error: "لا توجد بطاقات مشتركة متاحة" };

  return {
    ok: true as const,
    cards,
    session: { userId, businessId, adAccountId: adId, payAccountId, fb_dtsg, lsd, cookies },
  };
}

// ─── addSharedCard ──────────────────────────────────────────────────────────
export async function addSharedCard(
  params: {
    user: string;
    ad: string;
    bm: string;
    token: string;
    sharedId: string;
    cookies: string;
    lsd: string;
  },
  country = "",
) {
  const { user, ad, bm, token, sharedId, cookies, lsd } = params;
  const now = Date.now();
  const uuid1 = Math.random().toString(36).slice(2, 11);
  const uuid2 = Math.random().toString(36).slice(2, 11);
  const extId = `upl_${now}_${uuid1}`;
  const sessId = `upl_${now}_${uuid2}`;
  const wizardSess = `upl_wizard_${now}_${uuid2}`;
  const vars = {
    input: {
      payment_legacy_account_id: ad,
      shared_biz_credential_id: sharedId,
      upl_logging_data: {
        context: "billingaddpm",
        credential_id: sharedId,
        credential_type: "CREDIT_CARD",
        entry_point: "BILLING_HUB",
        external_flow_id: extId,
        target_name: "BillingSaveSharedBizCardStateMutation",
        user_session_id: sessId,
        wizard_config_name: "SELECT_PAYMENT_METHOD",
        wizard_name: "ADD_PM_PUX_EP",
        wizard_session_id: wizardSess,
      },
      actor_id: user,
      client_mutation_id: String(Date.now()),
    },
    includeCreateNewFromOldFragment: false,
  };
  const body = new URLSearchParams();
  body.append("av", user);
  body.append("__user", user);
  body.append("__bid", bm);
  body.append("__aaid", ad);
  body.append("fb_dtsg", token);
  body.append("lsd", lsd || "");
  body.append("fb_api_caller_class", "RelayModern");
  body.append("fb_api_req_friendly_name", "BillingSaveSharedBizCardStateMutation");
  body.append("variables", JSON.stringify(vars));
  body.append("doc_id", "25126279877041501");

  const response = await routedFetch(
    "https://business.facebook.com/api/graphql/",
    {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ar,en-US;q=0.7",
        Cookie: cookies,
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: "https://business.facebook.com",
        "X-FB-LSD": lsd || "",
        "X-FB-Friendly-Name": "BillingSaveSharedBizCardStateMutation",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
      },
      body: body.toString(),
    },
    country,
  );
  const text = await response.text();
  const clean = text.replace(/^for\s*\(;;\s*\);?/, "");
  let json: { errors?: Array<{ message?: string }>; data?: Record<string, unknown> };
  try {
    json = JSON.parse(clean);
  } catch {
    throw new Error(`استجابة غير صالحة: ${text.slice(0, 200)}`);
  }
  if (json.errors) {
    throw new Error(json.errors[0]?.message || "فشل غير معروف");
  }
  const d = json.data as Record<string, unknown> | undefined;
  const cardResult = d?.["xfb_billing_save_shared_biz_card"] ?? d?.["billing_save_shared_biz_card"];
  if (!cardResult) throw new Error("استجابة غير متوقعة: " + text.slice(0, 200));
  return json;
}

export async function addCards(opts: {
  session: {
    userId?: string;
    user?: string;
    adAccountId?: string;
    ad?: string;
    businessId?: string;
    bm?: string;
    fb_dtsg?: string;
    token?: string;
    lsd?: string;
    cookies: string;
  };
  cards: Array<{ sharedId: string; label?: string }>;
  delaySec?: number;
  country?: string;
}) {
  const { session, cards, delaySec = 1, country = "" } = opts;
  if (!session?.cookies) throw new Error("cookies مفقودة");
  const user = session.userId || session.user || "";
  const ad = session.adAccountId || session.ad || "";
  const bm = session.businessId || session.bm || "";
  const token = session.fb_dtsg || session.token || "";
  const lsd = session.lsd || "";
  const cookies = session.cookies;

  const results: Array<{ sharedId: string; label?: string; success: boolean; error?: string }> = [];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    try {
      await addSharedCard({ user, ad, bm, token, sharedId: card.sharedId, cookies, lsd }, country);
      results.push({ sharedId: card.sharedId, label: card.label, success: true });
    } catch (err) {
      results.push({
        sharedId: card.sharedId,
        label: card.label,
        success: false,
        error: (err as Error).message,
      });
    }
    if (i < cards.length - 1 && delaySec > 0) {
      await new Promise((r) => setTimeout(r, delaySec * 1000));
    }
  }
  return {
    results,
    successCount: results.filter((r) => r.success).length,
    total: cards.length,
  };
}

// ─── API key helpers ────────────────────────────────────────────────────────
export interface ApiKey {
  id: string;
  key: string;
  label: string;
  enabled: boolean;
  createdAt: string;
  expiresAt: string | null;
  maxUsage: number | null;
  usageCount: number;
  lastUsed: string | null;
}

export function generateApiKey(): string {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return "bsh_" + Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isKeyValid(k: ApiKey | undefined | null): boolean {
  if (!k || !k.enabled) return false;
  const now = Date.now();
  if (k.expiresAt && new Date(k.expiresAt).getTime() < now) return false;
  if (k.maxUsage != null && k.usageCount >= k.maxUsage) return false;
  return true;
}

export function constantTimeEqual(a: string, b: string): boolean {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
