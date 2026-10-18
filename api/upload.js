// POST /api/upload { name, dataUrl } -> { url }   Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is set, else stores the data URL in the KV store (max 700KB).
import { put } from "@vercel/blob";
import { Redis } from "@upstash/redis";
export const config = { api: { bodyParser: { sizeLimit: "6mb" } } };
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { name = "upload", dataUrl } = req.body || {};
  const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl || "");
  if (!m) return res.status(400).json({ error: "dataUrl required" });
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const buf = Buffer.from(m[2], "base64");
    const blob = await put(`ideation/${id}-${name.replace(/[^\w.\-]/g, "_")}`, buf, { access: "public", contentType: m[1] });
    return res.json({ url: blob.url });
  }
  if (dataUrl.length > 700000) return res.status(413).json({ error: "Image too large without Blob storage; add Vercel Blob or use a smaller image" });
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (url && token) { const r = new Redis({ url, token }); await r.set("blob:" + id, dataUrl); return res.json({ url: "/api/blob?id=" + id }); }
  (globalThis.__ideBlobs ||= new Map()).set(id, dataUrl);
  return res.json({ url: "/api/blob?id=" + id });
}
