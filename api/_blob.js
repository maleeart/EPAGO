import { Redis } from "@upstash/redis";

const PREFIX = "epago/participants/";
const PARTICIPANTS_KEY = "epago:participants";
const VIDEOS_BLOB_PATH = "epago/videos.json";
const VIDEOS_KEY = "epago:videos";
const HEADCOUNT_BLOB_PATH = "epago/headcount.json";
const HEADCOUNT_KEY = "epago:headcount";

const getRedis = () => {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
};

export const normalizeName = name => {
  if (!name) return "";
  return String(name).trim()
    .replace(/^(นาย|นางสาว|นาง|ด\.ช\.|ด\.ญ\.|นายแพทย์|แพทย์หญิง|ดร\.)\s*/, "")
    .replace(/\s+/g, "");
};

export const isMockUser = u => {
  if (!u) return false;
  const name = String(u.name || "").trim();
  const empId = String(u.empId || "").trim().toUpperCase();
  return empId === "EMP001" || name.includes("สมชาย รักษ์พลังงาน") || name.includes("สมหญิง ประหยัดดี");
};

const safeStr = s => (s || "").replace(/\s+/g, "_").replace(/[^\w\u0e00-\u0e7f]/g, "").slice(0, 40);

export function getBlobKey(user) {
  const empId = user && user.empId && user.empId !== "-" ? String(user.empId).trim().toUpperCase() : "";
  if (empId) {
    return `emp-${empId.replace(/[^\w\u0e00-\u0e7f]/g, "_")}`;
  } else {
    return `contractor-${safeStr(normalizeName(user ? user.name : ""))}`;
  }
}

export async function readParticipant(key) {
  const r = getRedis();
  if (r) {
    const data = await r.hget(PARTICIPANTS_KEY, key);
    if (!data) return null;
    const parsed = typeof data === "string" ? JSON.parse(data) : data;
    return { ...parsed, _blobUrl: key };
  }

  // Fallback to Blob
  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: `${PREFIX}${key}.json` });
    const b = blobs && blobs.find(item => item.pathname === `${PREFIX}${key}.json`) || (blobs && blobs[0]);
    if (b) {
      const data = await fetch(`${b.url}?t=${Date.now()}`).then(res => res.json());
      return { ...data, _blobUrl: b.url };
    }
  } catch (e) {
    console.error("Failed to read participant via list:", e);
  }
  return null;
}

export async function findParticipant({ emptype, name, empId }) {
  const cleanEmpId = empId && empId !== "-" ? String(empId).trim().toUpperCase() : "";
  const cleanName = normalizeName(name);

  // Prevent finding mock users
  if (cleanEmpId === "EMP001" || (cleanName && (cleanName.includes("สมชาย") || cleanName.includes("สมหญิง")))) {
    return null;
  }

  // 1. Try canonical key lookup
  const canonicalKey = getBlobKey({ empId: cleanEmpId, name: cleanName });
  if (canonicalKey) {
    const user = await readParticipant(canonicalKey);
    if (user) return user;
  }

  // 2. Try direct lookup by empId if given
  if (cleanEmpId) {
    const user = await readParticipant(`emp-${cleanEmpId.replace(/[^\w\u0e00-\u0e7f]/g, "_")}`);
    if (user) return user;
  }

  // 3. Try contractor key if name is given
  if (cleanName) {
    const user = await readParticipant(`contractor-${safeStr(cleanName)}`);
    if (user) return user;
  }

  // 4. Fallback: scan all participants
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

export async function saveParticipant(data) {
  const key = getBlobKey(data);
  const r = getRedis();
  if (r) {
    const record = { ...data, _blobUrl: key };
    await r.hset(PARTICIPANTS_KEY, { [key]: JSON.stringify(record) });
    if (data._blobUrl && data._blobUrl !== key) {
      try {
        await r.hdel(PARTICIPANTS_KEY, data._blobUrl);
      } catch {}
    }
    return { url: key };
  }

  // Fallback to Blob
  try {
    const { put, del } = await import("@vercel/blob");
    const result = await put(`${PREFIX}${key}.json`, JSON.stringify(data), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    });
    if (data._blobUrl && data._blobUrl !== result.url) {
      del(data._blobUrl).catch(() => {});
    }
    return result;
  } catch (err) {
    throw err;
  }
}

