"use client";

import { Smile } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const EMOJIS = [
  "😀",
  "😁",
  "😂",
  "🥲",
  "😊",
  "😍",
  "🤝",
  "👍",
  "👏",
  "🙏",
  "🔥",
  "✨",
  "✅",
  "❌",
  "⚠️",
  "📦",
  "🚚",
  "💰",
  "📞",
  "💬",
  "📷",
  "📎",
  "🕒",
  "❤️",
  "🇲🇦",
];

export function EmojiPicker({
  onPick,
  label,
}: {
  onPick: (emoji: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  return (
    <div className="chat-emoji" ref={rootRef}>
      <button
        type="button"
        className="icon-button chat-emoji__toggle"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Smile size={18} />
      </button>
      {open ? (
        <div className="chat-emoji__panel" role="listbox" aria-label={label}>
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="option"
              className="chat-emoji__item"
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
