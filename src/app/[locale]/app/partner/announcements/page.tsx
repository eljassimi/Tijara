import { Megaphone } from "lucide-react";
import { getTranslations } from "next-intl/server";

import {
  StatusPill,
  WorkflowHeader,
} from "@/components/workflow-ui";
import { prisma } from "@/lib/prisma";
import { formatAppDateTime } from "@/lib/time";
import { requireRole } from "@/server/auth/session";

export default async function PartnerAnnouncementsPage({
  params,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
}) {
  const { locale } = await params;
  await requireRole(locale, ["AFFILIATE", "AFFILIATE_STAFF"]);
  const now = new Date();
  const [t, announcements] = await Promise.all([
    getTranslations("Announcements"),
    prisma.announcement.findMany({
      where: {
        published: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      orderBy: { startsAt: "desc" },
      include: {
        createdBy: { select: { name: true } },
      },
    }),
  ]);
  const history = await prisma.announcement.findMany({
    where: {
      published: true,
      OR: [{ endsAt: { lt: now } }, { startsAt: { gt: now } }],
    },
    orderBy: { startsAt: "desc" },
    take: 20,
    include: {
      createdBy: { select: { name: true } },
    },
  });

  return (
    <main>
      <WorkflowHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        body={t("body")}
      />
      <section className="announcement-feed">
        {announcements.length ? (
          announcements.map((item) => (
            <article className="announcement-card is-live" key={item.id}>
              <div className="announcement-card__icon">
                <Megaphone size={20} />
              </div>
              <div>
                <div className="announcement-card__top">
                  <strong>
                    {locale === "ar" ? item.titleAr : item.titleFr}
                  </strong>
                  <StatusPill>{t("live")}</StatusPill>
                </div>
                <p>{locale === "ar" ? item.bodyAr : item.bodyFr}</p>
                <small>
                  {formatAppDateTime(item.startsAt, locale)}
                  {item.createdBy
                    ? ` · ${item.createdBy.name}`
                    : ""}
                </small>
              </div>
            </article>
          ))
        ) : (
          <p className="queue-empty">{t("empty")}</p>
        )}
      </section>
      {history.length ? (
        <section className="announcement-feed section-gap">
          <h2 className="section-title">{t("history")}</h2>
          {history.map((item) => (
            <article className="announcement-card" key={item.id}>
              <div className="announcement-card__icon">
                <Megaphone size={18} />
              </div>
              <div>
                <div className="announcement-card__top">
                  <strong>
                    {locale === "ar" ? item.titleAr : item.titleFr}
                  </strong>
                  <StatusPill>
                    {item.endsAt < now ? t("ended") : t("scheduled")}
                  </StatusPill>
                </div>
                <p>{locale === "ar" ? item.bodyAr : item.bodyFr}</p>
                <small>
                  {formatAppDateTime(item.startsAt, locale)} –{" "}
                  {formatAppDateTime(item.endsAt, locale)}
                </small>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}
