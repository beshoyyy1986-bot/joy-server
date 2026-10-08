import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "لوحة الإدارة — AMEX Tool" },
      { name: "description", content: "لوحة إدارة مفاتيح API الخاصة بأداة AMEX Tool." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "لوحة الإدارة — AMEX Tool" },
      { property: "og:description", content: "إدارة مفاتيح API." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

type KeyRow = {
  id: string;
  label: string;
  keyPreview: string;
  enabled: boolean;
  createdAt: string;
  expiresAt: string | null;
  maxUsage: number | null;
  usageCount: number;
  lastUsed: string | null;
  isExpired: boolean;
  isExhausted: boolean;
  daysLeft: number | null;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function AdminPage() {
  const [pass, setPass] = useState<string>("");
  const [authed, setAuthed] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = sessionStorage.getItem("amex_admin_pass");
    if (saved) {
      setPass(saved);
      void verifyPass(saved, true);
    }
  }, []);

  async function verifyPass(p: string, silent = false) {
    setLoggingIn(true);
    setLoginError(null);
    try {
      const r = await fetch("/api/public/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-pass": p },
      });
      const j = await r.json();
      if (j.ok) {
        sessionStorage.setItem("amex_admin_pass", p);
        setAuthed(true);
      } else if (!silent) {
        setLoginError(j.error || "كلمة مرور خاطئة");
      }
    } catch (e) {
      if (!silent) setLoginError("خطأ في الاتصال: " + (e as Error).message);
    } finally {
      setLoggingIn(false);
    }
  }

  if (!authed) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verifyPass(pass);
          }}
          className="w-full max-w-sm bg-slate-900/70 border border-slate-800 rounded-2xl p-7 shadow-xl space-y-4"
        >
          <h1 className="text-2xl font-bold text-indigo-400 text-center">تسجيل دخول الإدارة</h1>
          <p className="text-xs text-slate-400 text-center">AMEX Tool — Admin Panel</p>
          <input
            type="password"
            placeholder="كلمة المرور"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 outline-none focus:border-indigo-500 text-sm"
            autoFocus
          />
          {loginError && <div className="text-red-400 text-xs text-center">{loginError}</div>}
          <button
            type="submit"
            disabled={loggingIn || !pass}
            className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition"
          >
            {loggingIn ? "جارٍ الدخول..." : "دخول"}
          </button>
        </form>
      </div>
    );
  }

  return <KeysPanel pass={pass} onLogout={() => { sessionStorage.removeItem("amex_admin_pass"); setAuthed(false); setPass(""); }} />;
}

