"use client";

import { useEffect, useState } from "react";

const CHAT_UNREAD_EVENT = "tijara:chat-unread-refresh";

export function requestChatBadgeRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHAT_UNREAD_EVENT));
  }
}

export function LiveChatBadge({ initialCount = 0 }: { initialCount?: number }) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/chat/unread", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) return;
        const data = (await response.json()) as { count?: number };
        if (!cancelled && typeof data.count === "number") setCount(data.count);
      } catch {
        /* ignore transient network errors */
      }
    };
    void load();
    const timer = window.setInterval(load, 8_000);
    const onFocus = () => void load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener(CHAT_UNREAD_EVENT, onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(CHAT_UNREAD_EVENT, onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (count <= 0) return null;
  return (
    <span className="app-nav__badge">{count > 99 ? "99+" : count}</span>
  );
}
