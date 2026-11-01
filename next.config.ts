import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const developmentEval =
  process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";

function resolveAuthUrl(raw: string | undefined): URL {
  const value = (raw ?? "http://invalid.local").trim();
  const normalized = value.startsWith("//") ? `https:${value}` : value;
  try {
    return new URL(normalized);
  } catch {
    throw new Error(
      `AUTH_URL must be a full URL with protocol, e.g. https://your-domain.com (received: ${raw ?? ""})`,
    );
  }
}

const authUrl = resolveAuthUrl(process.env.AUTH_URL);
const authHost = authUrl.hostname;
const insecureLocalAuth =
  process.env.ALLOW_INSECURE_LOCAL_AUTH === "true" &&
  (authHost === "localhost" || authHost === "127.0.0.1");
if (
  process.env.NODE_ENV === "production" &&
  !insecureLocalAuth &&
  (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
    !process.env.TURNSTILE_SECRET_KEY)
) {
  throw new Error(
    "Production authentication requires NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY.",
  );
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Hostinger (and similar shared hosts) have low process/thread caps.
    // Default CPU detection can spawn 50+ workers and abort the build.
    cpus: 1,
    workerThreads: false,
    serverActions: {
      bodySizeLimit: "42mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline'${developmentEval} https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http://localhost:9000 http://127.0.0.1:9000 https://app.stockdyali.ma; font-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`,
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
