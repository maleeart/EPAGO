import { put, list, del } from "@vercel/blob";

const PREFIX = "epago/participants/";

// Helper to normalize contractor names to strip spaces and symbols for clean blob filenames
const normalizeName = name => {
  if (!name) return "";
  return name.trim()
    .replace(/^(นาย|นางสาว|นาง|ด\.ช\.|ด\.ญ\.|นายแพทย์|แพทย์หญิง|ดร\.)\s*/, "")
    .replace(/\s+/g, "");
};

const safeStr = s => s.replace(/\s+/g, "_").replace(/[^\w฀-๿]/g, "").slice(0, 40);

export function getBlobKey(user) {
  if (user.empId) {
    return `emp-${String(user.empId).replace(/[^a-zA-Z0-9]/g, "_")}`;
  } else {
    return `contractor-${safeStr(normalizeName(user.name))}-${safeStr(user.dept)}`;
  }
}

export async function saveParticipant(data) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn("BLOB_READ_WRITE_TOKEN is missing. Running in local mock mode.");
    return { url: `mock-url-${Date.now()}` };
  }
  
  const key = getBlobKey(data);
  return await put(`${PREFIX}${key}.json`, JSON.stringify(data), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

const DEFAULT_PARTICIPANTS = [
  {
    emptype: "พนักงาน",
    empId: "EMP001",
    name: "นายสมชาย รักษ์พลังงาน",
    dept: "ฝ่ายเทคโนโลยีสารสนเทศ",
    regTime: "2026-08-11 08:30",
    watched: ["vid-1"]
  },
  {
    emptype: "ลูกจ้าง",
    empId: "",
    name: "นางสาวสมหญิง ประหยัดดี",
    dept: "ฝ่ายการเงินและบัญชี",
    regTime: "2026-08-11 09:15",
    watched: ["vid-1"]
  }
];

export async function readAllParticipants() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return [];
  }
  
  let { blobs } = await list({ prefix: PREFIX });
  
  // Seed default participants on Vercel Blob if the database is empty
  if (!blobs || blobs.length === 0) {
    console.log("EPAGO: Cloud participants empty. Seeding defaults...");
    for (const p of DEFAULT_PARTICIPANTS) {
      await saveParticipant(p).catch(e => console.error("Failed to seed participant:", e));
    }
    const result = await list({ prefix: PREFIX });
    blobs = result.blobs;
  }
  
  if (!blobs || blobs.length === 0) return [];
  
  const rows = await Promise.all(blobs.map(async b => {
    try {
      const data = await fetch(`${b.url}?t=${Date.now()}`).then(r => r.json());
      return { ...data, _blobUrl: b.url };
    } catch (e) {
      console.error(`Failed to fetch blob at ${b.url}:`, e);
      return null;
    }
  }));
  
  return rows.filter(r => r !== null).sort((a, b) => b.regTime.localeCompare(a.regTime));
}

export async function removeParticipant(url) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  await del(url);
}

export async function clearAll() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  const { blobs } = await list({ prefix: PREFIX });
  if (blobs && blobs.length > 0) {
    await del(blobs.map(b => b.url));
  }
}

// --- Videos API Helpers ---
const VIDEOS_BLOB_PATH = "epago/videos.json";

export async function saveVideos(videosList) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  return await put(VIDEOS_BLOB_PATH, JSON.stringify(videosList), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function readVideos() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const { blobs } = await list({ prefix: VIDEOS_BLOB_PATH });
    if (!blobs || blobs.length === 0) return null;
    const b = blobs[0];
    const data = await fetch(`${b.url}?t=${Date.now()}`).then(r => r.json());
    return data;
  } catch (e) {
    console.error("Failed to read videos from blob:", e);
    return null;
  }
}
