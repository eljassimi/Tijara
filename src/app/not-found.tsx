import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="system-page">
      <section>
        <p className="app-kicker">404 · Tijara</p>
        <h1>Page introuvable</h1>
        <p>هذه الصفحة غير موجودة أو لم تعد متاحة.</p>
        <Link className="button button--primary" href="/fr">
          Retour à l’accueil · العودة للرئيسية
        </Link>
      </section>
    </main>
  );
}