export async function readAllParticipants() {
  const r = getRedis();
  if (r) {
    const map = await r.hgetall(PARTICIPANTS_KEY);
    if (!map) return [];
    const rows = Object.entries(map).map(([k, v]) => {
      try {
        const data = typeof v === "string" ? JSON.parse(v) : v;
        return { ...data, _blobUrl: data._blobUrl || k };
      } catch {
        return null;
      }
    }).filter(r => r !== null && r.name && !isMockUser(r));
    return rows.sort((a, b) => (b.regTime || "").localeCompare(a.regTime || ""));
  }

  // Fallback to Blob
  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: PREFIX });
    if (!blobs || blobs.length === 0) return [];
    const rows = (await Promise.all(blobs.map(async b => {
      try {
        const data = await fetch(`${b.url}?t=${Date.now()}`).then(res => res.json());
        return { ...data, _blobUrl: b.url };
      } catch {
        return null;
      }
    }))).filter(r => r !== null && r.name && !isMockUser(r));
    return rows.sort((a, b) => (b.regTime || "").localeCompare(a.regTime || ""));
  } catch {
    return [];
  }
}

export async function removeParticipant(url) {
  const r = getRedis();
  if (r) {
    const key = url ? url.replace(/^.*[\\\/]/, "").replace(/\.json$/, "") : url;
    await r.hdel(PARTICIPANTS_KEY, key);
    return;
  }
  try {
    const { del } = await import("@vercel/blob");
    await del(url);
  } catch {}
}

export async function clearAll() {
  const r = getRedis();
  if (r) {
    await r.del(PARTICIPANTS_KEY);
    return;
  }
  try {
    const { list, del } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: PREFIX });
    if (blobs && blobs.length > 0) {
      await del(blobs.map(b => b.url));
    }
  } catch {}
}

export async function saveVideos(videosList) {
  const r = getRedis();
  if (r) {
    await r.set(VIDEOS_KEY, JSON.stringify(videosList));
    return { ok: true };
  }
  try {
    const { put } = await import("@vercel/blob");
    return await put(VIDEOS_BLOB_PATH, JSON.stringify(videosList), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch (err) {
    throw err;
  }
}

export async function readVideos() {
  const r = getRedis();
  if (r) {
    const data = await r.get(VIDEOS_KEY);
    if (!data) return null;
    return typeof data === "string" ? JSON.parse(data) : data;
  }
  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: VIDEOS_BLOB_PATH });
    if (!blobs || blobs.length === 0) return null;
    return await fetch(`${blobs[0].url}?t=${Date.now()}`).then(res => res.json());
  } catch {
    return null;
  }
}

export async function saveHeadcount(headcountData) {
  const r = getRedis();
  if (r) {
    await r.set(HEADCOUNT_KEY, JSON.stringify(headcountData));
    return { ok: true };
  }
  try {
    const { put } = await import("@vercel/blob");
    return await put(HEADCOUNT_BLOB_PATH, JSON.stringify(headcountData), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch (err) {
    throw err;
  }
}

export async function readHeadcount() {
  const r = getRedis();
  if (r) {
    const data = await r.get(HEADCOUNT_KEY);
    if (!data) return null;
    return typeof data === "string" ? JSON.parse(data) : data;
  }
  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: HEADCOUNT_BLOB_PATH });
    if (!blobs || blobs.length === 0) return null;
    return await fetch(`${blobs[0].url}?t=${Date.now()}`).then(res => res.json());
  } catch {
    return null;
  }
}
