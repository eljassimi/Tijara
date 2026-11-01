"use client";

export default function GlobalError({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          background: "#f7f2eb",
          color: "#201a17",
        }}
      >
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: 24,
          }}
        >
          <section
            style={{
              maxWidth: 560,
              padding: 36,
              borderRadius: 24,
              background: "white",
              boxShadow: "0 18px 60px rgba(32,26,23,.1)",
            }}
          >
            <h1>Service momentanément indisponible</h1>
            <p>الخدمة غير متاحة مؤقتاً. يرجى المحاولة من جديد.</p>
            <button
              onClick={() => retry()}
              style={{
                border: 0,
                borderRadius: 12,
                padding: "12px 18px",
                background: "#3b3bf5",
                color: "white",
                fontWeight: 700,
              }}
            >
              Réessayer · حاول مجدداً
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
