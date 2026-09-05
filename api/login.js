import crypto from 'crypto';
import { memoryDB, getMemoryUser, addMemoryLog, saveMemoryLastLogin } from '../lib/memoryDb.js';

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// FIX: sebelumnya ambil elemen PERTAMA dari x-forwarded-for, yang bisa dipalsukan
// oleh siapa saja yang mengirim request (header itu bebas diisi client).
// x-real-ip diisi Vercel sendiri dan lebih bisa dipercaya. Kalau tetap fallback
// ke x-forwarded-for, ambil elemen TERAKHIR (paling dekat ke edge/proxy asli).
function getIp(req) {
  const real = req.headers['x-real-ip'];
  if (real) return real;
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',').pop().trim();
  return req.socket?.remoteAddress || 'unknown';
}

// FIX: sebelumnya KV di-init lewat `import().then()` di bagian bawah file tanpa
// di-await — request pertama di cold start bisa jalan SEBELUM global.kv ke-set,
// jadi diam-diam fallback ke memory doang. Sekarang di-lazy-load dan di-await
// setiap dipakai, supaya selalu pasti KV-nya siap sebelum dibaca/ditulis.
let kvPromise = null;
function getKv() {
  if (!kvPromise) {
    kvPromise = import('@vercel/kv')
      .then(({ kv }) => kv)
      .catch((e) => {
        console.log('KV not available:', e.message);
        return null;
      });
  }
  return kvPromise;
}

async function getUser(username) {
  // Check memory first (fastest)
  const memoryUser = getMemoryUser(username);
  if (memoryUser) return memoryUser;

  // Try KV if available
  try {
    const kv = await getKv();
    if (kv) {
      const raw = await kv.get(`user:${username}`);
      if (raw) {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
    }
  } catch (e) {
    console.log('KV get failed:', e.message);
  }
  return null;
}

async function saveLastLogin(username, ip) {
  // Save to memory
  saveMemoryLastLogin(username, ip);

  // Try KV if available
  try {
    const kv = await getKv();
    if (kv) {
      await kv.set(
        `lastlogin:${username}`,
        JSON.stringify({ ip, time: new Date().toISOString() })
      );
    }
  } catch (e) {
    console.log('KV lastlogin save failed:', e.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password } = req.body || {};
  const ip = getIp(req);

  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi' });
  }

  // Admin login from env vars
  if (
    process.env.ADMIN_USERNAME &&
    process.env.ADMIN_PASSWORD &&
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    await addMemoryLog(`${username} (admin)`, ip, true);
    return res.status(200).json({ success: true, role: 'admin' });
  }

  try {
    const user = await getUser(username);
    if (!user) {
      await addMemoryLog(username, ip, false);
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    const hash = hashPassword(password, user.salt);
    const ok = hash === user.hash;
    await addMemoryLog(username, ip, ok);

    if (!ok) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    await saveLastLogin(username, ip);
    return res.status(200).json({ success: true, role: 'user', username });
  } catch (e) {
    console.error('Login error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
