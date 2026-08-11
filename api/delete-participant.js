import { removeParticipant } from "./_blob.js";
import { authed } from "./_auth.js";

export default async function handler(req, res) {
  if (!authed(req, res)) return;
  if (req.method !== "DELETE") return res.status(405).json({ error: "method not allowed" });

  const { url } = req.body ?? {};
  if (typeof url !== "string" || !url.startsWith("https://")) {
    return res.status(400).json({ error: "invalid url" });
  }

  try {
    await removeParticipant(url);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Delete participant error:", e);
    res.status(500).json({ error: e.message || "server error" });
  }
}
