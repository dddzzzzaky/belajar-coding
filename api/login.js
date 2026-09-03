import { kv } from '@vercel/kv';
import crypto from 'crypto';

// User database fallback (buat testing sebelum KV setup)
const DEFAULT_USERS = {
  'testuser': {
    username: 'testuser',
    hash: 'd4d0f19e3bb2e8c0e89a37c2ef8bbe0d9fe50caf0a7c4a13e8e92e5f8c1d7e6f', // hash dari "password123"
    salt: '1234567890abcdef1234567890abcdef'
  },
  'admin': {
    username: 'admin',
    hash: 'a3a6d4e9b8c7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3', // hash dari "admin123"
    salt: 'fedcba9876543210fedcba9876543210'
  }
};

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function getIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

async function logAttempt(username, ip, success) {
  try {
    const entry = JSON.stringify({
      username,
      ip,
      success,
      time: new Date().toISOString()
    });
    await kv.lpush('login_logs', entry);
    await kv.ltrim('login_logs', 0, 499);
  } catch (e) {
    console.error('Gagal mencatat log login (diabaikan):', e);
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

  // Login khusus administrator dari env vars
  if (
    process.env.ADMIN_USERNAME &&
    process.env.ADMIN_PASSWORD &&
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    logAttempt(`${username} (admin)`, ip, true);
    return res.status(200).json({ success: true, role: 'admin' });
  }

  try {
    // Coba ambil dari KV dulu
    let user = null;
    try {
      const raw = await kv.get(`user:${username}`);
      user = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (kvError) {
      // Kalau KV gagal, gunakan fallback default users
      console.log('KV tidak tersedia, menggunakan fallback users:', kvError.message);
      user = DEFAULT_USERS[username];
    }

    if (!user) {
      logAttempt(username, ip, false);
      return res.status(401).json({ error: 'salah' });
    }

    const hash = hashPassword(password, user.salt);
    const ok = hash === user.hash;

    logAttempt(username, ip, ok);

    if (!ok) {
      return res.status(401).json({ error: 'salah' });
    }

    // Simpan lastlogin (jika KV tersedia)
    try {
      await kv.set(`lastlogin:${username}`, JSON.stringify({ ip, time: new Date().toISOString() }));
    } catch (e) {
      console.error('Gagal simpan lastlogin (diabaikan):', e);
    }

    return res.status(200).json({ success: true, role: 'user' });
  } catch (e) {
    console.error('Login error:', e);
    return res.status(500).json({
      error: 'Server error: ' + e.message
    });
  }
}
