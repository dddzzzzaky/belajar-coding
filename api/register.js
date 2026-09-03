import crypto from 'crypto';
import { memoryDB, getMemoryUser, saveMemoryUser } from '../lib/memoryDb.js';

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

async function userExists(username) {
  // Check memory first
  if (getMemoryUser(username)) return true;

  // Check KV
  try {
    if (global.kv) {
      const existing = await global.kv.get(`user:${username}`);
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

  // Try KV if available
  try {
    if (global.kv) {
      await global.kv.set(`user:${username}`, JSON.stringify(userData));
      await global.kv.sadd('all_users', username);
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

// Initialize KV
if (typeof window === 'undefined') {
  import('@vercel/kv')
    .then(({ kv }) => {
      global.kv = kv;
    })
    .catch(() => console.log('KV not available'));
}
