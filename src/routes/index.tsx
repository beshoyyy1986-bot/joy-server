import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AMEX Tool — Beshoy Magdy" },
      {
        name: "description",
        content:
          "خادم أداة إدارة بطاقات Facebook Business Manager — توليد مفاتيح، لوحة إدارة، ودعم دول عبر BrightData.",
      },
      { property: "og:title", content: "AMEX Tool — Beshoy Magdy" },
      {
        property: "og:description",
        content: "خادم Facebook BM Card Tool — لوحة إدارة ومفاتيح API.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const serverUrl = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <div
      dir="rtl"
      className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-sans"
    >
      <div className="max-w-xl w-full bg-slate-900/60 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur">
        <h1 className="text-3xl font-bold text-indigo-400 text-center">AMEX Tool</h1>
        <p className="text-slate-400 text-center mt-1 text-sm">by Beshoy Magdy</p>

        <div className="mt-6 space-y-3 text-sm text-slate-300 leading-7">
          <p>الخادم شغّال ✅ وجاهز لاستقبال طلبات الـ Bookmarklet.</p>
          <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 font-mono text-xs break-all text-emerald-400">
            {serverUrl || "..."}
          </div>
          <p>
            انسخ العنوان أعلاه وضَعه في السطر الأول من <code>bookmarklet.js</code> بدل{" "}
            <code>http://localhost:3000</code>.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Link
            to="/admin"
            className="text-center px-4 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-semibold transition"
          >
            لوحة الإدارة
          </Link>
          <a
            href="/api/public/ping"
            target="_blank"
            rel="noreferrer"
            className="text-center px-4 py-3 rounded-lg border border-slate-700 hover:border-indigo-500 text-slate-200 font-semibold transition"
          >
            فحص حالة السيرفر
          </a>
        </div>

        <p className="mt-6 text-xs text-slate-500 text-center">
          البروكسيات اليدوية مش مدعومة هنا — استخدم اختيار الدولة من الأداة ليمر الطلب عبر BrightData.
        </p>
      </div>
    </div>
  );
}
