// GET  /api/store?key=state/roadmap      -> { value }
// POST /api/store { key, value }         -> { ok }   (value null deletes)
// Backed by Upstash Redis (Vercel Marketplace "Upstash for Redis" sets KV_REST_API_URL / KV_REST_API_TOKEN).
// Without those env vars it falls back to an in-memory map, which resets on each cold start (fine for local dev only).
import { Redis } from "@upstash/redis";

const mem = globalThis.__gxtMem || (globalThis.__gxtMem = new Map());
function redis() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}
const ns = (k) => "gxt:" + String(k).replace(/[^A-Za-z0-9_\-./:]/g, "");

export default async function handler(req, res) {
  const r = redis();
  if (req.method === "GET") {
    const key = req.query.key;
    if (!key) return res.status(400).json({ error: "key is required" });
    const value = r ? await r.get(ns(key)) : mem.get(ns(key)) ?? null;
    return res.status(200).json({ value, persistent: !!r });
  }
  if (req.method === "POST") {
    const { key, value } = req.body || {};
    if (!key) return res.status(400).json({ error: "key is required" });
    if (JSON.stringify(value ?? null).length > 900000) return res.status(413).json({ error: "value too large" });
    if (r) value == null ? await r.del(ns(key)) : await r.set(ns(key), value);
    else value == null ? mem.delete(ns(key)) : mem.set(ns(key), value);
    return res.status(200).json({ ok: true, persistent: !!r });
  }
  return res.status(405).json({ error: "GET or POST only" });
}
