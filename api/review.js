// Growth Suite ↔ CRO Review System bridge (owner-only, stateless).
// Composes a stakeholder review from the packaged CRO Review template (vendored unchanged under
// lib/review-template) and publishes it under YOUR OWN accounts only:
//   - provider "vercel": the review is stored in your Vercel Blob store and served from this deployment at /r/<id>
//   - provider "here.now": your own here.now account (HERENOW_KEY + HERENOW_ACCOUNT), same create/upload/finalize flow as the plugin
// No shared workspace, no shared key, and nothing is written to the suite's history or Redis: the sharing receipt
// is returned to the browser and sent back when the same review is re-published. Comments live inside the review page.
//
// POST /api/review
//   { action:"capture", url }                                   → { html, title, warnings }
//   { action:"build",   review }                                → { html, size, sha256 }
//   { action:"share",   review }                                → { stakeholderUrl, strategistUrl, versionId, sha256, ... }
//   { action:"status",  id }                                    → { receipt }
//
// review = { id, title, slug, control:{ label, html, anchors }, variants:[{ key, name, html, anchors, notes:[...] }],
//            experimentName, defaultVariant, viewport:"mobile"|"desktop" }
//
// Env: REVIEW_SHARE_TOKEN (required; only requests carrying it may capture, build or publish),
//      BLOB_READ_WRITE_TOKEN (Vercel Blob, provider "vercel") and/or HERENOW_KEY + HERENOW_ACCOUNT (your here.now account).
import fs from "fs";
import path from "path";
import crypto from "crypto";
import zlib from "zlib";
import { put, list, del } from "@vercel/blob";
import { Redis } from "@upstash/redis";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

const TPL = path.join(process.cwd(), "lib", "review-template");
const API = "https://here.now";
const ACCOUNT = (process.env.HERENOW_ACCOUNT || "").trim();
const CAPS = ["annotations", "interactive-previews", "saved-review-files", "ai-handoffs"];
const SURFACE_MARKER = '<script id="vx-runtime-surface"';

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const enc = (v) => JSON.stringify(v).replace(/<\//g, "<\\/");
const block = (id, v) => `<script id="${id}" type="application/json">${enc(v)}</script>\n`;
const slugify = (s) => String(s || "review").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, 40).replace(/-+$/, "") || "review";
const keyOf = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "v";
const text = (v, label) => { if (typeof v !== "string" || !v.trim()) throw new Error(`${label} is required`); return v; };


/* ---------- template (read once per instance) ---------- */
let tpl = null;
function template() {
  if (tpl) return tpl;
  const read = (f) => fs.readFileSync(path.join(TPL, f), "utf8");
  tpl = { shell: read("shell.html"), review: read("review-shell.html"), styles: read("styles.css"), surface: read("runtime/surface.js"), workflow: read("runtime/workflow.js"), version: read("VERSION").trim() };
  return tpl;
}

