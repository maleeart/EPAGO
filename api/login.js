import { getBlobKey, readParticipant } from "./_blob.js";

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
    const key = getBlobKey({ emptype, name, empId });
    const user = await readParticipant(key);

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
