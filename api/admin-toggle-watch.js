import { findParticipant, saveParticipant } from "./_blob.js";
import { authed } from "./_auth.js";

export default async function handler(req, res) {
  if (!authed(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const { emptype, name, empId, videoId, action } = req.body ?? {};

  if ((!empId && !name) || !videoId) {
    return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน (ต้องระบุ empId หรือ name และ videoId)" });
  }

  try {
    const user = await findParticipant({ emptype, name, empId });
    if (!user) {
      return res.status(404).json({ error: "ไม่พบข้อมูลผู้ลงทะเบียนในระบบ" });
    }

    if (!user.watched) user.watched = [];
    if (!user.watchedAt) user.watchedAt = {};

    const now = new Date();
    const tzOffset = 7 * 60; // mins
    const localTime = new Date(now.getTime() + tzOffset * 60000);
    const formattedDate = `${localTime.getUTCFullYear()}-${String(localTime.getUTCMonth() + 1).padStart(2, '0')}-${String(localTime.getUTCDate()).padStart(2, '0')} ${String(localTime.getUTCHours()).padStart(2, '0')}:${String(localTime.getUTCMinutes()).padStart(2, '0')}`;

    if (action === "unmark") {
      // Remove watch status
      user.watched = user.watched.filter(id => id !== videoId);
      delete user.watchedAt[videoId];
    } else {
      // Mark as watched (default)
      if (!user.watched.includes(videoId)) {
        user.watched.push(videoId);
      }
      if (!user.watchedAt[videoId]) {
        user.watchedAt[videoId] = formattedDate;
      }
    }

    await saveParticipant(user);
    res.status(200).json({ ok: true, user });
  } catch (e) {
    console.error("Admin toggle watch error:", e);
    res.status(500).json({ error: e.message || "server error" });
  }
}
