import { put, list, del } from "@vercel/blob";

const PREFIX = "epago/participants/";

export async function readParticipant(key) {
  checkToken();
  try {
    const { blobs } = await list({ prefix: `${PREFIX}${key}.json` });
    const b = blobs && blobs.find(item => item.pathname === `${PREFIX}${key}.json`) || (blobs && blobs[0]);
    if (b) {
      const data = await fetch(`${b.url}?t=${Date.now()}`).then(r => r.json());
      return { ...data, _blobUrl: b.url };
    }
  } catch (e) {
    console.error("Failed to read participant via list:", e);
  }
  return null;
}

// Helper to normalize contractor names to strip spaces and symbols for clean blob filenames
export const normalizeName = name => {
  if (!name) return "";
  return String(name).trim()
    .replace(/^(นาย|นางสาว|นาง|ด\.ช\.|ด\.ญ\.|นายแพทย์|แพทย์หญิง|ดร\.)\s*/, "")
    .replace(/\s+/g, "");
};

const safeStr = s => (s || "").replace(/\s+/g, "_").replace(/[^\w฀-๿]/g, "").slice(0, 40);

export function getBlobKey(user) {
  const empId = user && user.empId && user.empId !== "-" ? String(user.empId).trim().toUpperCase() : "";
  if (empId) {
    return `emp-${empId.replace(/[^a-zA-Z0-9]/g, "_")}`;
  } else {
    return `contractor-${safeStr(normalizeName(user ? user.name : ""))}`;
  }
}

export async function findParticipant({ emptype, name, empId }) {
  checkToken();
  const cleanEmpId = empId && empId !== "-" ? String(empId).trim().toUpperCase() : "";
  const cleanName = normalizeName(name);

  // 1. Try direct lookup by key if empId is given
  if (cleanEmpId) {
    const user = await readParticipant(`emp-${cleanEmpId.replace(/[^a-zA-Z0-9]/g, "_")}`);
    if (user) return user;
  }
  // 2. Try contractor key if name is given
  if (cleanName) {
    const user = await readParticipant(`contractor-${safeStr(cleanName)}`);
    if (user) return user;
  }

  // 3. Fallback: scan all participants to guarantee matching
  try {
    const all = await readAllParticipants();
    return all.find(p => {
      const pEmpId = p.empId && p.empId !== "-" ? String(p.empId).trim().toUpperCase() : "";
      if (cleanEmpId && pEmpId && pEmpId === cleanEmpId) {
        return true;
      }
      return cleanName && normalizeName(p.name) === cleanName;
    }) || null;
  } catch (e) {
    console.error("findParticipant fallback error:", e);
    return null;
  }
}

function checkToken() {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN && !process.env.BLOB_STORE_ID) {
    throw new Error("ฐานข้อมูลคลาวด์ขัดข้อง: ไม่พบตัวแปรการเชื่อมต่อ Vercel Blob (BLOB_READ_WRITE_TOKEN หรือ BLOB_STORE_ID) กรุณาเชื่อมต่อ Vercel Blob Storage ในหน้า Vercel Dashboard");
  }
}

export async function saveParticipant(data) {
  checkToken();
  const key = getBlobKey(data);
  const result = await put(`${PREFIX}${key}.json`, JSON.stringify(data), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  // If data migrated from a legacy/different blob URL, delete the old file to prevent duplicates
  if (data._blobUrl && data._blobUrl !== result.url) {
    try {
      await del(data._blobUrl).catch(e => console.warn("Failed to delete legacy blob:", e));
    } catch (e) {}
  }

  return result;
}

export async function readAllParticipants() {
  checkToken();
  const { blobs } = await list({ prefix: PREFIX });
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
  
  const validRows = rows.filter(r => r !== null && r.name);

  // Deduplicate and merge participants by unique identity
  const map = new Map();
  const duplicateBlobUrlsToDelete = [];

  for (const user of validRows) {
    const cleanEmpId = (user.empId && user.empId !== "-") ? String(user.empId).trim().toUpperCase() : "";
    const cleanName = normalizeName(user.name);
    // Identity key: empId for employees, or normalized name for contractors
    const identityKey = cleanEmpId ? `emp:${cleanEmpId}` : `contractor:${cleanName}`;

    if (!map.has(identityKey)) {
      map.set(identityKey, user);
    } else {
      // Duplicate found! Merge records into one canonical record
      const existing = map.get(identityKey);
      
      const mergedWatched = Array.from(new Set([...(existing.watched || []), ...(user.watched || [])]));
      const mergedWatchedAt = { ...(user.watchedAt || {}), ...(existing.watchedAt || {}) };
      
      const earlierRegTime = (existing.regTime && user.regTime)
        ? (existing.regTime < user.regTime ? existing.regTime : user.regTime)
        : (existing.regTime || user.regTime || "");

      const canonicalKey = getBlobKey(existing);
      const isUserCanonical = user._blobUrl && user._blobUrl.includes(`/${canonicalKey}.json`);
      const isExistingCanonical = existing._blobUrl && existing._blobUrl.includes(`/${canonicalKey}.json`);

      if (isUserCanonical && !isExistingCanonical) {
        if (existing._blobUrl) duplicateBlobUrlsToDelete.push(existing._blobUrl);
        existing._blobUrl = user._blobUrl;
      } else {
        if (user._blobUrl && user._blobUrl !== existing._blobUrl) {
          duplicateBlobUrlsToDelete.push(user._blobUrl);
        }
      }

      existing.watched = mergedWatched;
      existing.watchedAt = mergedWatchedAt;
      existing.regTime = earlierRegTime;
      if (!existing.dept || existing.dept === "อื่นๆ") {
        existing.dept = user.dept || existing.dept;
      }
      if (cleanEmpId && (!existing.empId || existing.empId === "-")) {
        existing.empId = cleanEmpId;
      }
    }
  }

  // Asynchronously clean up duplicate legacy blobs in the background
  if (duplicateBlobUrlsToDelete.length > 0) {
    try {
      await del(duplicateBlobUrlsToDelete).catch(err => console.warn("Failed to delete duplicate blobs:", err));
    } catch (e) {
      console.warn("Error cleaning duplicate blobs:", e);
    }
  }

  const result = Array.from(map.values());
  return result.sort((a, b) => b.regTime.localeCompare(a.regTime));
}

export async function removeParticipant(url) {
  checkToken();
  await del(url);
}

export async function clearAll() {
  checkToken();
  const { blobs } = await list({ prefix: PREFIX });
  if (blobs && blobs.length > 0) {
    await del(blobs.map(b => b.url));
  }
}

// --- Videos API Helpers ---
const VIDEOS_BLOB_PATH = "epago/videos.json";

export async function saveVideos(videosList) {
  checkToken();
  return await put(VIDEOS_BLOB_PATH, JSON.stringify(videosList), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function readVideos() {
  checkToken();
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
