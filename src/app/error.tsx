"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
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
        <button
          className="button button--primary"
          type="button"
          onClick={() => retry()}
        >
          Réessayer · حاول مجدداً
        </button>
      </section>
    </main>
  );
}
