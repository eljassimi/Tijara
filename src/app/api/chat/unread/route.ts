import { NextResponse } from "next/server";

import { getSessionUser } from "@/server/auth/session";
import { unreadChatMessageCount } from "@/server/chat/service";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ count: 0 }, { status: 401 });
  }
  const count = await unreadChatMessageCount(user.id);
  return NextResponse.json({ count });
}
