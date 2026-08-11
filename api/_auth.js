import { timingSafeEqual } from "node:crypto";

// Compare password using constant-time check to prevent timing attacks
const matches = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

// Returns true if authenticated, otherwise returns false and sends 401 response
export function authed(req, res) {
  const expected = process.env.ADMIN_PASSWORD || "8888";
  const got = (() => { try { return decodeURIComponent(req.headers["x-admin-password"] ?? ""); } catch { return ""; } })();
  if (!matches(got, expected)) {
    res.status(401).json({ error: "รหัสผ่านไม่ถูกต้อง" });
    return false;
  }
  return true;
}
