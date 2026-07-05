import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const files: string[] = []; function walk(dir: string) { for (const ent of readdirSync(dir)) { const p = join(dir, ent); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith(".ts")) files.push(p); } } walk("src/execution-core");
for (const f of files) { const imports = readFileSync(f, "utf8").split("\n").filter((l) => /^import .* from /.test(l)).join("\n"); assert(!/supabase|@supabase|prisma|@prisma|binance.*live|bybit.*live|mt5.*live|MetaTrader/i.test(imports), `forbidden import in ${f}`); }
console.log("forbidden import lint passed");
