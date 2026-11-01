import React from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getSessionUser, sessionUserCan } from "@/server/auth/session";

const styles = StyleSheet.create({
  page: { padding: 42, fontSize: 10, color: "#14123A" },
  header: { marginBottom: 30 },
  brand: { fontSize: 24, fontWeight: 700, color: "#3B3BF5" },
  meta: { marginTop: 6, color: "#6B6A86" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1E4D3",
  },
  total: {
    marginTop: 22,
    padding: 16,
    backgroundColor: "#14123A",
    color: "#FFB627",
    fontSize: 18,
    textAlign: "right",
  },
});

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      affiliate: { include: { user: true, staff: true } },
      lines: { include: { order: true, orderLine: true } },
    },
  });
  if (!invoice)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isPartner = ["AFFILIATE", "AFFILIATE_STAFF"].includes(user.role);
  const owns =
    invoice.affiliate.userId === user.id ||
    invoice.affiliate.staff.some(
      (item) => item.userId === user.id && item.active,
    );
  const allowed = isPartner
    ? owns && sessionUserCan(user, "wallet:view")
    : sessionUserCan(user, "finance:manage");
  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const pdf = React.createElement(
    Document,
    {},
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        View,
        { style: styles.header },
        React.createElement(Text, { style: styles.brand }, "Tijara تجارة"),
        React.createElement(
          Text,
          { style: styles.meta },
          `${invoice.number} · ${invoice.affiliate.user.name}`,
        ),
        React.createElement(
          Text,
          { style: styles.meta },
          `Statut: ${invoice.status}`,
        ),
      ),
      ...invoice.lines.map((line) =>
        React.createElement(
          View,
          { style: styles.row, key: line.id },
          React.createElement(
            Text,
            {},
            `${line.order.code} · ${line.orderLine.productNameFr}`,
          ),
          React.createElement(Text, {}, `${line.commission.toFixed(2)} MAD`),
        ),
      ),
      React.createElement(
        Text,
        { style: styles.total },
        `Total commission  ${invoice.totalCommission.toFixed(2)} MAD`,
      ),
    ),
  );
  const buffer = await renderToBuffer(pdf);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.number}.pdf"`,
    },
  });
}
