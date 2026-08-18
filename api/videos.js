import { readVideos, saveVideos } from "./_blob.js";

export const CURRENT_VIDEOS_VERSION = "v1.9";

const DEFAULT_VIDEOS = [
  {
    id: "vid-1",
    category: "ทั่วไป",
    title: "12 วิธีประหยัดพลังงานในที่ทำงาน 💡",
    description: "เคล็ดลับการอนุรักษ์พลังงานในที่ทำงานและสำนักงานอย่างมีประสิทธิภาพสูงสุด 12 วิธีที่ทำตามได้จริงและเห็นผลลัพธ์ทันที",
    url: "https://www.youtube.com/watch?v=I93aV7Y49LI",
    duration: "3:30"
  },
  {
    id: "vid-2",
    category: "ในบ้าน",
    title: "8 วิธีประหยัดพลังงานในบ้านคุณ 🏠",
    description: "เคล็ดลับและแนวทางปฏิบัติจริงในการประหยัดไฟฟ้าและอนุรักษ์พลังงานภายในบ้านเพื่อลดค่าไฟอย่างเห็นผล",
    url: "video/8_ways_save_energy.mp4",
    thumbnailUrl: "video/home_energy_saving_cover.jpg",
    duration: "2:15"
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
    if (!videos) {
      videos = DEFAULT_VIDEOS;
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        await saveVideos({ version: CURRENT_VIDEOS_VERSION, videos }).catch(e => console.error("Failed to seed videos:", e));
      }
    } else if (version !== CURRENT_VIDEOS_VERSION) {
      // Migrate existing videos: preserve admin edits, but add new default videos and missing fields
      const updatedVideos = [...videos];
      
      DEFAULT_VIDEOS.forEach(defaultVid => {
        const existingIdx = updatedVideos.findIndex(v => v.id === defaultVid.id);
        if (existingIdx === -1) {
          // New video introduced in this version (e.g. local video)
          updatedVideos.push(defaultVid);
        } else {
          // Video exists, let's add any new fields (like thumbnailUrl) that are in defaultVid but missing in existing
          const existingVid = updatedVideos[existingIdx];
          let changed = false;
          Object.keys(defaultVid).forEach(key => {
            if (existingVid[key] === undefined) {
              existingVid[key] = defaultVid[key];
              changed = true;
            }
          });
          if (changed) {
            updatedVideos[existingIdx] = existingVid;
          }
        }
      });
      
      videos = updatedVideos;
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        await saveVideos({ version: CURRENT_VIDEOS_VERSION, videos }).catch(e => console.error("Failed to migrate videos:", e));
      }
    }
    
    res.status(200).json({ ok: true, videos });
  } catch (e) {
    console.error("Fetch videos error:", e);
    res.status(500).json({ error: e.message || "server error" });
  }
}
