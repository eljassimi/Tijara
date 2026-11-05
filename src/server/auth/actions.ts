"use server";

import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import nodemailer from "nodemailer";
import { z } from "zod";

import { homePathForRole } from "@/lib/navigation";
import { prisma } from "@/lib/prisma";
import { loginSchema, signupSchema } from "@/lib/validation/auth";
import { hashPassword, verifyPassword } from "./password";
import { createDatabaseSession, destroyDatabaseSession } from "./session";
import { verifyTurnstile } from "./turnstile";
import { accountCanAccess } from "./access-policy";
import {
  checkRateLimit,
  clearRateLimit,
  consumeRateLimit,
  loginAccountIdentity,
  requestIp,
} from "./rate-limit";

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,p=4,t=3$2U8zbcRC/Whixp+Gv0Sjeg$7/CiRMTbuwvcGwLNTsu6CfHdbuYQjf07TwumzOthjaQ";

function localeFrom(formData: FormData) {
  return formData.get("locale") === "ar" ? "ar" : "fr";
}

function booleanField(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

export async function loginAction(formData: FormData) {
  const locale = localeFrom(formData);
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    remember: booleanField(formData.get("remember")),
    turnstileToken: formData.get("cf-turnstile-response") || undefined,
  });
  if (!parsed.success) redirect(`/${locale}/login?status=invalid`);
  const ip = await requestIp();
  const accountIdentity = loginAccountIdentity(parsed.data.email, ip);
  const [ipAllowed, accountAllowed] = await Promise.all([
    ip ? checkRateLimit("login-ip", ip) : true,
    checkRateLimit("login-account", accountIdentity),
  ]);
  if (!ipAllowed || !accountAllowed)
    redirect(`/${locale}/login?status=rate-limited`);
  if (!(await verifyTurnstile(parsed.data.turnstileToken)))
    redirect(`/${locale}/login?status=captcha`);

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    include: {
      staffMembership: {
        include: { affiliateProfile: { include: { user: true } } },
      },
    },
  });
  const passwordValid = await verifyPassword(
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    parsed.data.password,
  );
  if (!user?.passwordHash || !passwordValid) {
    await Promise.all([
      ip
        ? consumeRateLimit("login-ip", ip, {
            limit: 20,
            windowMs: 15 * 60_000,
            blockMs: 15 * 60_000,
          })
        : Promise.resolve(true),
      consumeRateLimit("login-account", accountIdentity, {
        limit: 5,
        windowMs: 15 * 60_000,
        blockMs: 15 * 60_000,
      }),
    ]);
    redirect(`/${locale}/login?status=invalid`);
  }
  if (user.status === "PENDING")
    redirect(`/${locale}/login?status=pending-login`);
  if (!accountCanAccess(user)) redirect(`/${locale}/login?status=suspended`);
  await clearRateLimit("login-account", accountIdentity);
  await createDatabaseSession(user.id, parsed.data.remember);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  redirect(homePathForRole(locale, user.role));
}

export async function signupAction(formData: FormData) {
  const locale = localeFrom(formData);
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    socialPage: formData.get("socialPage"),
    city: formData.get("city"),
    password: formData.get("password"),
    terms: booleanField(formData.get("terms")),
    turnstileToken: formData.get("cf-turnstile-response") || undefined,
  });
  if (!parsed.success) redirect(`/${locale}/signup?status=invalid`);
  const ip = await requestIp();
  if (
    ip &&
    !(await consumeRateLimit("signup-ip", ip, {
      limit: 10,
      windowMs: 60 * 60_000,
      blockMs: 60 * 60_000,
    }))
  )
    redirect(`/${locale}/signup?status=rate-limited`);
  if (!(await verifyTurnstile(parsed.data.turnstileToken)))
    redirect(`/${locale}/signup?status=captcha`);
  if (
    await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    })
  ) {
    redirect(`/${locale}/signup?status=exists`);
  }
  const passwordHash = await hashPassword(parsed.data.password);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        passwordHash,
        role: "AFFILIATE",
        status: "PENDING",
        preferredLocale: locale === "ar" ? "AR" : "FR",
      },
    });
    await tx.affiliateProfile.create({
      data: {
        userId: user.id,
        socialPage: parsed.data.socialPage,
        city: parsed.data.city,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "CREATE",
        entityType: "User",
        entityId: user.id,
        after: { status: "PENDING", role: "AFFILIATE" },
      },
    });
  });
  redirect(`/${locale}/login?status=pending`);
}

