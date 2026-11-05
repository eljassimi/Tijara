"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="system-page">
      <section>
        <p className="app-kicker">Tijara</p>
        <h1>Un problème est survenu</h1>
        <p>لم نتمكن من إكمال العملية. لم يتم حفظ أي تغيير غير مكتمل.</p>
        <p>
          Si une mise à jour vient d’être déployée, rechargez la page puis
          réessayez.
        </p>
        <button
          className="button button--primary"
          type="button"
          onClick={() => window.location.reload()}
        >
          Réessayer · حاول مجدداً
        </button>
      </section>
    </main>
  );
}
