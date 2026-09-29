import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { argusConversations, argusMessages } from "@/db/schema";
import { desc, eq, asc } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      const messages = await db
        .select()
        .from(argusMessages)
        .where(eq(argusMessages.conversationId, id))
        .orderBy(asc(argusMessages.createdAt));

      return NextResponse.json({ messages });
    }

    const conversations = await db
      .select()
      .from(argusConversations)
      .orderBy(desc(argusConversations.updatedAt));

    const provider = process.env.AI_PROVIDER || "gemini";
    const hasKey = Boolean(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY);

    return NextResponse.json({
      conversations,
      configured: provider === "ollama" ? true : hasKey,
      model:
        provider === "ollama"
          ? process.env.OLLAMA_MODEL || "llama3.2"
          : process.env.GEMINI_MODEL || "gemini-2.5-flash",
      provider,
      issue: !hasKey && provider !== "ollama" ? "API key not configured in environment." : "",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to fetch conversations.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "New deliberation";

    const newId = crypto.randomUUID();
    const [conversation] = await db
      .insert(argusConversations)
      .values({
        id: newId,
        title,
      })
      .returning();

    return NextResponse.json({ conversation });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create conversation.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing conversation ID." }, { status: 400 });
    }

    await db.delete(argusMessages).where(eq(argusMessages.conversationId, id));
    await db.delete(argusConversations).where(eq(argusConversations.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to delete conversation.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
