// GET /api/demo -> { demo }: true on the public demo deployment, where AI answers are pre-recorded (see api/_demo.js).
import { isDemo } from "./_demo.js";

export default function handler(req, res) {
  res.setHeader("cache-control", "public, max-age=300");
  return res.status(200).json({ demo: isDemo() });
}
