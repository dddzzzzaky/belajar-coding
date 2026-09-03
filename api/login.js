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

// Fungsi ini sengaja TIDAK di-await pas dipanggil dari handler utama,
// biar kalau database gagal/belum connect, itu gak bikin proses login ikut gagal.
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
    console.error('Gagal mencatat log login (diabaikan, tidak menggagalkan login):', e);
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

  // Login khusus administrator — dicek PALING DULUAN dan TIDAK bergantung
  // ke database sama sekali, jadi tetap bisa masuk walau KV belum di-setup.
  if (
    process.env.ADMIN_USERNAME &&
    process.env.ADMIN_PASSWORD &&
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    logAttempt(`${username} (admin)`, ip, true); // fire-and-forget, tidak di-await
    return res.status(200).json({ success: true, role: 'admin' });
  }

  try {
    const raw = await kv.get(`user:${username}`);
    if (!raw) {
      logAttempt(username, ip, false);
      return res.status(401).json({ error: 'salah' });
    }

    const user = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const hash = hashPassword(password, user.salt);
    const ok = hash === user.hash;

    logAttempt(username, ip, ok);

    if (!ok) {
      return res.status(401).json({ error: 'salah' });
    }

    kv.set(`lastlogin:${username}`, JSON.stringify({ ip, time: new Date().toISOString() })).catch(e => {
      console.error('Gagal simpan lastlogin (diabaikan):', e);
    });

    return res.status(200).json({ success: true, role: 'user' });
  } catch (e) {
    console.error('Login error:', e);
    return res.status(500).json({
      error: 'Server lagi bermasalah, kemungkinan database (KV) belum tersambung ke project ini.'
    });
  }
}
