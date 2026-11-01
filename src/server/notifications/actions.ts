"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/auth/session";

export async function markNotificationsReadAction(formData: FormData) {
  const locale = formData.get("locale") === "ar" ? "ar" : "fr";
  const area = formData.get("area") === "admin" ? "admin" : "app/partner";
  const user = await requireUser(locale);
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath(`/${locale}/${area}`, "layout");
  redirect(`/${locale}/${area}/notifications?status=updated`);
}
