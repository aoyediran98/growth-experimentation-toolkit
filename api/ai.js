// POST /api/ai  { input: string | [{role, content}], json: boolean, tier: "quick"|"default"|"complex" }
import Anthropic from "@anthropic-ai/sdk";

const MODELS = { quick: "claude-haiku-5-5", default: "claude-sonnet-5-5", complex: "claude-sonnet-5-5" };
// Reasoning tokens count against max_tokens and were cutting the JSON short; the methods are explicit enough without them.
// Each model names its "off" setting differently.
const THINKING_OFF = { quick: "disabled", default: "between_tools", complex: "between_tools" };

function parseJSON(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let error;
  for (const s of [cleaned, cleaned.match(/[\[{][\s\S]*[\]}]/)?.[0]]) {
    if (!s) continue;
    try {
      return { value: JSON.parse(s) };
    } catch (e) {
      error = error || e.message;
    }
  }
  return { error: error || "no JSON found" };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set" });
  const { input, json = false, tier = "default" } = req.body || {};
  if (!input) return res.status(400).json({ error: "input is required" });
  const messages = typeof input === "string" ? [{ role: "user", content: input }] : input;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const ask = async (msgs) => {
    const msg = await client.messages.create({
      model: MODELS[tier] || MODELS.default,
      max_tokens: 16000,
      thinking: { type: THINKING_OFF[tier] || THINKING_OFF.default },
      system: json ? "Respond with valid JSON only. No prose, no code fences. Escape any double quotes inside string values." : undefined,
      messages: msgs,
    });
    return { text: msg.content.filter((b) => b.type === "text").map((b) => b.text).join(""), cut: msg.stop_reason === "max_tokens" };
  };
  try {
    let out = await ask(messages);
    if (!json) return res.status(200).json({ text: out.text });
    let parsed = parseJSON(out.text);
    // One repair attempt: hand the broken output back with the parser's complaint.
    if (parsed.error && !out.cut) {
      out = await ask([...messages, { role: "assistant", content: out.text }, { role: "user", content: `That was not valid JSON (${parsed.error}). Return the same content as corrected, valid JSON only.` }]);
      parsed = parseJSON(out.text);
    }
    if (!parsed.error) return res.status(200).json({ value: parsed.value });
    return res.status(502).json({ error: out.cut ? "The answer was too long and got cut off. Try fewer inputs." : "Model did not return valid JSON. Try again." });
  } catch (e) {
    const status = e?.status === 429 ? 429 : 500;
    return res.status(status).json({ error: e?.message || "AI request failed" });
  }
}