function KeysPanel({ pass, onLogout }: { pass: string; onLogout: () => void }) {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newDays, setNewDays] = useState<string>("30");
  const [newMax, setNewMax] = useState<string>("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  async function api(method: string, body?: Record<string, unknown>) {
    const r = await fetch("/api/public/admin/keys" + (method === "DELETE" && body?.["id"] ? `?id=${body["id"]}` : ""), {
      method,
      headers: { "Content-Type": "application/json", "x-admin-pass": pass },
      body: body && method !== "DELETE" ? JSON.stringify(body) : undefined,
    });
    return r.json();
  }

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const j = await api("GET");
      if (j.keys) setKeys(j.keys);
      else setErr(j.error || "فشل التحميل");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    setCreating(true);
    try {
      const j = await api("POST", {
        label: newLabel || "مفتاح جديد",
        durationDays: newDays ? parseInt(newDays) : null,
        maxUsage: newMax ? parseInt(newMax) : null,
      });
      if (j.ok) {
        setRevealed((prev) => ({ ...prev, [j.key.id]: j.key.key }));
        setNewLabel("");
        void load();
      } else alert(j.error || "فشل التوليد");
    } finally {
      setCreating(false);
    }
  }

  async function toggle(k: KeyRow) {
    await api("PATCH", { id: k.id, enabled: !k.enabled });
    void load();
  }
  async function remove(k: KeyRow) {
    if (!confirm(`حذف ${k.label}؟`)) return;
    await api("DELETE", { id: k.id });
    void load();
  }
  async function reveal(k: KeyRow) {
    const j = await api("PATCH", { id: k.id, reveal: true });
    if (j.key) setRevealed((prev) => ({ ...prev, [k.id]: j.key }));
  }
  async function resetUsage(k: KeyRow) {
    await api("PATCH", { id: k.id, resetUsage: true });
    void load();
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-indigo-400">لوحة الإدارة</h1>
            <p className="text-xs text-slate-400 mt-1">AMEX Tool — إدارة مفاتيح API</p>
          </div>
          <button
            onClick={onLogout}
            className="text-xs px-3 py-2 rounded-lg border border-slate-700 hover:border-red-500 hover:text-red-400 transition"
          >
            خروج
          </button>
        </header>

        <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 mb-6">
          <h2 className="font-semibold text-slate-200 mb-3">توليد مفتاح جديد</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              placeholder="اسم المفتاح (مثال: عميل محمد)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
            <input
              type="number"
              placeholder="المدة (أيام)"
              value={newDays}
              onChange={(e) => setNewDays(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
            <input
              type="number"
              placeholder="الحد الأقصى للاستخدام (اختياري)"
              value={newMax}
              onChange={(e) => setNewMax(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
            <button
              onClick={create}
              disabled={creating}
              className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition"
            >
              {creating ? "جارٍ التوليد..." : "توليد"}
            </button>
          </div>
        </section>

        <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-200">المفاتيح ({keys.length})</h2>
            <button
              onClick={load}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 hover:border-indigo-500 transition"
            >
              تحديث
            </button>
          </div>
          {err && <div className="text-red-400 text-sm mb-3">{err}</div>}
          {loading && <div className="text-slate-400 text-sm">جارٍ التحميل...</div>}
          {!loading && keys.length === 0 && (
            <div className="text-slate-500 text-sm text-center py-8">لا توجد مفاتيح بعد.</div>
          )}
          <div className="space-y-3">
            {keys.map((k) => (
              <div
                key={k.id}
                className={`border rounded-xl p-4 ${
                  k.isExpired || k.isExhausted || !k.enabled
                    ? "border-slate-800 bg-slate-950/40 opacity-70"
                    : "border-slate-800 bg-slate-950/40"
                }`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-100">{k.label}</span>
                      {!k.enabled && <span className="text-xs bg-slate-700 px-2 py-0.5 rounded">معطّل</span>}
                      {k.isExpired && <span className="text-xs bg-red-900/60 text-red-300 px-2 py-0.5 rounded">منتهي</span>}
                      {k.isExhausted && <span className="text-xs bg-orange-900/60 text-orange-300 px-2 py-0.5 rounded">نفد الحد</span>}
                    </div>
                    <div className="mt-2 text-xs text-slate-400 font-mono break-all">
                      {revealed[k.id] ? (
                        <span className="text-emerald-400">{revealed[k.id]}</span>
                      ) : (
                        k.keyPreview
                      )}
                    </div>
                    <div className="mt-2 text-xs text-slate-500 flex gap-4 flex-wrap">
                      <span>الاستخدام: {k.usageCount}{k.maxUsage ? ` / ${k.maxUsage}` : ""}</span>
                      <span>آخر استخدام: {fmtDate(k.lastUsed)}</span>
                      <span>الصلاحية: {k.expiresAt ? `${fmtDate(k.expiresAt)} (${k.daysLeft ?? 0} يوم)` : "دائم"}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {revealed[k.id] ? (
                      <button
                        onClick={() => copy(revealed[k.id])}
                        className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
                      >
                        نسخ
                      </button>
                    ) : (
                      <button
                        onClick={() => reveal(k)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 hover:border-indigo-500"
                      >
                        إظهار
                      </button>
                    )}
                    <button
                      onClick={() => toggle(k)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 hover:border-amber-500"
                    >
                      {k.enabled ? "تعطيل" : "تفعيل"}
                    </button>
                    <button
                      onClick={() => resetUsage(k)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 hover:border-sky-500"
                    >
                      صفر الاستخدام
                    </button>
                    <button
                      onClick={() => remove(k)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-red-800 text-red-400 hover:bg-red-900/30"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-6 text-center text-xs text-slate-600">
          <p>
            عنوان السيرفر للاستخدام في Bookmarklet:{" "}
            <code className="text-emerald-500 font-mono">
              {typeof window !== "undefined" ? window.location.origin : ""}
            </code>
          </p>
        </footer>
      </div>
    </div>
  );
}
