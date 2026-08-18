import { getBlobKey, readParticipant, saveParticipant } from "./_blob.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const { emptype, empId, name, dept, regTime } = req.body ?? {};

  if (!emptype || !name || !dept || !regTime) {
    return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });
  }
  
  if (emptype === "พนักงาน" && !empId) {
    return res.status(400).json({ error: "กรุณาระบุรหัสพนักงาน" });
  }

  try {
    const key = getBlobKey({ emptype, name, empId });
    const existing = await readParticipant(key);

    const bodyWatched = Array.isArray(req.body.watched) ? req.body.watched : [];
    const watchedList = existing 
      ? Array.from(new Set([...(existing.watched || []), ...bodyWatched]))
      : bodyWatched;
    
    const data = {
      emptype,
      empId: empId || "",
      name: name.trim(),
      dept: dept.trim(),
      regTime,
      watched: watchedList,
      watchedAt: existing ? (existing.watchedAt || {}) : {}
    };

    const result = await saveParticipant(data);
    res.status(200).json({ ok: true, user: { ...data, _blobUrl: result.url } });
  } catch (e) {
    console.error("Register error:", e);
    res.status(500).json({ error: e.message || "server error" });
  }
}
