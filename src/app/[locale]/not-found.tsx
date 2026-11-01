import { getLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";

export default async function LocalizedNotFoundPage() {
  const locale = await getLocale();
  const arabic = locale === "ar";
  return (
    <main className="system-page" dir={arabic ? "rtl" : "ltr"} lang={locale}>
      <section>
        <p className="app-kicker">404 · Tijara</p>
        <h1>{arabic ? "الصفحة غير موجودة" : "Page introuvable"}</h1>
        <p>
          {arabic
            ? "هذه الصفحة غير موجودة أو لم تعد متاحة."
            : "Cette page n’existe pas ou n’est plus disponible."}
        </p>
        <Link className="button button--primary" href="/">
          {arabic ? "العودة إلى الرئيسية" : "Retour à l’accueil"}
        </Link>
      </section>
    </main>
  );
}
