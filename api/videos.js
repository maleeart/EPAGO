import { readVideos, saveVideos } from "./_blob.js";

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
    let videos = await readVideos();
    
    // Seed default videos if videos.json doesn't exist on Vercel Blob yet
    if (!videos) {
      videos = DEFAULT_VIDEOS;
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        await saveVideos(videos).catch(e => console.error("Failed to seed default videos:", e));
      }
    }
    
    res.status(200).json({ ok: true, videos });
  } catch (e) {
    console.error("Fetch videos error:", e);
    res.status(500).json({ error: e.message || "server error" });
  }
}
