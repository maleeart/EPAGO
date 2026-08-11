import { readVideos, saveVideos } from "./_blob.js";

const CURRENT_VIDEOS_VERSION = "v1.5";

const DEFAULT_VIDEOS = [
  {
    id: "vid-1",
    category: "ทั่วไป",
    title: "12 วิธีประหยัดพลังงานในที่ทำงาน 💡",
    description: "เคล็ดลับการอนุรักษ์พลังงานในที่ทำงานและสำนักงานอย่างมีประสิทธิภาพสูงสุด 12 วิธีที่ทำตามได้จริงและเห็นผลลัพธ์ทันที",
    url: "https://www.youtube.com/watch?v=kYJUp5WwFik",
    duration: "3:30"
  }
];

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" });

  try {
    let rawData = await readVideos();
    let videos = null;
    let version = "";

    if (rawData) {
      if (Array.isArray(rawData)) {
        videos = rawData;
      } else if (rawData.videos) {
        videos = rawData.videos;
        version = rawData.version || "";
      }
    }
    
    // Seed or Force Update if version mismatch
    if (!videos || version !== CURRENT_VIDEOS_VERSION) {
      videos = DEFAULT_VIDEOS;
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        const payload = {
          version: CURRENT_VIDEOS_VERSION,
          videos: DEFAULT_VIDEOS
        };
        await saveVideos(payload).catch(e => console.error("Failed to seed/migrate videos:", e));
      }
    }
    
    res.status(200).json({ ok: true, videos });
  } catch (e) {
    console.error("Fetch videos error:", e);
    res.status(500).json({ error: e.message || "server error" });
  }
}
