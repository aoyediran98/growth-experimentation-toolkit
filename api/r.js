// GET /r/<id>  (rewritten to /api/r?id=<id>) — serves a stakeholder review stored in YOUR Vercel Blob store.
import { readReview } from "./review.js";
export default async function handler(req, res) {
  const id = String(req.query.id || "");
  try {
    const html = await readReview(id);
    if (!html) { res.status(404).setHeader("content-type", "text/html; charset=utf-8"); return res.end("<!doctype html><meta charset=utf-8><title>Review not found</title><p style='font:16px system-ui;padding:32px'>This review link is not live. Ask the person who shared it to publish it again.</p>"); }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "public, max-age=0, must-revalidate");
    res.setHeader("x-robots-tag", "noindex");
    // The review embeds the control and variant pages with their scripts. Sandbox it into an opaque origin so those
    // scripts cannot read this site's storage or act as the toolkit; the template is built to run sandboxed.
    res.setHeader("content-security-policy", "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-downloads allow-modals");
    return res.status(200).end(html);
  } catch (e) { return res.status(500).json({ error: e?.message || "review read failed" }); }
}
