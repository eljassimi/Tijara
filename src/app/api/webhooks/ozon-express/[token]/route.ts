import { NextResponse } from "next/server";

import { handleOzonWebhook } from "@/server/delivery/ozon-express/service";

type RouteContext = {
  params: Promise<{ token: string }>;
};

async function readBody(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await request.json()) as Record<string, unknown>;
  }
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await request.formData();
    return Object.fromEntries(
      [...form.entries()].map(([key, value]) => [key, String(value)]),
    );
  }
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const body = await readBody(request);
    const result = await handleOzonWebhook(token, {
      orderid: String(body.orderid ?? body.orderId ?? ""),
      orderId: String(body.orderId ?? body.orderid ?? ""),
      orderStatus: String(body.orderStatus ?? body.ORDER_STATUS ?? ""),
      situation: String(body.situation ?? ""),
      note: String(body.note ?? ""),
    });
    if (!result.ok) {
      const status = result.reason === "unauthorized" ? 401 : 400;
      return NextResponse.json({ ok: false, reason: result.reason }, { status });
    }
    return NextResponse.json({ ok: true, result: result.result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
