import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export * from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("DATABASE_URL is not set. Database operations will fail if called.");
}

const pool = new Pool({
  connectionString: connectionString || "",
  ssl: connectionString?.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
