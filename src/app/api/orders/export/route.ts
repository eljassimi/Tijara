import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getSessionUser, sessionUserCan } from "@/server/auth/session";
import { affiliateIdFor } from "@/server/orders/service";
import { customerOrderTotal } from "@/lib/order-totals";

export async function GET() {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partner = user.role === "AFFILIATE" || user.role === "AFFILIATE_STAFF";
  const allowed = partner
    ? sessionUserCan(user, "orders:view")
    : sessionUserCan(user, "orders:export");
  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const affiliateId = partner
    ? await affiliateIdFor(user.id, user.role)
    : undefined;
  const orders = await prisma.order.findMany({
    where: affiliateId ? { affiliateId } : {},
    take: 5_000,
    include: {
      affiliate: { include: { user: true } },
      city: true,
      lines: true,
      courier: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Commandes");
  sheet.columns = [
    { header: "Code", key: "code", width: 22 },
    { header: "Date", key: "date", width: 20 },
    { header: "Affilié", key: "affiliate", width: 24 },
    { header: "Client", key: "customer", width: 24 },
    { header: "Téléphone", key: "phone", width: 18 },
    { header: "Ville", key: "city", width: 18 },
    { header: "Vente MAD", key: "sale", width: 15 },
    { header: "Commission MAD", key: "commission", width: 18 },
    { header: "Confirmation", key: "confirmation", width: 20 },
    { header: "Livraison", key: "delivery", width: 20 },
    { header: "Finance", key: "finance", width: 16 },
    { header: "Transporteur", key: "courier", width: 20 },
  ];
  for (const order of orders)
    sheet.addRow({
      code: order.code,
      date: order.createdAt.toISOString(),
      affiliate: order.affiliate.user.name,
      customer: order.customerName,
      phone: order.phone,
      city: order.city.nameFr,
      sale: customerOrderTotal(order.lines),
      commission: order.lines.reduce(
        (sum, line) => sum + Number(line.commission) * line.quantity,
        0,
      ),
      confirmation: order.confirmationStatus,
      delivery: order.deliveryStatus,
      finance: order.financeStatus,
      courier: order.courier?.name ?? "",
    });
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF3B3BF5" },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=commandes-tijara.xlsx",
    },
  });
}
