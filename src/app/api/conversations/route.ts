import { db, conversations, messages } from "@/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getOwner, withOwnerCookie, getProviderStatus } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { ownerId, isNew } = await getOwner();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!db) {
    return withOwnerCookie(
      NextResponse.json({ error: "Database not configured. Run: npm run db:push" }, { status: 503 }),
      ownerId,
      isNew
    );
  }

  try {
    if (id) {
      const [conv] = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, id), eq(conversations.ownerId, ownerId)))
        .limit(1);

      if (!conv) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

      const items = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, id))
        .orderBy(asc(messages.createdAt), asc(messages.id));

      return NextResponse.json({ conversation: conv, messages: items });
    }

    const status = await getProviderStatus();
    const items = await db
      .select()
      .from(conversations)
      .where(eq(conversations.ownerId, ownerId))
      .orderBy(desc(conversations.updatedAt));

    return withOwnerCookie(NextResponse.json({ conversations: items, ...status }), ownerId, isNew);
  } catch (error) {
    console.error("Conversation fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch conversations." }, { status: 500 });
  }
}

export async function POST() {
  const { ownerId, isNew } = await getOwner();
  if (!db) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  try {
    const id = crypto.randomUUID();
    const [conversation] = await db.insert(conversations).values({ id, ownerId }).returning();
    return withOwnerCookie(NextResponse.json({ conversation }, { status: 201 }), ownerId, isNew);
  } catch (error) {
    console.error("Conversation creation error:", error);
    return NextResponse.json({ error: "Could not create conversation." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { ownerId } = await getOwner();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!db || !id) return NextResponse.json({ error: "Missing conversation ID." }, { status: 400 });

  try {
    const deleted = await db
      .delete(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.ownerId, ownerId)))
      .returning({ id: conversations.id });

    if (!deleted.length) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Conversation deletion error:", error);
    return NextResponse.json({ error: "Could not delete conversation." }, { status: 500 });
  }
}