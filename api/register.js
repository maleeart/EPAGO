import { readAllParticipants, saveParticipant } from "./_blob.js";

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
    const participants = await readAllParticipants();
    
    const normalizeName = name => {
      if (!name) return "";
      return name.trim()
        .replace(/^(นาย|นางสาว|นาง|ด\.ช\.|ด\.ญ\.|นายแพทย์|แพทย์หญิง|ดร\.)\s*/, "")
        .replace(/\s+/g, "");
    };
    
    const normalizedRegName = normalizeName(name);
    const existing = participants.find(p => {
      if (empId) {
        return p.empId && p.empId.toUpperCase() === empId.toUpperCase();
      } else {
        const dbHasNoId = !p.empId || p.empId === "";
        const typeMatches = !p.emptype || p.emptype === "ลูกจ้าง";
        return dbHasNoId && typeMatches && normalizeName(p.name) === normalizedRegName;
      }
    });

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
      watched: watchedList
    };

    const result = await saveParticipant(data);
    res.status(200).json({ ok: true, user: { ...data, _blobUrl: result.url } });
  } catch (e) {
    console.error("Register error:", e);
    res.status(500).json({ error: e.message || "server error" });
  }
}
