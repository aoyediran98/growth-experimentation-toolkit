import { Redis } from "@upstash/redis";
export default async function handler(req, res) {
  const id = String(req.query.id || "").replace(/[^a-z0-9]/gi, "");
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  let d = null;
  if (url && token) d = await new Redis({ url, token }).get("blob:" + id); else d = (globalThis.__ideBlobs || new Map()).get(id);
  const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(d || "");
  if (!m) return res.status(404).end();
  res.setHeader("content-type", m[1]); res.setHeader("cache-control", "public, max-age=31536000, immutable");
  return res.end(Buffer.from(m[2], "base64"));
}
