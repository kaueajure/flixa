import appSettings from "../config/app.json" with { type: "json" };
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
const origin = appSettings.publicUrl;
const providerArg = process.argv.slice(2).find((arg) => arg.startsWith("--provider="));
const provider = providerArg?.slice("--provider=".length) || "syln";
if (provider !== "syln" && provider !== "dramabox") throw new Error("Provedor inválido: use syln ou dramabox.");
const arg = name => process.argv.slice(2).find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const feed = arg("feed") || "catalog";
const page = Number(arg("page") || 1);
const category = arg("category");
const platform = arg("platform");
if (platform && (provider !== "syln" || platform !== "dramabox")) throw new Error("Use --provider=syln --platform=dramabox.");
if (!["catalog", "latest", "recommended", "trending", "category"].includes(feed) || !Number.isSafeInteger(page) || page < 1 || page > 10 || (feed === "category" && !/^\d{1,32}$/.test(category || ""))) throw new Error("Lista, categoria ou página inválida.");
const token = process.env.MINISERIES_REFRESH_SECRET;
if (!origin || !token) throw new Error("Configure publicUrl em config/app.json e MINISERIES_REFRESH_SECRET.");
const url = new URL("/api/admin/miniseries", origin);
if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") throw new Error("Use HTTPS.");
const response = await fetch(url, {
  method: "POST", redirect: "error", signal: AbortSignal.timeout(provider === "dramabox" ? 75000 : 25000),
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ action: "refresh", page, provider, feed, category, platform }),
});
console.log(JSON.stringify({ status: response.status, result: await response.json() }));
if (!response.ok) process.exitCode = 1;
