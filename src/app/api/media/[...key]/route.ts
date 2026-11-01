import { NextResponse } from "next/server";

import { getSessionUser } from "@/server/auth/session";
import { downloadObject } from "@/server/media/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { key } = await params;
  if (
    !key.length ||
    key.some((part) => part === "." || part === ".." || part.includes("\\"))
  )
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  try {
    const object = await downloadObject(key.join("/"));
    const body = new Uint8Array(object.bytes.byteLength);
    body.set(object.bytes);
    return new Response(body.buffer, {
      headers: {
        "Content-Type": object.contentType,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