/* ---------- manifest → review HTML (port of crodeck.compose for the neutral template) ---------- */
function normalise(review) {
  const r = review || {};
  const id = text(r.id, "review.id");
  const title = text(r.title, "review.title").slice(0, 120);
  const slug = slugify(r.slug || title);
  const control = r.control || {};
  const controlHtml = text(control.html, "control.html");
  const controlLabel = (control.label || "Control (reconstruction from captured HTML)").trim();
  if (!/\b(concept|reconstruction)\b/i.test(controlLabel)) throw new Error("Control label must say concept or reconstruction: the suite cannot verify a live capture");
  if (/\blive\b/i.test(controlLabel)) throw new Error("Control label must not claim a live control");
  if (/file:\/\/|\/Users\/|\/home\/|(?<![A-Za-z])[A-Za-z]:[\\/]/.test(controlHtml)) throw new Error("Control HTML contains a machine-local path");
  const variants = Array.isArray(r.variants) ? r.variants : [];
  if (!variants.length) throw new Error("At least one variant is required");
  const seen = new Set();
  const vs = variants.map((v, i) => {
    const key = keyOf(v.key || v.name || "v" + (i + 1));
    if (seen.has(key)) throw new Error("Duplicate variant key " + key); seen.add(key);
    const html = text(v.html, `variants[${i}].html`);
    if (/vx-runtime-surface|vx-experiments/.test(html)) throw new Error("A review cannot be embedded as a variant");
    const anchors = v.anchors && typeof v.anchors === "object" ? v.anchors : {};
    const notes = (Array.isArray(v.notes) ? v.notes : []).map((n, k) => {
      const kind = n.kind === "new" ? "new" : "imp";
      const note = { kind, title: text(n.title, `notes[${k}].title`), body: text(n.body, `notes[${k}].body`) };
      if (kind === "imp") note.before = text(n.before, `notes[${k}].before`);
      note.after = text(n.after, `notes[${k}].after`);
      if (kind === "imp") note.control = text(n.control, `notes[${k}].control`);
      note.variant = text(n.variant, `notes[${k}].variant`);
      for (const f of ["variant", "control"]) if (note[f] && !/^\[data-a=(["'])([^"']+)\1\]$/.test(note[f])) throw new Error(`notes[${k}].${f} must be a logical anchor like [data-a="headline"]`);
      return note;
    });
    return { key, name: v.name || key.toUpperCase(), html, anchors, notes };
  });
  const viewport = r.viewport === "desktop" ? "desktop" : "mobile";
  const defaultVariant = vs.some((v) => v.key === keyOf(r.defaultVariant)) ? keyOf(r.defaultVariant) : vs[0].key;
  return { id, title, slug, controlHtml, controlLabel, controlAnchors: control.anchors && typeof control.anchors === "object" ? control.anchors : {}, variants: vs, viewport, defaultVariant, experimentName: (r.experimentName || "Experiment 1 · " + title).slice(0, 120) };
}

function compose(m, hostedUrl, provider = "here.now") {
  const t = template();
  const experiment = { id: "exp-1", name: m.experimentName, control: "control", variants: m.variants.map((v) => v.key), decks: ["landing"], viewports: ["mobile", "desktop"], capabilities: CAPS, defaults: { deck: "landing", viewport: m.viewport, variant: m.defaultVariant } };
  if (m.variants.every((v) => v.notes.length)) experiment.notes = Object.fromEntries(m.variants.map((v) => [v.key, v.notes]));
  const experiments = [experiment];
  // inject_foundation
  const meta = `<meta name="vx-decks" content="landing">\n<meta name="vx-viewports" content="mobile,desktop">\n<meta name="vx-capabilities" content="${CAPS.join(",")}">\n<meta name="vx-interactive" content="landing">\n`;
  let doc = t.review.replace("<title>", meta + "<title>");
  const ts = doc.indexOf("<title>") + 7, te = doc.indexOf("</title>", ts);
  doc = doc.slice(0, ts) + m.title + doc.slice(te);
  // registries
  const controls = { control: { kind: "html", label: m.controlLabel, provenance: "concept-reconstruction", source: "control/control.html", sha256: sha(m.controlHtml), html: m.controlHtml, anchors: m.controlAnchors } };
  const protos = {};
  for (const v of m.variants) for (const vp of ["mobile", "desktop"]) protos[`${v.key}-${vp}`] = { source: `variants/${v.key}.html`, sha256: sha(v.html), html: v.html, anchors: v.anchors };
  const journey = { controlLabel: "CONTROL", variantLabel: "VARIANT", controlSteps: [], variantSteps: [] };
  const registries = block("vx-foundation-source", null) + block("vx-project", { projectSlug: m.slug, version: "0.1.0" }) + block("vx-experiments", experiments) + block("vx-journey", journey) + block("vx-control-sources", controls) + block("vx-prototype-sources", protos);
  const values = { "{{DOCUMENT}}": doc, "{{PROTOTYPES}}": registries, "{{STATE}}": "", "{{STYLES}}": t.styles, "{{SURFACE}}": t.surface, "{{WORKFLOW}}": t.workflow };
  let shell = t.shell;
  for (const [k, v] of Object.entries(values)) { if (shell.split(k).length !== 2) throw new Error("Shell marker must occur once: " + k); shell = shell.replace(k, () => v); }
  if (hostedUrl) {
    if (shell.split(SURFACE_MARKER).length !== 2) throw new Error("Review surface marker missing");
    shell = shell.replace(SURFACE_MARKER, () => block("vx-hosted-review", { provider, workspace: provider === "vercel" ? new URL(hostedUrl).host : ACCOUNT, url: hostedUrl }) + SURFACE_MARKER);
  }
  if (/hnk_[a-f0-9]{64}/i.test(shell)) throw new Error("A credential was found in the review; nothing was built");
  return shell;
}

/* ---------- here.now adapter (port of share_review.py) ---------- */
function key() {
  const k = (process.env.HERENOW_KEY || "").trim();
  if (!/^hnk_[a-f0-9]{64}$/.test(k)) throw new Error("HERENOW_KEY is not set: add an API key from your own here.now account");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ACCOUNT)) throw new Error("HERENOW_ACCOUNT is not set: use your own here.now workspace subdomain");
  return k;
}
async function hn(endpoint, method = "GET", body) {
  const r = await fetch(API + endpoint, { method, headers: { Authorization: "Bearer " + key(), "X-HereNow-Account": ACCOUNT, "X-HereNow-Client": "growth-suite/review-share", "Content-Type": "application/json", "User-Agent": "CRO-Review-System/1.0" }, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  if (!r.ok) throw new Error(`here.now HTTP ${r.status} on ${method} ${endpoint}; publication was not verified`);
  const j = await r.json().catch(() => null);
  if (!j || typeof j !== "object") throw new Error("here.now returned an invalid API response");
  return j;
}
const publicUrl = (u) => { if (!new RegExp("^https://[a-z0-9]+(?:-[a-z0-9]+)*\\." + ACCOUNT.replace(/[-]/g, "\\-") + "\\.here\\.now/$").test(u || "")) throw new Error("Provider did not return a plain HTTPS DigEx workspace URL"); return u; };

async function shareHereNow(m, incoming) {
  const receipt = incoming && incoming.provider === "here.now" ? { ...incoming } : {};
  if (receipt.provider && (receipt.provider !== "here.now" || receipt.account !== ACCOUNT)) throw new Error("Sharing receipt belongs to another workspace");
  const label = receipt.label || `${m.slug}-${sha(m.id).slice(0, 8)}`;
  const expected = publicUrl(receipt.url || `https://${label}.${ACCOUNT}.here.now/`);
  Object.assign(receipt, { provider: "here.now", account: ACCOUNT, projectId: m.id, label });
  let slug = receipt.slug;
  if (slug) {
    const d = await hn("/api/v1/publish/" + slug);
    if (d.currentVersionId && ![receipt.versionId, receipt.pendingVersionId].includes(d.currentVersionId)) throw new Error("The live review changed elsewhere; it was not overwritten");
  }
  async function publish(payload) {
    const files = [{ path: "index.html", size: Buffer.byteLength(payload), contentType: "text/html; charset=utf-8", hash: sha(payload) }];
    let staged;
    if (!slug) {
      receipt.createUncertain = true;
      staged = await hn("/api/v1/publish", "POST", { account: ACCOUNT, workspaceLabel: label, workspaceLabelStrategy: "exact", displayName: m.title.slice(0, 80), displayDescription: "CRO review project " + m.id, files });
      slug = staged.slug;
      if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("here.now did not return a valid site identity");
      receipt.slug = slug; delete receipt.createUncertain;
    } else {
      staged = await hn("/api/v1/publish/" + slug, "PUT", { files });
      if (staged.slug !== slug) throw new Error("here.now changed the site identity during update");
    }
    const up = staged.upload;
    if (!up || typeof up.versionId !== "string" || !up.versionId) throw new Error("here.now returned an invalid upload version");
    receipt.pendingVersionId = up.versionId;
    for (const item of up.uploads || []) {
      if (item.path !== "index.html" || !/^https:/.test(item.url || "")) throw new Error("Invalid upload target; only index.html may be published");
      const r = await fetch(item.url, { method: "PUT", headers: { "User-Agent": "CRO-Review-System/1.0", ...(item.headers || {}) }, body: payload });
      if (!r.ok) throw new Error("here.now upload failed with HTTP " + r.status);
    }
    const fin = await hn(`/api/v1/publish/${slug}/finalize`, "POST", { versionId: up.versionId });
    if (fin.success !== true || typeof fin.currentVersionId !== "string" || (fin.currentVersionId !== up.versionId && fin.unchanged !== true)) throw new Error("here.now did not finalize the review");
    const st = fin.publishStatus || {};
    if (st.ownership !== "workspace" || st.persistence !== "permanent" || st.state !== "live") throw new Error("Publication did not meet the permanent DigEx workspace contract");
    publicUrl(fin.accountUrl);
    receipt.versionId = fin.currentVersionId; receipt.url = fin.accountUrl; delete receipt.pendingVersionId;
    return fin;
  }
  let html = compose(m, expected);
  let fin = await publish(html);
  if (fin.accountUrl !== expected) { html = compose(m, fin.accountUrl); fin = await publish(html); if (fin.accountUrl !== receipt.url) throw new Error("Workspace URL changed during publication"); }
  await hn(`/api/v1/publish/${slug}/access`, "PATCH", { mode: "anyone_with_link" });
  const access = await hn(`/api/v1/publish/${slug}/access`);
  if (!access.access || access.access.mode !== "anyone_with_link") throw new Error("The published review is not set to anyone with the link");
  const url = publicUrl(fin.accountUrl);
  const hash = sha(html);
  const check = await fetch(url, { headers: { "Cache-Control": "no-cache", "User-Agent": "CRO-Review-System/1.0" }, redirect: "manual" });
  if (!check.ok || sha(await check.text()) !== hash) throw new Error("Public URL does not serve the published HTML yet; try Share again in a moment");
  receipt.sha256 = hash; receipt.sharedAt = new Date().toISOString(); receipt.title = m.title;
  return { status: "published", provider: "here.now", access: "anyone_with_link", account: ACCOUNT, stakeholderUrl: url, strategistUrl: url + "?view=strategist", siteUrl: fin.siteUrl, versionId: fin.currentVersionId, sha256: hash, size: Buffer.byteLength(html), receipt };
}

/* ---------- provider "vercel": your own Blob store, served from this deployment at /r/<id> ---------- */
const hasBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

/* ---------- provider "redis": the toolkit's existing Upstash database, served from this deployment at /r/<id> ----------
   Only what is unique to the review (control, variants, notes) is stored, gzipped; the page is rebuilt from the template
   in lib/review-template whenever the link is opened, so each record stays far below the database's size limit. */
function redisClient() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}
const hasRedis = () => !!redisClient();
const reviewKey = (id) => "gxt:review:" + id;
const pack = (v) => zlib.gzipSync(JSON.stringify(v)).toString("base64");
const unpack = (s) => JSON.parse(zlib.gunzipSync(Buffer.from(s, "base64")).toString("utf8"));
async function shareRedis(m, req, incoming) {
  const r = redisClient();
  if (!r) throw new Error("The toolkit database is not connected to this project");
  const id = incoming && incoming.provider === "redis" && incoming.id ? incoming.id : `${m.slug}-${sha(m.id).slice(0, 8)}`;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error("Invalid review id");
  const url = `${origin(req)}/r/${id}`;
  const html = compose(m, url, "vercel");
  const hash = sha(html);
  const data = pack({ m, url });
  if (data.length > 900000) throw new Error("This review is too large for the toolkit database; use a smaller control page or connect a Vercel Blob store");
  const sharedAt = new Date().toISOString();
  await r.set(reviewKey(id), { v: 1, data, sha256: hash, sharedAt, title: m.title });
  const back = await r.get(reviewKey(id));
  if (!back || back.data !== data) throw new Error("Stored review could not be read back; try again");
  const receipt = { provider: "redis", id, sha256: hash, sharedAt, title: m.title };
  return { status: "published", provider: "redis", access: "anyone_with_link", stakeholderUrl: url, strategistUrl: url + "?view=strategist", sha256: hash, size: Buffer.byteLength(html), stored: data.length, receipt };
}
async function readRedis(id) {
  const r = redisClient();
  if (!r) return null;
  const rec = await r.get(reviewKey(id));
  if (!rec || !rec.data) return null;
  const { m, url } = unpack(rec.data);
  return compose(m, url, "vercel");
}
function origin(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0];
  if (!host) throw new Error("Cannot determine this deployment's host");
  return `${proto}://${host}`;
}
async function shareVercel(m, req, incoming) {
  if (!hasBlob()) throw new Error("BLOB_READ_WRITE_TOKEN is not set: connect a Vercel Blob store to this project");
  const id = incoming && incoming.provider === "vercel" && incoming.id ? incoming.id : `${m.slug}-${sha(m.id).slice(0, 8)}`;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error("Invalid review id");
  const url = `${origin(req)}/r/${id}`;
  const html = compose(m, url, "vercel");
  const hash = sha(html);
  const blob = await put(`reviews/${id}.html`, html, { access: "public", contentType: "text/html; charset=utf-8", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 });
  const check = await fetch(blob.url, { cache: "no-store" });
  if (!check.ok || sha(await check.text()) !== hash) throw new Error("Stored review could not be read back; try again");
  const receipt = { provider: "vercel", id, blobUrl: blob.url, sha256: hash, sharedAt: new Date().toISOString(), title: m.title };
  return { status: "published", provider: "vercel", access: "anyone_with_link", stakeholderUrl: url, strategistUrl: url + "?view=strategist", blobUrl: blob.url, sha256: hash, size: Buffer.byteLength(html), receipt };
}
export async function readReview(id) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id || "")) return null;
  const fromDb = await readRedis(id);
  if (fromDb || !hasBlob()) return fromDb;
  const { blobs } = await list({ prefix: `reviews/${id}.html`, limit: 1 });
  const b = blobs.find((x) => x.pathname === `reviews/${id}.html`);
  if (!b) return null;
  const r = await fetch(b.url, { cache: "no-store" });
  return r.ok ? await r.text() : null;
}
async function unshareVercel(id) { const { blobs } = await list({ prefix: `reviews/${id}.html`, limit: 1 }); for (const b of blobs) if (b.pathname === `reviews/${id}.html`) await del(b.url); return { removed: true }; }

