import { createHash, randomBytes } from "node:crypto";

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { can, type AppRole, type Permission } from "@/lib/permissions";
import { accountCanAccess } from "./access-policy";

/** Keep users signed in across browser restarts. */
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
/**
 * Still a persistent cookie when "remember me" is off.
 * Browser-session cookies (no Max-Age) are what log people out on window close.
 */
const SESSION_SHORT_AGE_SECONDS = 7 * 24 * 60 * 60;

const staffPermissionMap = {
  CREATE_ORDERS: "orders:create",
  VIEW_ORDERS: "orders:view",
  VIEW_WALLET: "wallet:view",
  REQUEST_PAYOUTS: "payouts:request",
  MANAGE_BANK_DETAILS: "profile:manage",
  MANAGE_STAFF: "team:manage",
} as const satisfies Record<string, Permission>;

function authSecretBytes() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret && secret.length >= 32) {
    return new TextEncoder().encode(secret);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET must be set to a long random value in production",
    );
  }
  return new TextEncoder().encode(
    "tijara-dev-only-auth-secret-min-32-chars",
  );
}

function useSecureCookies() {
  const authUrl = process.env.AUTH_URL?.trim() ?? "";
  if (authUrl.startsWith("https://")) return true;
  if (
    authUrl.startsWith("http://localhost") ||
    authUrl.startsWith("http://127.0.0.1")
  ) {
    return false;
  }
  return process.env.NODE_ENV === "production";
}

function cookieName() {
  return useSecureCookies()
    ? "__Secure-tijara.session-token"
    : "tijara.session-token";
}

/** Older Auth.js-style names used before the persistence fix. */
function legacyCookieNames() {
  return [
    "authjs.session-token",
    "__Secure-authjs.session-token",
    "tijara.session-token",
    "__Secure-tijara.session-token",
  ].filter((name) => name !== cookieName());
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function persistentCookieOptions(maxAge: number, expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: useSecureCookies(),
    path: "/",
    // Both attributes: Max-Age is authoritative; Expires helps older clients.
    maxAge,
    expires,
  };
}

async function sealSessionCookie(sessionToken: string, maxAge: number) {
  return new SignJWT({ sid: sessionToken })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(authSecretBytes());
}

async function readSessionTokenFromCookie(
  raw: string | undefined,
): Promise<string | null> {
  if (!raw) return null;

  try {
    const { payload } = await jwtVerify(raw, authSecretBytes(), {
      algorithms: ["HS256"],
    });
    if (typeof payload.sid === "string" && payload.sid.length >= 32) {
      return payload.sid;
    }
  } catch {
    // Fall through to legacy opaque tokens so existing sessions can migrate.
  }

  // Legacy: raw 64-char hex session token (pre-JWT cookie).
  if (/^[a-f0-9]{64}$/i.test(raw)) return raw;
  return null;
}

async function readRawSessionCookie() {
  const store = await cookies();
  const primary = store.get(cookieName())?.value;
  if (primary) return primary;
  for (const name of legacyCookieNames()) {
    const value = store.get(name)?.value;
    if (value) return value;
  }
  return undefined;
}

async function findSessionByToken(token: string) {
  const tokenHash = hashSessionToken(token);
  const include = {
    user: {
      include: {
        staffMembership: {
          include: {
            permissions: true,
            affiliateProfile: { include: { user: true } },
          },
        },
      },
    },
  } as const;

  const hashed = await prisma.session.findUnique({
    where: { sessionToken: tokenHash },
    include,
  });
  if (hashed) return hashed;

  // Pre-hash rows stored the raw token; migrate on read.
  const legacy = await prisma.session.findUnique({
    where: { sessionToken: token },
    include,
  });
  if (!legacy) return null;

  await prisma.session.update({
    where: { id: legacy.id },
    data: { sessionToken: tokenHash },
  });
  return legacy;
}

export async function createDatabaseSession(userId: string, remember: boolean) {
  const sessionToken = randomBytes(32).toString("hex");
  const maxAge = remember ? SESSION_MAX_AGE_SECONDS : SESSION_SHORT_AGE_SECONDS;
  const expires = new Date(Date.now() + maxAge * 1000);

  await prisma.session.create({
    data: {
      sessionToken: hashSessionToken(sessionToken),
      userId,
      expires,
    },
  });

  const jwt = await sealSessionCookie(sessionToken, maxAge);
  const store = await cookies();

  for (const name of legacyCookieNames()) {
    store.delete(name);
  }

  store.set(cookieName(), jwt, persistentCookieOptions(maxAge, expires));
}

export async function destroyDatabaseSession() {
  const store = await cookies();
  const token = await readSessionTokenFromCookie(await readRawSessionCookie());
  if (token) {
    const tokenHash = hashSessionToken(token);
    await prisma.session.deleteMany({
      where: {
        OR: [{ sessionToken: tokenHash }, { sessionToken: token }],
      },
    });
  }
  store.delete(cookieName());
  for (const name of legacyCookieNames()) {
    store.delete(name);
  }
}

export async function getSessionUser() {
  const token = await readSessionTokenFromCookie(await readRawSessionCookie());
  if (!token) return null;

  const session = await findSessionByToken(token);
  if (!session || session.expires <= new Date()) {
    if (session) {
      await prisma.session.deleteMany({ where: { id: session.id } });
    }
    return null;
  }

  if (!accountCanAccess(session.user)) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }

  return session.user;
}

export async function requireUser(locale: string) {
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);
  return user;
}

export async function requireRole(locale: string, allowed: readonly AppRole[]) {
  const user = await requireUser(locale);
  if (!allowed.includes(user.role as AppRole)) notFound();
  return user;
}

export async function requirePermission(
  locale: string,
  permission: Permission,
) {
  const user = await requireUser(locale);
  const staffPermissions = user.staffMembership?.permissions
    .filter((item) => item.enabled)
    .map((item) => staffPermissionMap[item.key]);
  if (!can({ role: user.role as AppRole, staffPermissions }, permission)) {
    if (user.role === "AFFILIATE" || user.role === "AFFILIATE_STAFF") {
      redirect(`/${locale}/app/partner?status=forbidden`);
    }
    notFound();
  }
  return user;
}

export function sessionUserCan(
  user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>,
  permission: Permission,
) {
  const staffPermissions = user.staffMembership?.permissions
    .filter((item) => item.enabled)
    .map((item) => staffPermissionMap[item.key]);
  return can({ role: user.role as AppRole, staffPermissions }, permission);
}
