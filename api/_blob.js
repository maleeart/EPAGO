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

export async function readAllParticipants() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return [];
  }
  
  const { blobs } = await list({ prefix: PREFIX });
  if (!blobs || blobs.length === 0) return [];
  
  const rows = await Promise.all(blobs.map(async b => {
    try {
      const data = await fetch(b.url).then(r => r.json());
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
