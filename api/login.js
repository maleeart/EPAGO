import { readAllParticipants } from "./_blob.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const { emptype, name, empId } = req.body ?? {};

  if (!emptype || !name) {
    return res.status(400).json({ error: "กรุณาระบุข้อมูลสำหรับตรวจสอบ" });
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
    
    const normalizedInputName = normalizeName(name);
    
    const user = participants.find(p => {
      const nameMatches = normalizeName(p.name) === normalizedInputName;
      if (!nameMatches) return false;
      
      if (emptype === "พนักงาน") {
        return p.empId && p.empId.toUpperCase() === empId.toUpperCase();
      } else {
        const dbHasNoId = !p.empId || p.empId === "";
        const typeMatches = !p.emptype || p.emptype === "ลูกจ้าง";
        return dbHasNoId && typeMatches;
      }
    });

    if (user) {
      res.status(200).json({ ok: true, user });
    } else {
      res.status(404).json({ error: "ไม่พบข้อมูลลงทะเบียนในระบบ" });
    }
  } catch (e) {
    console.error("Login query error:", e);
    res.status(500).json({ error: e.message || "server error" });
  }
}
