import { drizzle } from "drizzle-orm/node-postgres";
import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { Pool } from "pg";

// 1. Data Schema
export const conversations = pgTable(
  "argus_conversations",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull().default("New conversation"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("argus_conversations_owner_idx").on(table.ownerId)]
);

export const messages = pgTable(
  "argus_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("argus_messages_conversation_idx").on(table.conversationId)]
);

// 2. Resilient PG Pool Singleton (Prevents connection exhaustion during dev & serverless runs)
const databaseUrl = process.env.DATABASE_URL?.trim();

const globalForDb = globalThis as typeof globalThis & {
  __argusPool?: Pool;
};

export const pool = databaseUrl
  ? (globalForDb.__argusPool ?? new Pool({ connectionString: databaseUrl, max: 10 }))
  : null;

if (pool && process.env.NODE_ENV !== "production") {
  globalForDb.__argusPool = pool;
}

export const db = pool ? drizzle(pool) : null;