/* ---------- owner check: only requests carrying your REVIEW_SHARE_TOKEN may use this API ---------- */
function authorised(req) {
  const want = (process.env.REVIEW_SHARE_TOKEN || "").trim();
  if (!want) return false;
  const got = String(req.headers["x-review-token"] || "").trim();
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/* ---------- capture: fetch a public page and make its URLs absolute ---------- */
async function capture(url) {
  let u; try { u = new URL(url); } catch { throw new Error("Enter a full URL starting with https://"); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) URLs can be captured");
  const privateHost = (h) => /^(localhost|.*\.localhost|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:|\[?fe80:)/i.test(h);
  if (privateHost(u.hostname)) throw new Error("Private addresses cannot be captured");
  // Follow redirects by hand so a public URL cannot bounce the server onto a private address.
  let r, hops = 0;
  for (;;) {
    r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (compatible; GrowthSuite/1.0)", Accept: "text/html" }, redirect: "manual" });
    const loc = r.status >= 300 && r.status < 400 && r.headers.get("location");
    if (!loc) break;
    if (++hops > 5) throw new Error("Too many redirects");
    u = new URL(loc, u);
    if (!/^https?:$/.test(u.protocol) || privateHost(u.hostname)) throw new Error("The page redirected to an address that cannot be captured");
  }
  if (!r.ok) throw new Error("Page returned HTTP " + r.status);
  let html = await r.text();
  if (html.length > 3_500_000) throw new Error("Page is too large to capture here; save it with SingleFile and upload the file instead");
  const base = u.href;
  const abs = (ref) => { try { return new URL(ref, base).href; } catch { return ref; } };
  html = html.replace(/(<(?:img|script|link|source|video|audio|iframe)\b[^>]*?\s(?:src|href)=)(["'])(?!https?:|data:|#|mailto:|javascript:|\/\/)([^"']+)\2/gi, (s, a, q, ref) => `${a}${q}${abs(ref)}${q}`);
  html = html.replace(/url\(\s*(["']?)(?!https?:|data:|\/\/)([^"')]+)\1\s*\)/gi, (s, q, ref) => `url(${q}${abs(ref)}${q})`);
  html = html.replace(/<base\b[^>]*>/gi, "");
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) html = html.replace(/<head[^>]*>/i, (h) => h + '<meta name="viewport" content="width=device-width, initial-scale=1">');
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || u.hostname;
  const warnings = [];
  if (!/^\s*<!doctype\s+html/i.test(html)) { html = "<!DOCTYPE html>\n" + html; warnings.push("Added a missing <!DOCTYPE html>"); }
  if (!/<main\b/i.test(html)) warnings.push("Page has no <main>; the review still renders it but the plugin's strict builder would ask for one");
  warnings.push("Captured copy keeps remote images and scripts (not self-contained). For a verified live control use the plugin's Localize Control step and upload the result.");
  return { html, title: title.trim().slice(0, 120), warnings, sourceUrl: base };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { action } = req.body || {};
  const providers = [];
  if (hasRedis()) providers.push("redis");
  if (hasBlob()) providers.push("vercel");
  let hn = true; try { key(); } catch { hn = false; }
  if (hn) providers.push("here.now");
  const configured = !!(process.env.REVIEW_SHARE_TOKEN || "").trim();
  try {
    if (action === "status") return res.status(200).json({ tokenRequired: true, tokenConfigured: configured, authorised: authorised(req), providers, account: hn ? ACCOUNT : null, templateVersion: template().version });
    if (!configured) return res.status(503).json({ error: "REVIEW_SHARE_TOKEN is not set on this deployment; set it so only you can build and publish reviews" });
    if (!authorised(req)) return res.status(401).json({ error: "Your publish token is missing or wrong" });
    if (action === "capture") return res.status(200).json(await capture(req.body.url));
    if (action === "build") { const html = compose(normalise(req.body.review), null); return res.status(200).json({ html, size: Buffer.byteLength(html), sha256: sha(html), templateVersion: template().version }); }
    if (action === "share") {
      const m = normalise(req.body.review);
      const want = req.body.provider || (req.body.receipt && req.body.receipt.provider) || providers[0];
      if (!providers.includes(want)) throw new Error(want ? `Provider ${want} is not configured on this deployment` : "No publishing provider is configured: connect the toolkit database (Upstash Redis), a Vercel Blob store or your own here.now key");
      return res.status(200).json(want === "redis" ? await shareRedis(m, req, req.body.receipt) : want === "vercel" ? await shareVercel(m, req, req.body.receipt) : await shareHereNow(m, req.body.receipt));
    }
    if (action === "unshare") { const uid = String(req.body.id || ""); const r = redisClient(); if (r && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(uid) && (await r.del(reviewKey(uid)))) return res.status(200).json({ removed: true }); if (!hasBlob()) throw new Error("No review with that id is stored here"); return res.status(200).json(await unshareVercel(String(req.body.id || ""))); }
    return res.status(400).json({ error: "unknown action" });
  } catch (e) {
    return res.status(400).json({ error: e?.message || "review error" });
  }
}
