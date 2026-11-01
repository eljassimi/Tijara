"use client";

import { useRouter } from "@/i18n/navigation";
import { useEffect } from "react";

import { requestChatBadgeRefresh } from "@/components/chat/live-badge";

/** Soft-refresh the chat page so new messages appear without a hard reload. */
export function ChatRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => {
      router.refresh();
      requestChatBadgeRefresh();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [router]);
  return null;
}
