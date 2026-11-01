"use client";

import { ImagePlus, SendHorizontal, X } from "lucide-react";
import { useRef, useState } from "react";

import { sendChatMessageAction } from "@/server/chat/actions";
import { EmojiPicker } from "./emoji-picker";

export function ChatComposer({
  locale,
  conversationId,
  labels,
}: {
  locale: "fr" | "ar";
  conversationId: string;
  labels: {
    placeholder: string;
    send: string;
    emoji: string;
    attach: string;
    removeImage: string;
  };
}) {
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const clearImage = () => {
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <form className="chat-composer" action={sendChatMessageAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="conversationId" value={conversationId} />
      {preview ? (
        <div className="chat-composer__preview">
          <img src={preview} alt="" />
          <button
            type="button"
            className="icon-button"
            aria-label={labels.removeImage}
            onClick={clearImage}
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
      <div className="chat-composer__row">
        <EmojiPicker
          label={labels.emoji}
          onPick={(emoji) => {
            setMessage((current) => `${current}${emoji}`);
            textareaRef.current?.focus();
          }}
        />
        <button
          type="button"
          className="icon-button"
          aria-label={labels.attach}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus size={18} />
        </button>
        <input
          ref={fileRef}
          className="sr-only"
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) {
              setPreview(null);
              return;
            }
            setPreview(URL.createObjectURL(file));
          }}
        />
        <textarea
          ref={textareaRef}
          name="message"
          rows={1}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={labels.placeholder}
        />
        <button
          className="button button--primary button--compact chat-composer__send"
          type="submit"
          disabled={!message.trim() && !preview}
        >
          <SendHorizontal size={16} />
          <span>{labels.send}</span>
        </button>
      </div>
    </form>
  );
}
