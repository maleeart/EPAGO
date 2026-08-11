import { readAllParticipants } from "./_blob.js";
import { authed } from "./_auth.js";

export default async function handler(req, res) {
  if (!authed(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" });

  try {
    const list = await readAllParticipants();
    res.status(200).json({ ok: true, participants: list });
  } catch (e) {
    console.error("Fetch participants error:", e);
    res.status(500).json({ error: e.message || "server error" });
  }
}
