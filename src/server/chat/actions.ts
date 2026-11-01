"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { inspectImageFile } from "@/server/media/image-validation";
import { uploadObject } from "@/server/media/storage";
import { requireUser } from "@/server/auth/session";
import { chatAreaForRole } from "./access";
import {
  getOrCreateDirectConversation,
  markConversationRead,
  postChatMessage,
} from "./service";

function localeFrom(formData: FormData) {
  return formData.get("locale") === "ar" ? "ar" : "fr";
}

function chatPath(
  locale: string,
  area: "admin" | "app/partner",
  options?: { conversationId?: string; status?: string },
) {
  const params = new URLSearchParams();
  if (options?.conversationId) params.set("c", options.conversationId);
  if (options?.status) params.set("status", options.status);
  const query = params.toString();
  return `/${locale}/${area}/chat${query ? `?${query}` : ""}`;
}

export async function startConversationAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requireUser(locale);
  const area = chatAreaForRole(user.role);
  const parsed = z
    .object({
      peerId: z.string().cuid(),
      subject: z.string().trim().max(160).optional().or(z.literal("")),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    redirect(chatPath(locale, area, { status: "invalid" }));
  try {
    const conversation = await getOrCreateDirectConversation(
      { id: user.id, role: user.role },
      parsed.data.peerId,
      parsed.data.subject || null,
    );
    revalidatePath(`/${locale}/${area}/chat`);
    redirect(
      chatPath(locale, area, { conversationId: conversation.id }),
    );
  } catch {
    redirect(chatPath(locale, area, { status: "invalid" }));
  }
}

export async function sendChatMessageAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requireUser(locale);
  const area = chatAreaForRole(user.role);
  const conversationId = String(formData.get("conversationId") ?? "")
    .split("?")[0]
    .trim();
  const body = String(formData.get("message") ?? "");
  if (!z.string().cuid().safeParse(conversationId).success)
    redirect(chatPath(locale, area, { status: "invalid" }));

  let imageObjectKey: string | null = null;
  let imageUrl: string | null = null;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    const inspected = await inspectImageFile(file);
    if (!inspected) {
      redirect(
        chatPath(locale, area, {
          conversationId,
          status: "invalid-image",
        }),
      );
    }
    try {
      const key = `chat/${conversationId}/${Date.now()}-${crypto.randomUUID()}.${inspected.extension}`;
      imageUrl = await uploadObject(key, file);
      imageObjectKey = key;
    } catch {
      redirect(
        chatPath(locale, area, {
          conversationId,
          status: "invalid-image",
        }),
      );
    }
  }

  try {
    await postChatMessage(
      { id: user.id, role: user.role, name: user.name },
      {
        conversationId,
        body,
        imageObjectKey,
        imageUrl,
      },
    );
  } catch {
    redirect(
      chatPath(locale, area, { conversationId, status: "invalid" }),
    );
  }
  revalidatePath(`/${locale}/${area}/chat`);
  revalidatePath(`/${locale}/admin`, "layout");
  revalidatePath(`/${locale}/app/partner`, "layout");
  redirect(chatPath(locale, area, { conversationId }));
}

export async function openConversationAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requireUser(locale);
  const area = chatAreaForRole(user.role);
  const conversationId = String(formData.get("conversationId") ?? "")
    .split("?")[0]
    .trim();
  if (!z.string().cuid().safeParse(conversationId).success)
    redirect(chatPath(locale, area, { status: "invalid" }));
  await markConversationRead(user.id, conversationId);
  revalidatePath(`/${locale}/${area}/chat`);
  revalidatePath(`/${locale}/${area}`, "layout");
  redirect(chatPath(locale, area, { conversationId }));
}
