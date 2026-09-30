import { Redis } from "@upstash/redis";

let redisClient: Redis | null = null;

function getRedis(): Redis | null {
  if (redisClient) return redisClient;

  const url = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/["'\[\]]/g, "").trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || "").replace(/["'\[\]]/g, "").trim();

  if (url && url.startsWith("https://") && token) {
    try {
      redisClient = new Redis({ url, token });
      return redisClient;
    } catch (e) {
      console.warn("Failed to initialize Redis client:", e);
      return null;
    }
  }

  return null;
}

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

  const redis = getRedis();
  if (redis) {
    try {
      await redis.hset(`conv:${id}`, conv as Record<string, unknown>);
      await redis.lpush("conversations:index", id);
    } catch (err) {
      console.warn("Redis createConversation error:", err);
    }
  }
  return conv;
}

export async function listConversations(): Promise<StoredConversation[]> {
  const redis = getRedis();
  if (!redis) return [];

  try {
    const ids: string[] = await redis.lrange("conversations:index", 0, 50);
    if (!ids || ids.length === 0) return [];

    const results: StoredConversation[] = [];
    for (const id of ids) {
      const data = await redis.hgetall<StoredConversation>(`conv:${id}`);
      if (data && data.id) results.push(data);
    }
    return results;
  } catch (err) {
    console.warn("Redis listConversations error:", err);
    return [];
  }
}

export async function getConversationMessages(
  conversationId: string
): Promise<StoredMessage[]> {
  const redis = getRedis();
  if (!redis) return [];

  try {
    const raw = await redis.lrange(`messages:${conversationId}`, 0, -1);
    return raw.map((item) => (typeof item === "string" ? JSON.parse(item) : item));
  } catch (err) {
    console.warn("Redis getConversationMessages error:", err);
    return [];
  }
}

export async function appendMessage(
  conversationId: string,
  message: StoredMessage
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.rpush(`messages:${conversationId}`, JSON.stringify(message));
    await redis.hset(`conv:${conversationId}`, { updatedAt: new Date().toISOString() });
  } catch (err) {
    console.warn("Redis appendMessage error:", err);
  }
}

export async function updateConversationTitle(
  conversationId: string,
  title: string
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.hset(`conv:${conversationId}`, { title });
  } catch (err) {
    console.warn("Redis updateConversationTitle error:", err);
  }
}
