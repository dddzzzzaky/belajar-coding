import { kv } from '@vercel/kv';
import crypto from 'crypto';

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function getIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

async function logAttempt(username, ip, success) {
  const entry = JSON.stringify({
    username,
    ip,
    success,
    time: new Date().toISOString()
  });
  await kv.lpush('login_logs', entry);
  await kv.ltrim('login_logs', 0, 499);
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

  // Login khusus administrator
  if (username === 'dzaky' && password === '1122') {
    await logAttempt('dzaky (admin)', ip, true);
    return res.status(200).json({ success: true, role: 'admin' });
  }

  const raw = await kv.get(`user:${username}`);
  if (!raw) {
    await logAttempt(username, ip, false);
    return res.status(401).json({ error: 'salah' });
  }

  const user = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const hash = hashPassword(password, user.salt);
  const ok = hash === user.hash;

  await logAttempt(username, ip, ok);

  if (!ok) {
    return res.status(401).json({ error: 'salah' });
  }

  await kv.set(`lastlogin:${username}`, JSON.stringify({ ip, time: new Date().toISOString() }));

  return res.status(200).json({ success: true, role: 'user' });
}