// POST /api/ai  { input: string | [{role, content}], json: boolean, tier: "quick"|"default"|"complex" }
import Anthropic from "@anthropic-ai/sdk";
import { checkPasscode } from "./_auth.js";

const MODELS = { quick: "claude-haiku-5-5", default: "claude-sonnet-5-5", complex: "claude-sonnet-5-5" };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!checkPasscode(req, res)) return;
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set" });
  const { input, json = false, tier = "default" } = req.body || {};
  if (!input) return res.status(400).json({ error: "input is required" });
  const messages = typeof input === "string" ? [{ role: "user", content: input }] : input;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const msg = await client.messages.create({
      model: MODELS[tier] || MODELS.default,
      max_tokens: 4000,
      system: json ? "Respond with valid JSON only. No prose, no code fences." : undefined,
      messages,
    });
    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    if (!json) return res.status(200).json({ text });
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      return res.status(200).json({ value: JSON.parse(cleaned) });
    } catch {
      const m = cleaned.match(/[\[{][\s\S]*[\]}]/);
      if (m) return res.status(200).json({ value: JSON.parse(m[0]) });
      return res.status(502).json({ error: "Model did not return valid JSON" });
    }
  } catch (e) {
    const status = e?.status === 429 ? 429 : 500;
    return res.status(status).json({ error: e?.message || "AI request failed" });
  }
}
