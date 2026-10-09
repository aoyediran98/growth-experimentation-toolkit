// Shared passcode gate for /api/*. The page sends the passcode in the x-gxt-passcode header.
// APP_PASSCODE set   -> header must match.
// APP_PASSCODE unset -> open in local dev, refused in production (so a deploy can never be open by accident).
import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s) => createHash("sha256").update(String(s)).digest();

export function checkPasscode(req, res) {
  const expected = process.env.APP_PASSCODE;
  if (!expected) {
    if (process.env.VERCEL_ENV !== "production") return true;
    res.status(503).json({ error: "APP_PASSCODE is not set" });
    return false;
  }
  const given = req.headers["x-gxt-passcode"] || "";
  if (timingSafeEqual(digest(given), digest(expected))) return true;
  res.status(401).json({ error: "Passcode required" });
  return false;
}