export async function logoutAction(locale: string) {
  await destroyDatabaseSession();
  redirect(`/${locale}/login`);
}

export async function requestPasswordResetAction(formData: FormData) {
  const locale = localeFrom(formData);
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const ip = await requestIp();
  const [ipAllowed, accountAllowed] = await Promise.all([
    ip
      ? consumeRateLimit("forgot-ip", ip, {
          limit: 20,
          windowMs: 15 * 60_000,
          blockMs: 15 * 60_000,
        })
      : true,
    consumeRateLimit("forgot-account", email, {
      limit: 5,
      windowMs: 15 * 60_000,
      blockMs: 15 * 60_000,
    }),
  ]);
  if (!ipAllowed || !accountAllowed)
    redirect(`/${locale}/forgot-password?status=sent`);
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  });
  if (user) {
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      }),
      prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      }),
    ]);
    const baseUrl = process.env.AUTH_URL ?? "http://localhost:3000";
    const resetUrl = `${baseUrl}/${locale}/reset-password?token=${token}`;
    if (process.env.SMTP_HOST) {
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 1025),
        secure: false,
        ...(process.env.SMTP_USER
          ? {
              auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD,
              },
            }
          : {}),
      });
      try {
        await transport.sendMail({
          from: process.env.EMAIL_FROM,
          to: user.email,
          subject:
            locale === "ar"
              ? "إعادة تعيين كلمة مرور تجارة"
              : "Réinitialiser votre mot de passe Tijara",
          text: `${user.name},\n\n${resetUrl}\n\nCe lien expire dans 60 minutes.`,
        });
      } catch {
        /* Keep the response non-enumerating if SMTP is temporarily unavailable. */
      }
    }
  }
  redirect(`/${locale}/forgot-password?status=sent`);
}

export async function resetPasswordAction(formData: FormData) {
  const locale = localeFrom(formData);
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  const parsed = z
    .object({
      token: z.string().min(20).max(256),
      password: z.string().min(10).max(128),
      confirmation: z.string().min(10).max(128),
    })
    .refine((value) => value.password === value.confirmation, {
      path: ["confirmation"],
    })
    .safeParse({ token, password, confirmation });
  if (!parsed.success)
    redirect(
      `/${locale}/reset-password?token=${encodeURIComponent(token)}&status=invalid`,
    );
  const ip = await requestIp();
  if (
    ip &&
    !(await consumeRateLimit("reset-ip", ip, {
      limit: 10,
      windowMs: 15 * 60_000,
      blockMs: 15 * 60_000,
    }))
  )
    redirect(`/${locale}/forgot-password?status=expired`);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });
  if (!record || record.usedAt || record.expiresAt <= new Date())
    redirect(`/${locale}/forgot-password?status=expired`);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: record.userId },
      data: {
        passwordHash: await hashPassword(password),
      },
    });
    await tx.passwordResetToken.update({
      where: { tokenHash },
      data: { usedAt: new Date() },
    });
    await tx.session.deleteMany({ where: { userId: record.userId } });
    await tx.auditLog.create({
      data: {
        actorId: record.userId,
        action: "UPDATE",
        entityType: "User",
        entityId: record.userId,
        after: { passwordReset: true },
      },
    });
  });
  redirect(`/${locale}/login?status=reset`);
}
