import { NextResponse } from "next/server";
import { createConversation, listConversations } from "@/lib/db";
import crypto from "crypto";

export async function GET() {
  try {
    const conversations = await listConversations();
    return NextResponse.json({ conversations });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = body.id || crypto.randomUUID();
    const conv = await createConversation(id, body.title || "New deliberation");
    return NextResponse.json({ conversation: conv });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
