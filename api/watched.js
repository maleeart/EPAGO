import { findParticipant, saveParticipant } from "./_blob.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const { emptype, name, empId, videoId, dept, division, regTime, watched, watchedAt } = req.body ?? {};

  if (!emptype || !name || !videoId) {
    return res.status(400).json({ error: "ข้อมูลสำหรับบันทึกการรับชมไม่ครบถ้วน" });
  }

  const cleanEmpId = (empId && empId !== "-") ? String(empId).trim().toUpperCase() : "";
  const cleanName = String(name || "").trim();
  const cleanVideoId = String(videoId || "").trim();

  try {
    let user = await findParticipant({ emptype, name: cleanName, empId: cleanEmpId });

    const now = new Date();
    const tzOffset = 7 * 60; // mins
    const localTime = new Date(now.getTime() + tzOffset * 60000);
    const formattedDate = `${localTime.getUTCFullYear()}-${String(localTime.getUTCMonth() + 1).padStart(2, '0')}-${String(localTime.getUTCDate()).padStart(2, '0')} ${String(localTime.getUTCHours()).padStart(2, '0')}:${String(localTime.getUTCMinutes()).padStart(2, '0')}`;

    // Combine any watched list sent from the client with the server's record
    const incomingWatched = Array.isArray(watched) ? watched.map(v => String(v).trim()).filter(Boolean) : [];
    const incomingWatchedAt = (watchedAt && typeof watchedAt === "object") ? watchedAt : {};

    const existingWatched = (user && Array.isArray(user.watched)) ? user.watched : [];
    const existingWatchedAt = (user && user.watchedAt && typeof user.watchedAt === "object") ? user.watchedAt : {};

    const mergedWatched = Array.from(new Set([
      ...existingWatched,
      ...incomingWatched,
      cleanVideoId
    ])).filter(Boolean);

    const mergedWatchedAt = {
      ...existingWatchedAt,
      ...incomingWatchedAt,
      [cleanVideoId]: formattedDate
    };

    user = {
      ...(user || {}),
      emptype: emptype || user?.emptype || "พนักงาน",
      empId: cleanEmpId || user?.empId || "",
      name: cleanName || user?.name || "",
      dept: (dept || user?.dept || "อื่นๆ").trim(),
      division: (division !== undefined && division !== null ? String(division).trim() : (user?.division || "")),
      regTime: user?.regTime || regTime || formattedDate,
      watched: mergedWatched,
      watchedAt: mergedWatchedAt,
      _blobUrl: user?._blobUrl
    };

    const result = await saveParticipant(user);
    res.status(200).json({ ok: true, user: { ...user, _blobUrl: result.url } });
  } catch (e) {
    console.error("Watched tracking error:", e);
    res.status(500).json({ error: e.message || "server error" });
  }
}
