import { readHeadcount, saveHeadcount } from "./_blob.js";
import { authed } from "./_auth.js";

export const DEFAULT_DIVISIONS = {
  "สก.ชธธ.": {
    "กปฟร-ธ.": 98,
    "กปฟรร-ธ.": 70,
    "กปฟนม-ธ.": 66,
    "กบคธ-ธ.": 50,
    "กบห-ธ.": 22,
    "กศม-ธ.": 13,
    "ขึ้นตรง ชธธ.": 11
  },
  "อคม.": {
    "กคฟ-ธ.": 60,
    "กคว-ธ.": 34,
    "กคค-ธ.": 26,
    "กคภ-ธ.": 13,
    "กผงม-ธ.": 12,
    "สก. อคม.": 4
  },
  "อบค.": {
    "กมน-ธ.": 206,
    "กกห-ธ.": 162,
    "กกอ-ธ.": 146,
    "กฟนม-ธ.": 66,
    "กผงค-ธ.": 17,
    "สก. อบค.": 12
  },
  "อบฟ.": {
    "กบคพ-ธ.": 126,
    "กบกม-ธ.": 112,
    "สก. อบฟ.": 69,
    "กบมอ-ธ.": 63,
    "กททอ-ธ.": 43,
    "กมสว-ธ.": 22,
    "กผงฟ-ธ.": 20
  },
  "อบย.": {
    "กบร-ธ.": 29,
    "กวย-ธ.": 28,
    "กคข-ธ.": 27,
    "กผงย-ธ.": 16,
    "สก. อบย.": 4
  },
  "อรอ.": {
    "กงค-ธ.": 110,
    "กทค-ธ.": 43,
    "กบออ-ธ.": 31,
    "กผงอ-ธ.": 18,
    "สก. อรอ.": 6,
    "ขึ้นตรง อรอ.": 4
  },
  "อหข.": {
    "กขส-ห.": 73,
    "กขย-ห.": 32,
    "กวข-ห.": 21,
    "สก. อหข.": 5
  },
  "อื่นๆ": {
    "ทั่วไป": 80
  }
};

export const DEFAULT_HEADCOUNT = {
  "สก.ชธธ.": 330,
  "อคม.": 149,
  "อบค.": 609,
  "อบฟ.": 455,
  "อบย.": 104,
  "อรอ.": 212,
  "อหข.": 131,
  "อื่นๆ": 80
};

export const DEFAULT_TOTAL_HEADCOUNT = 2070;

function calculateHeadcountFromDivisions(divisions) {
  const headcount = {};
  let total = 0;
  for (const [dept, divs] of Object.entries(divisions || {})) {
    let deptSum = 0;
    if (typeof divs === "object" && divs !== null) {
      for (const count of Object.values(divs)) {
        deptSum += Math.max(0, parseInt(count, 10) || 0);
      }
    } else {
      deptSum = Math.max(0, parseInt(divs, 10) || 0);
    }
    headcount[dept] = deptSum;
    total += deptSum;
  }
  return { headcount, totalHeadcount: total };
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const data = await readHeadcount();
      if (data) {
        let divisions = data.divisions;
        // Migrate legacy headcount structure if divisions is missing
        if (!divisions || typeof divisions !== "object") {
          divisions = DEFAULT_DIVISIONS;
        }
        const calc = calculateHeadcountFromDivisions(divisions);
        return res.status(200).json({
          ok: true,
          divisions,
          headcount: data.headcount || calc.headcount,
          totalHeadcount: data.totalHeadcount || calc.totalHeadcount
        });
      }
      // Return default if not initialized yet
      return res.status(200).json({
        ok: true,
        divisions: DEFAULT_DIVISIONS,
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

    const { divisions, headcount } = req.body ?? {};

    try {
      let sanitizedDivisions = {};
      let calculatedHeadcount = {};
      let finalTotal = 0;

      if (divisions && typeof divisions === "object") {
        for (const [dept, divObj] of Object.entries(divisions)) {
          sanitizedDivisions[dept] = {};
          let deptSum = 0;
          if (typeof divObj === "object" && divObj !== null) {
            for (const [divName, count] of Object.entries(divObj)) {
              const num = Math.max(0, parseInt(count, 10) || 0);
              sanitizedDivisions[dept][divName] = num;
              deptSum += num;
            }
          }
          calculatedHeadcount[dept] = deptSum;
          finalTotal += deptSum;
        }
      } else if (headcount && typeof headcount === "object") {
        // Fallback if client only posted flat headcount
        sanitizedDivisions = DEFAULT_DIVISIONS;
        for (const [dept, count] of Object.entries(headcount)) {
          const num = Math.max(0, parseInt(count, 10) || 0);
          calculatedHeadcount[dept] = num;
          finalTotal += num;
        }
      } else {
        return res.status(400).json({ error: "ข้อมูลโครงสร้างสังกัดและกำลังพลไม่ถูกต้อง" });
      }

      const payload = {
        divisions: sanitizedDivisions,
        headcount: calculatedHeadcount,
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
