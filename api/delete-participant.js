import { readAllParticipants, normalizeName } from "./_blob.js";
import { authed } from "./_auth.js";
import { del } from "@vercel/blob";

export default async function handler(req, res) {
  if (!authed(req, res)) return;
  if (req.method !== "DELETE") return res.status(405).json({ error: "method not allowed" });

  const { url, empId, name } = req.body ?? {};

  const cleanEmpId = (empId && empId !== "-") ? String(empId).trim().toUpperCase() : "";
  const cleanName = normalizeName(name);

  if (!url && !cleanEmpId && !cleanName) {
    return res.status(400).json({ error: "invalid deletion parameters" });
  }

  try {
    const urlsToDelete = new Set();
    if (typeof url === "string" && url.startsWith("https://")) {
      urlsToDelete.add(url);
    }

    // Also scan all participants to delete any duplicate/legacy blobs for this user
    if (cleanEmpId || cleanName) {
      try {
        const all = await readAllParticipants();
        all.forEach(p => {
          const pEmpId = (p.empId && p.empId !== "-") ? String(p.empId).trim().toUpperCase() : "";
          const matchEmp = cleanEmpId && pEmpId === cleanEmpId;
          const matchName = cleanName && normalizeName(p.name) === cleanName;
          if ((matchEmp || matchName) && p._blobUrl) {
            urlsToDelete.add(p._blobUrl);
          }
        });
      } catch (e) {
        console.warn("Scan for matching blobs error:", e);
      }
    }

    if (urlsToDelete.size > 0) {
      await del(Array.from(urlsToDelete));
    }
    
    res.status(200).json({ ok: true, deletedCount: urlsToDelete.size });
  } catch (e) {
    console.error("Delete participant error:", e);
    res.status(500).json({ error: e.message || "server error" });
  }
}
