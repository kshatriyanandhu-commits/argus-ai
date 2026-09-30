import { Redis } from "@upstash/redis";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

export interface StoredMessage {
  id: string;
  role: "user" | "model" | "assistant";
  content: string;
  createdAt: string;
}

export interface StoredConversation {
  [key: string]: unknown;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export async function createConversation(
  id: string,
  initialTitle: string = "New deliberation"
): Promise<StoredConversation> {
  const conv: StoredConversation = {
    id,
    title: initialTitle,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (redis) {
    await redis.hset(`conv:${id}`, conv as Record<string, unknown>);
    await redis.lpush("conversations:index", id);
  }
  return conv;
}

export async function listConversations(): Promise<StoredConversation[]> {
  if (!redis) return [];
  const ids: string[] = await redis.lrange("conversations:index", 0, 50);
  if (!ids || ids.length === 0) return [];

  const results: StoredConversation[] = [];
  for (const id of ids) {
    const data = await redis.hgetall<StoredConversation>(`conv:${id}`);
    if (data && data.id) results.push(data);
  }
  return results;
}

export async function getConversationMessages(
  conversationId: string
): Promise<StoredMessage[]> {
  if (!redis) return [];
  const raw = await redis.lrange(`messages:${conversationId}`, 0, -1);
  return raw.map((item) => (typeof item === "string" ? JSON.parse(item) : item));
}

export async function appendMessage(
  conversationId: string,
  message: StoredMessage
): Promise<void> {
  if (!redis) return;
  await redis.rpush(`messages:${conversationId}`, JSON.stringify(message));
  await redis.hset(`conv:${conversationId}`, { updatedAt: new Date().toISOString() });
}

export async function updateConversationTitle(
  conversationId: string,
  title: string
): Promise<void> {
  if (!redis) return;
  await redis.hset(`conv:${conversationId}`, { title });
}
