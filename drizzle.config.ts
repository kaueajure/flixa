import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "mysql",
  dbCredentials: {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || "3306"),
    user: process.env.MYSQL_USER || "",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "",
  },
});
