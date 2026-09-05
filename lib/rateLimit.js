// Rate limiter + auto-blacklist sederhana.
// Aturan: kalau satu IP kirim lebih dari MAX_REQUESTS request dalam
// WINDOW_SECONDS detik, IP itu otomatis di-blacklist selama BLACKLIST_SECONDS.
//
// Pakai Vercel KV supaya konsisten walau request masuk ke instance
// serverless yang berbeda-beda. Kalau KV lagi gak tersedia, fallback ke
// in-memory (per instance, reset saat cold start) — lebih baik ada
// proteksi lemah daripada gak ada sama sekali.

const WINDOW_SECONDS = 10;
const MAX_REQUESTS = 5;
const BLACKLIST_SECONDS = 15 * 60; // 15 menit

const memoryHits = new Map();       // ip -> { count, windowStart }
const memoryBlacklist = new Map();  // ip -> expireAt (timestamp ms)

let kvPromise = null;
function getKv() {
  if (!kvPromise) {
    kvPromise = import('@vercel/kv')
      .then(({ kv }) => kv)
      .catch((e) => {
        console.log('KV not available (rate limit):', e.message);
        return null;
      });
  }
  return kvPromise;
}

function checkMemoryBlacklist(ip) {
  const expireAt = memoryBlacklist.get(ip);
  if (expireAt && expireAt > Date.now()) return true;
  if (expireAt) memoryBlacklist.delete(ip);
  return false;
}

function recordMemoryHit(ip) {
  const now = Date.now();
  const entry = memoryHits.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_SECONDS * 1000) {
    memoryHits.set(ip, { count: 1, windowStart: now });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

/**
 * Cek + catat satu request dari `ip`.
 * Panggil ini di awal setiap handler, sebelum memproses apa pun.
 * Return { blocked: true } kalau IP ini harus langsung ditolak.
 */
export async function checkAndRecordRequest(ip) {
  if (!ip || ip === 'unknown') return { blocked: false };

  let kv = null;
  try {
    kv = await getKv();
  } catch (e) {
    console.log('Rate limit getKv failed:', e.message);
  }

  // 1) Cek blacklist dulu
  try {
    if (kv) {
      const isBlacklisted = await kv.get(`blacklist:${ip}`);
      if (isBlacklisted) return { blocked: true };
    } else if (checkMemoryBlacklist(ip)) {
      return { blocked: true };
    }
  } catch (e) {
    console.log('Rate limit blacklist check failed:', e.message);
    if (checkMemoryBlacklist(ip)) return { blocked: true };
  }

  // 2) Catat hit baru, cek apakah sudah lewat batas
  if (kv) {
    try {
      const key = `ratehit:${ip}`;
      const count = await kv.incr(key);
      if (count === 1) {
        await kv.expire(key, WINDOW_SECONDS);
      }
      if (count > MAX_REQUESTS) {
        await kv.set(`blacklist:${ip}`, '1', { ex: BLACKLIST_SECONDS });
        console.log(`IP ${ip} auto-blacklist ${BLACKLIST_SECONDS}s (traffic tidak normal)`);
        return { blocked: true };
      }
      return { blocked: false };
    } catch (e) {
      console.log('Rate limit KV record failed:', e.message);
    }
  }

  // Fallback murni memory kalau KV gak tersedia sama sekali
  const count = recordMemoryHit(ip);
  if (count > MAX_REQUESTS) {
    memoryBlacklist.set(ip, Date.now() + BLACKLIST_SECONDS * 1000);
    return { blocked: true };
  }
  return { blocked: false };
}

