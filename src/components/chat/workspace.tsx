import { MessageCircle, MessagesSquare, UserRound } from "lucide-react";

import { ChatComposer } from "@/components/chat/composer";
import { ChatRefresh } from "@/components/chat/refresh";
import {
  FormNotice,
  StatusPill,
  WorkflowHeader,
} from "@/components/workflow-ui";
import { CustomSelect } from "@/components/ui/custom-select";
import { Link } from "@/i18n/navigation";
import { startConversationAction } from "@/server/chat/actions";

type Peer = {
  id: string;
  name: string;
  role: string;
  status?: string;
};

type ConversationListItem = {
  id: string;
  subject: string | null;
  lastMessageAt: Date;
  unread: boolean;
  others: Array<{
    user: { id: string; name: string; role: string };
  }>;
  lastMessage: {
    body: string;
    imageUrl: string | null;
    author: { id: string; name: string };
    createdAt: Date;
  } | null;
};

type ActiveConversation = {
  id: string;
  subject: string | null;
  participants: Array<{
    user: { id: string; name: string; role: string };
  }>;
  messages: Array<{
    id: string;
    body: string;
    imageUrl: string | null;
    createdAt: Date;
    authorId: string;
    author: { id: string; name: string; role: string };
  }>;
};

function roleLabel(role: string, locale: "fr" | "ar") {
  const map: Record<string, { fr: string; ar: string }> = {
    SUPER_ADMIN: { fr: "Admin", ar: "إدارة" },
    SUPPORT: { fr: "Support", ar: "دعم" },
    FINANCE: { fr: "Finance", ar: "مالية" },
    CONFIRMATION_AGENT: { fr: "Confirmateur", ar: "مؤكد" },
    CATALOG_MANAGER: { fr: "Catalogue", ar: "كتالوج" },
    AFFILIATE: { fr: "Affilié", ar: "شريك" },
    AFFILIATE_STAFF: { fr: "Équipe affilié", ar: "فريق الشريك" },
  };
  return map[role]?.[locale] ?? role;
}

export async function ChatWorkspace({
  locale,
  area,
  userId,
  labels,
  peers,
  conversations,
  active,
  status,
}: {
  locale: "fr" | "ar";
  area: "admin" | "app/partner";
  userId: string;
  labels: {
    title: string;
    body: string;
    empty: string;
    start: string;
    choosePeer: string;
    subject: string;
    open: string;
    placeholder: string;
    send: string;
    emoji: string;
    attach: string;
    removeImage: string;
    noThread: string;
    you: string;
  };
  peers: Peer[];
  conversations: ConversationListItem[];
  active: ActiveConversation | null;
  status?: string;
}) {
  const peerName =
    active?.participants
      .filter((participant) => participant.user.id !== userId)
      .map((participant) => participant.user.name)
      .join(", ") || labels.title;

  return (
    <main className="chat-page">
      <ChatRefresh />
      <WorkflowHeader
        eyebrow={locale === "ar" ? "تواصل" : "Messagerie"}
        title={labels.title}
        body={labels.body}
      />
      <FormNotice
        status={status === "sent" ? undefined : status}
        messages={{
          invalid:
            locale === "ar"
              ? "اختر مخاطباً صالحاً أو أعد فتح المحادثة."
              : "Choisissez un contact valide ou rouvrez la conversation.",
          "invalid-image":
            locale === "ar"
              ? "الصورة غير صالحة (JPG/PNG/WebP، 5MB كحد أقصى)."
              : "Image invalide (JPG/PNG/WebP, 5 Mo max).",
        }}
      />
      <div className="chat-layout">
        <aside className="chat-sidebar">
          <form action={startConversationAction} className="chat-start">
            <input type="hidden" name="locale" value={locale} />
            <div className="queue-form-field">
              <span>{labels.choosePeer}</span>
              <CustomSelect
                name="peerId"
                label={labels.choosePeer}
                locale={locale}
                required
                options={peers.map((peer) => ({
                  value: peer.id,
                  label: `${peer.name} · ${roleLabel(peer.role, locale)}${
                    peer.status === "PENDING"
                      ? locale === "ar"
                        ? " · قيد الانتظار"
                        : " · En attente"
                      : ""
                  }`,
                }))}
              />
            </div>
            <button className="button button--primary button--compact" type="submit">
              {labels.start}
            </button>
          </form>
          <div className="chat-thread-list">
            {conversations.length ? (
              conversations.map((conversation) => {
                const title =
                  conversation.others
                    .map((participant) => participant.user.name)
                    .join(", ") ||
                  conversation.subject ||
                  labels.title;
                return (
                  <Link
                    key={conversation.id}
                    href={{
                      pathname: `/${area}/chat`,
                      query: { c: conversation.id },
                    }}
                    className={`chat-thread-item${conversation.id === active?.id ? " is-active" : ""}${conversation.unread ? " is-unread" : ""}`}
                  >
                    <span className="chat-thread-item__avatar">
                      <UserRound size={16} />
                    </span>
                    <span className="chat-thread-item__meta">
                      <strong>{title}</strong>
                      <small>
                        {conversation.lastMessage?.body ||
                          (conversation.lastMessage?.imageUrl ? "📷" : "—")}
                      </small>
                    </span>
                    {conversation.unread ? (
                      <StatusPill>
                        {locale === "ar" ? "جديد" : "Nouveau"}
                      </StatusPill>
                    ) : null}
                  </Link>
                );
              })
            ) : (
              <p className="queue-empty">{labels.empty}</p>
            )}
          </div>
        </aside>
        <section className="chat-panel">
          {active ? (
            <>
              <header className="chat-panel__header">
                <MessagesSquare size={18} />
                <div>
                  <strong>{peerName}</strong>
                  {active.subject ? <span>{active.subject}</span> : null}
                </div>
              </header>
              <div className="chat-messages">
                {active.messages.map((message) => {
                  const own = message.authorId === userId;
                  return (
                    <article
                      key={message.id}
                      className={`chat-bubble${own ? " is-own" : ""}`}
                    >
                      <div className="chat-bubble__meta">
                        <strong>
                          {own ? labels.you : message.author.name}
                        </strong>
                        <small>
                          {new Intl.DateTimeFormat(locale, {
                            dateStyle: "medium",
                            timeStyle: "short",
                            hourCycle: "h23",
                          }).format(message.createdAt)}
                        </small>
                      </div>
                      {message.imageUrl ? (
                        <a
                          href={message.imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="chat-bubble__image"
                        >
                          <img src={message.imageUrl} alt="" />
                        </a>
                      ) : null}
                      {message.body ? <p>{message.body}</p> : null}
                    </article>
                  );
                })}
              </div>
              <ChatComposer
                locale={locale}
                conversationId={active.id}
                labels={{
                  placeholder: labels.placeholder,
                  send: labels.send,
                  emoji: labels.emoji,
                  attach: labels.attach,
                  removeImage: labels.removeImage,
                }}
              />
            </>
          ) : (
            <div className="chat-empty">
              <MessageCircle size={28} />
              <p>{labels.noThread}</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
