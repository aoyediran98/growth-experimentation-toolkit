// GET  /api/store?key=state/roadmap      -> { value }
// POST /api/store { key, value }         -> { ok }   (value null deletes)
// POST /api/store { op, key, field?, value? }  ops: get set del hget hset hdel hgetall sadd smembers mget (value = list of keys)
//   The op form is used by the suite pages (audit reports, ideation sessions); every key is namespaced the same way as the toolkit's.
// Backed by Upstash Redis (Vercel Marketplace "Upstash for Redis" sets KV_REST_API_URL / KV_REST_API_TOKEN).
// Without those env vars it falls back to an in-memory map, which resets on each cold start (fine for local dev only).
import { Redis } from "@upstash/redis";

const mem = globalThis.__gxtMem || (globalThis.__gxtMem = new Map());
const memH = globalThis.__gxtMemH || (globalThis.__gxtMemH = new Map());
function redis() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}
const ns = (k) => "gxt:" + String(k).replace(/[^A-Za-z0-9_\-./:]/g, "");
const tooBig = (v) => JSON.stringify(v ?? null).length > 900000;

async function runOp(r, { op, key, field, value }) {
  const k = ns(key);
  const f = String(field ?? "").slice(0, 200);
  switch (op) {
    case "get":
      return { value: r ? await r.get(k) : mem.get(k) ?? null, persistent: !!r };
    case "set":
      if (r) await r.set(k, value);
      else mem.set(k, value);
      return { ok: true };
    case "del":
      if (r) await r.del(k);
      else (mem.delete(k), memH.delete(k));
      return { ok: true };
    case "hget":
      return { value: r ? await r.hget(k, f) : memH.get(k)?.get(f) ?? null };
    case "hset":
      if (r) await r.hset(k, { [f]: value });
      else (memH.has(k) || memH.set(k, new Map()), memH.get(k).set(f, value));
      return { ok: true };
    case "hdel":
      if (r) await r.hdel(k, f);
      else memH.get(k)?.delete(f);
      return { ok: true };
    case "hgetall":
      return { value: r ? (await r.hgetall(k)) || {} : Object.fromEntries(memH.get(k) || []) };
    case "sadd":
      if (r) await r.sadd(k, value);
      else {
        const s = mem.get(k) || [];
        if (!s.includes(value)) s.push(value);
        mem.set(k, s);
      }
      return { ok: true };
    case "smembers":
      return { value: r ? await r.smembers(k) : mem.get(k) || [] };
    case "mget": {
      const keys = (Array.isArray(value) ? value : []).slice(0, 200).map(ns);
      if (!keys.length) return { value: [] };
      return { value: r ? await r.mget(...keys) : keys.map((x) => mem.get(x) ?? null) };
    }
    default:
      return null;
  }
}

export default async function handler(req, res) {
  const r = redis();
  if (req.method === "GET") {
    const key = req.query.key;
    if (!key) return res.status(400).json({ error: "key is required" });
    const value = r ? await r.get(ns(key)) : mem.get(ns(key)) ?? null;
    return res.status(200).json({ value, persistent: !!r });
  }
  if (req.method === "POST") {
    const body = req.body || {};
    if (body.op) {
      if (!body.key) return res.status(400).json({ error: "key is required" });
      if (tooBig(body.value)) return res.status(413).json({ error: "value too large" });
      try {
        const out = await runOp(r, body);
        return out ? res.status(200).json(out) : res.status(400).json({ error: "unknown op" });
      } catch (e) {
        return res.status(500).json({ error: e?.message || "store error" });
      }
    }
    const { key, value } = body;
    if (!key) return res.status(400).json({ error: "key is required" });
    if (tooBig(value)) return res.status(413).json({ error: "value too large" });
    if (r) value == null ? await r.del(ns(key)) : await r.set(ns(key), value);
    else value == null ? mem.delete(ns(key)) : mem.set(ns(key), value);
    return res.status(200).json({ ok: true, persistent: !!r });
  }
  return res.status(405).json({ error: "GET or POST only" });
}
