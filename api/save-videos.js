import { saveVideos } from "./_blob.js";
import { authed } from "./_auth.js";
import { CURRENT_VIDEOS_VERSION } from "./videos.js";

export default async function handler(req, res) {
  if (!authed(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const { videos } = req.body ?? {};

  if (!Array.isArray(videos)) {
    return res.status(400).json({ error: "ข้อมูลวิดีโอไม่ถูกต้อง" });
  }

  try {
    const payload = {
      version: CURRENT_VIDEOS_VERSION,
      videos: videos
    };
    await saveVideos(payload);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Save videos error:", e);
    res.status(500).json({ error: e.message || "server error" });
  }
}
