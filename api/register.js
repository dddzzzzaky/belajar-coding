import crypto from 'crypto';
import { memoryDB, getMemoryUser, saveMemoryUser } from '../lib/memoryDb.js';
import { checkAndRecordRequest } from '../lib/rateLimit.js';

function getIp(req) {
  const real = req.headers['x-real-ip'];
  if (real) return real;
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',').pop().trim();
  return req.socket?.remoteAddress || 'unknown';
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// FIX: sama seperti file lain — KV di-lazy-load dan di-await.
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

async function userExists(username) {
  // Check memory first
  if (getMemoryUser(username)) return true;

  // Check KV
  try {
    const kv = await getKv();
    if (kv) {
      const existing = await kv.get(`user:${username}`);
      if (existing) return true;
    }
  } catch (e) {
    console.log('KV check failed:', e.message);
  }
  return false;
}

async function saveUser(username, hash, salt) {
  const userData = {
    username,
    salt,
    hash,
    createdAt: new Date().toISOString()
  };

  // Save to memory
  saveMemoryUser(username, userData);

  // Try KV if available.
  // Catatan: pakai { nx: true } supaya KV cuma nulis kalau key belum ada —
  // ini mengurangi (walau tidak 100% menghilangkan) risiko dua pendaftaran
  // dengan username sama yang lolos bareng lalu saling timpa data.
  try {
    const kv = await getKv();
    if (kv) {
      await kv.set(`user:${username}`, JSON.stringify(userData), { nx: true });
      await kv.sadd('all_users', username);
    }
  } catch (e) {
    console.log('KV save failed:', e.message);
  }

  return userData;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = getIp(req);
  const rl = await checkAndRecordRequest(ip);
  if (rl.blocked) {
    return res.status(429).json({ error: 'Terlalu banyak percobaan dari alamat ini, coba lagi nanti' });
  }

  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi' });
  }

  if (username.length < 3) {
    return res.status(400).json({ error: 'Username minimal 3 karakter' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter' });
  }

  // Prevent admin username
  if (
    process.env.ADMIN_USERNAME &&
    username.toLowerCase() === process.env.ADMIN_USERNAME.toLowerCase()
  ) {
    return res.status(409).json({ error: 'Username ini sudah dipakai' });
  }

  try {
    // Check if user already exists
    const exists = await userExists(username);
    if (exists) {
      return res.status(409).json({ error: 'Username sudah terdaftar' });
    }

    // Create new user
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    await saveUser(username, hash, salt);

    return res.status(201).json({ success: true, message: 'Berhasil daftar! Silakan login' });
  } catch (e) {
    console.error('Register error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
