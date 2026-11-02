import { readHeadcount, saveHeadcount } from "./_blob.js";
import { authed } from "./_auth.js";

export const DEFAULT_DIVISIONS = {
  "สก.ชธธ.": {
    "กปฟร-ธ.": 0,
    "กปฟรร-ธ.": 0,
    "กปฟนม-ธ.": 0,
    "กบคธ-ธ.": 50,
    "กบห-ธ.": 24,
    "กศม-ธ.": 13,
    "ขึ้นตรง ชธธ.": 11
  },
  "อคม.": {
    "กคฟ-ธ.": 0,
    "กคว-ธ.": 32,
    "กคค-ธ.": 0,
    "กคภ-ธ.": 13,
    "กผงม-ธ.": 12,
    "สก. อคม.": 4,
    "กวค-ธ.": 26
  },
  "อบค.": {
    "กมน-ธ.": 201,
    "กกห-ธ.": 155,
    "กกอ-ธ.": 141,
    "กฟนม-ธ.": 63,
    "กผงค-ธ.": 17,
    "สก. อบค.": 11
  },
  "อบฟ.": {
    "กบคพ-ธ.": 123,
    "กบกม-ธ.": 110,
    "สก. อบฟ.": 5,
    "กบมอ-ธ.": 61,
    "กททอ-ธ.": 43,
    "กมสว-ธ.": 19,
    "กผงฟ-ธ.": 17
  },
  "อบย.": {
    "กบร-ธ.": 28,
    "กวย-ธ.": 26,
    "กคข-ธ.": 26,
    "กผงย-ธ.": 15,
    "สก. อบย.": 5
  },
  "อรอ.": {
    "กงค-ธ.": 0,
    "กทค-ธ.": 43,
    "กผงอ-ธ.": 0,
    "สก. อรอ.": 1,
    "ขึ้นตรง อรอ.": 0,
    "กบอ-ธ.": 29
  },
  "อหข.": {
    "กขส-ห.": 69,
    "กวข-ห.": 23,
    "สก. อหข.": 5,
    "กซย-ห.": 32
  },
  "อื่นๆ": {
    "ทั่วไป": 0
  }
};

export const DEFAULT_HEADCOUNT = {
  "สก.ชธธ.": 98,
  "อคม.": 87,
  "อบค.": 588,
  "อบฟ.": 378,
  "อบย.": 100,
  "อรอ.": 73,
  "อหข.": 129,
  "อื่นๆ": 0
};

export const DEFAULT_TOTAL_HEADCOUNT = 1453;

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
