import { getBlobKey, readParticipant, saveParticipant } from "./_blob.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const { emptype, name, empId, videoId } = req.body ?? {};

  if (!emptype || !name || !videoId) {
    return res.status(400).json({ error: "ข้อมูลสำหรับบันทึกการรับชมไม่ครบถ้วน" });
  }

  try {
    const key = getBlobKey({ emptype, name, empId });
    const user = await readParticipant(key);

    if (!user) {
      return res.status(404).json({ error: "ไม่พบข้อมูลผู้ลงทะเบียนในระบบ" });
    }
    if (!user.watched) {
      user.watched = [];
    }

    if (!user.watched.includes(videoId)) {
      user.watched.push(videoId);
    }

    if (!user.watchedAt) {
      user.watchedAt = {};
    }

    if (!user.watchedAt[videoId]) {
      const now = new Date();
      const tzOffset = 7 * 60; // mins
      const localTime = new Date(now.getTime() + tzOffset * 60000);
      const formattedDate = `${localTime.getUTCFullYear()}-${String(localTime.getUTCMonth() + 1).padStart(2, '0')}-${String(localTime.getUTCDate()).padStart(2, '0')} ${String(localTime.getUTCHours()).padStart(2, '0')}:${String(localTime.getUTCMinutes()).padStart(2, '0')}`;
      user.watchedAt[videoId] = formattedDate;
    }

    await saveParticipant(user);
    res.status(200).json({ ok: true, user });
  } catch (e) {
    console.error("Watched tracking error:", e);
    res.status(500).json({ error: e.message || "server error" });
  }
}
