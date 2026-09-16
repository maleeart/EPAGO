import { readHeadcount, saveHeadcount } from "./_blob.js";
import { authed } from "./_auth.js";

export const DEFAULT_HEADCOUNT = {
  "สก.ชธธ.": 220,
  "อบค.": 250,
  "อบฟ.": 260,
  "อบย.": 240,
  "อรอ.": 230,
  "อคม.": 220,
  "อหข.": 200,
  "อื่นๆ": 80
};

export const DEFAULT_TOTAL_HEADCOUNT = 1700;

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const data = await readHeadcount();
      if (data && data.headcount) {
        return res.status(200).json({
          ok: true,
          headcount: data.headcount,
          totalHeadcount: data.totalHeadcount || Object.values(data.headcount).reduce((a, b) => a + (Number(b) || 0), 0)
        });
      }
      // Return default if not initialized yet
      return res.status(200).json({
        ok: true,
        headcount: DEFAULT_HEADCOUNT,
        totalHeadcount: DEFAULT_TOTAL_HEADCOUNT
      });
    } catch (e) {
      console.error("Fetch headcount error:", e);
      return res.status(500).json({ error: e.message || "server error" });
    }
  }

  if (req.method === "POST") {
    if (!authed(req, res)) return;

    const { headcount, totalHeadcount } = req.body ?? {};
    if (!headcount || typeof headcount !== "object") {
      return res.status(400).json({ error: "ข้อมูลจำนวนบุคลากรไม่ถูกต้อง" });
    }

    try {
      // Clean and sanitize numbers
      const sanitizedHeadcount = {};
      let calculatedTotal = 0;
      for (const [dept, count] of Object.entries(headcount)) {
        const num = Math.max(0, parseInt(count, 10) || 0);
        sanitizedHeadcount[dept] = num;
        calculatedTotal += num;
      }

      const finalTotal = typeof totalHeadcount === "number" && totalHeadcount > 0 
        ? totalHeadcount 
        : calculatedTotal;

      const payload = {
        headcount: sanitizedHeadcount,
        totalHeadcount: finalTotal,
        updatedAt: new Date().toISOString()
      };

      await saveHeadcount(payload);
      return res.status(200).json({ ok: true, ...payload });
    } catch (e) {
      console.error("Save headcount error:", e);
      return res.status(500).json({ error: e.message || "server error" });
    }
  }

  return res.status(405).json({ error: "method not allowed" });
}
