import { findParticipant, saveParticipant } from "./_blob.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const { emptype, empId, name, dept, regTime } = req.body ?? {};

  if (!emptype || !name || !dept || !regTime) {
    return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });
  }
  
  if (emptype === "พนักงาน" && !empId) {
    return res.status(400).json({ error: "กรุณาระบุรหัสพนักงาน" });
  }

  const cleanEmpId = (empId && empId !== "-") ? String(empId).trim().toUpperCase() : "";

  try {
    const existing = await findParticipant({ emptype, name, empId: cleanEmpId });

    const bodyWatched = Array.isArray(req.body.watched) ? req.body.watched : [];
    const watchedList = existing 
      ? Array.from(new Set([...(existing.watched || []), ...bodyWatched]))
      : bodyWatched;
    
    const watchedAt = {
      ...(existing && existing.watchedAt ? existing.watchedAt : {}),
      ...(req.body.watchedAt ? req.body.watchedAt : {})
    };

    const data = {
      emptype,
      empId: cleanEmpId,
      name: name.trim(),
      dept: dept.trim(),
      regTime: (existing && existing.regTime) ? existing.regTime : regTime,
      watched: watchedList,
      watchedAt: watchedAt,
      _blobUrl: existing ? existing._blobUrl : undefined
    };

    const result = await saveParticipant(data);
    res.status(200).json({ ok: true, user: { ...data, _blobUrl: result.url } });
  } catch (e) {
    console.error("Register error:", e);
    res.status(500).json({ error: e.message || "server error" });
  }
}
