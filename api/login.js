import crypto from 'crypto';
import { memoryDB, getMemoryUser, addMemoryLog, saveMemoryLastLogin } from '../lib/memoryDb.js';

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function getIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

async function getUser(username) {
  // Check memory first (fastest)
  const memoryUser = getMemoryUser(username);
  if (memoryUser) return memoryUser;

  // Try KV if available
  try {
    if (global.kv) {
      const raw = await global.kv.get(`user:${username}`);
      if (raw) {
        const user = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return user;
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
    if (global.kv) {
      await global.kv.set(
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
    addMemoryLog(`${username} (admin)`, ip, true);
    return res.status(200).json({ success: true, role: 'admin' });
  }

  try {
    const user = await getUser(username);
    
    if (!user) {
      addMemoryLog(username, ip, false);
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    const hash = hashPassword(password, user.salt);
    const ok = hash === user.hash;

    addMemoryLog(username, ip, ok);

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

// Initialize KV
if (typeof window === 'undefined') {
  import('@vercel/kv')
    .then(({ kv }) => {
      global.kv = kv;
    })
    .catch(() => console.log('KV not available'));
}
