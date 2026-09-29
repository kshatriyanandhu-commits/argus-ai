import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export * from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("DATABASE_URL is not configured.");
}

const pool = new Pool({
  connectionString: connectionString || "",
  ssl: {
    rejectUnauthorized: false,
  },
});

export const db = drizzle(pool, { schema });
