import { readAllParticipants, saveParticipant } from "./_blob.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const { emptype, name, empId, videoId } = req.body ?? {};

  if (!emptype || !name || !videoId) {
    return res.status(400).json({ error: "ข้อมูลสำหรับบันทึกการรับชมไม่ครบถ้วน" });
  }

  try {
    const participants = await readAllParticipants();
    
    const normalizeName = name => {
      if (!name) return "";
      return name.trim()
        .replace(/^(นาย|นางสาว|นาง|ด\.ช\.|ด\.ญ\.|นายแพทย์|แพทย์หญิง|ดร\.)\s*/, "")
        .replace(/\s+/g, "");
    };
    
    const normalizedInputName = normalizeName(name);
    
    const userIndex = participants.findIndex(p => {
      if (emptype === "พนักงาน") {
        return p.empId && p.empId.toUpperCase() === empId.toUpperCase();
      } else {
        const dbHasNoId = !p.empId || p.empId === "";
        const typeMatches = !p.emptype || p.emptype === "ลูกจ้าง";
        return dbHasNoId && typeMatches && normalizeName(p.name) === normalizedInputName;
      }
    });

    if (userIndex === -1) {
      return res.status(404).json({ error: "ไม่พบข้อมูลผู้ลงทะเบียนในระบบ" });
    }

    const user = participants[userIndex];
    if (!user.watched) {
      user.watched = [];
    }

    if (!user.watched.includes(videoId)) {
      user.watched.push(videoId);
    }

    await saveParticipant(user);
    res.status(200).json({ ok: true, user });
  } catch (e) {
    console.error("Watched tracking error:", e);
    res.status(500).json({ error: e.message || "server error" });
  }
}
