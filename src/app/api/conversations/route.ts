import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { argusConversations } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 500 });
    }

    const conversations = await db
      .select({
        id: argusConversations.id,
        title: argusConversations.title,
        createdAt: argusConversations.createdAt,
        updatedAt: argusConversations.updatedAt,
      })
      .from(argusConversations)
      .orderBy(desc(argusConversations.updatedAt));

    return NextResponse.json({ conversations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch conversations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "New deliberation";

    const id = crypto.randomUUID();
    const now = new Date();

    const [conversation] = await db
      .insert(argusConversations)
      .values({
        id,
        title,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create conversation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing conversation id" }, { status: 400 });
    }

    await db.delete(argusConversations).where(eq(argusConversations.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete conversation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
