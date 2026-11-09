// Demo mode (DEMO_MODE set on the public demo deployment). Not a route: files starting with "_" are not served.
// The demo has no Anthropic key. /api/ai answers from demo/recordings.json, recorded from the example flows:
//   calls:        request key -> the response the live AI gave ({ text } or { value })
//   translations: { es|nl|fr: { english string: translation } }, used string by string so any batch can be answered
// Request keys ignore dates and whitespace, so a recording made today still matches next month.
import fs from "fs";
import path from "path";
import crypto from "crypto";

export const isDemo = () => !!process.env.DEMO_MODE;

let cached = null;
export function recordings() {
  if (!cached) {
    try {
      cached = JSON.parse(fs.readFileSync(path.join(process.cwd(), "demo", "recordings.json"), "utf8"));
    } catch {
      cached = { calls: {}, translations: {} };
    }
  }
  return cached;
}

const norm = (s) => String(s).replace(/\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?/g, "<date>").replace(/\s+/g, " ").trim();

export function demoKey(body) {
  const { input, json = false, tier = "default", images = [] } = body || {};
  const text = typeof input === "string" ? norm(input) : norm(JSON.stringify(input));
  const pics = (Array.isArray(images) ? images : []).map((x) => crypto.createHash("sha256").update(String(x)).digest("hex").slice(0, 16));
  return crypto.createHash("sha256").update(JSON.stringify([text, !!json, tier, pics])).digest("hex");
}

const LANG = { Spanish: "es", Dutch: "nl", French: "fr" };
// The page translator's batch prompt (public/translate.js): instructions, then the JSON array of strings on the last line.
export function translationRequest(body) {
  const s = typeof body?.input === "string" ? body.input : "";
  const m = s.match(/^Translate each string in the JSON array below from English into (Spanish|Dutch|French)\./);
  if (!m) return null;
  try {
    const strings = JSON.parse(s.slice(s.lastIndexOf("\n[") + 1));
    return Array.isArray(strings) ? { lang: LANG[m[1]], strings } : null;
  } catch {
    return null;
  }
}

export function demoAnswer(body, res) {
  const R = recordings();
  const t = translationRequest(body);
  if (t) {
    const d = (R.translations || {})[t.lang] || {};
    return res.status(200).json({ value: t.strings.map((x) => (typeof x === "string" && d[x]) || x) });
  }
  const hit = (R.calls || {})[demoKey(body)];
  if (hit) return res.status(200).json(hit);
  return res.status(403).json({ error: "This is a demo, so the AI answers are pre-recorded for the examples. Use the Load example or Load sample buttons and run those to see real results." });
}

// Each demo visitor gets their own short-lived space in memory, so nobody sees anyone else's changes.
export function visitorScope(req) {
  const ip = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return "v" + crypto.createHash("sha256").update(ip + "|" + String(req.headers?.["user-agent"] || "")).digest("hex").slice(0, 12) + ":";
}
