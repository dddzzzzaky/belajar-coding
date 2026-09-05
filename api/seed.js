import crypto from 'crypto';
import { memoryDB, saveMemoryUser } from '../lib/memoryDb.js';
import { checkAndRecordRequest } from '../lib/rateLimit.js';

function getIp(req) {
  const real = req.headers['x-real-ip'];
  if (real) return real;
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',').pop().trim();
  return req.socket?.remoteAddress || 'unknown';
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

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // FIX KRITIS: endpoint ini sebelumnya bisa diakses SIAPA SAJA tanpa login,
  // dan langsung menampilkan username+password akun test di response JSON —
  // artinya siapa pun yang tahu URL-nya dapat akun valid ke aplikasi ini.
  // Sekarang wajib pakai kredensial admin yang sama seperti /api/admin.
  const ip = getIp(req);
  const rl = await checkAndRecordRequest(ip);
  if (rl.blocked) {
    return res.status(429).json({ error: 'Terlalu banyak percobaan dari alamat ini, coba lagi nanti' });
  }

  const adminUser = req.query?.adminUser || req.body?.adminUser;
  const adminPass = req.query?.adminPass || req.body?.adminPass;

  if (
    !process.env.ADMIN_USERNAME ||
    !process.env.ADMIN_PASSWORD ||
    adminUser !== process.env.ADMIN_USERNAME ||
    adminPass !== process.env.ADMIN_PASSWORD
  ) {
    return res.status(403).json({ error: 'Bukan administrator' });
  }

  try {
    if (memoryDB.users['testuser']) {
      return res.json({
        success: true,
        message: 'User testuser sudah ada'
      });
    }

    // FIX: hash sebelumnya di-hardcode string acak yang panjangnya tidak
    // sesuai output scrypt asli, jadi testuser sebenarnya TIDAK PERNAH bisa
    // login dengan benar. Sekarang hash beneran dihitung dari passwordnya.
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync('password123', salt, 64).toString('hex');

    const userData = {
      username: 'testuser',
      hash,
      salt,
      createdAt: new Date().toISOString()
    };

    saveMemoryUser('testuser', userData);

    try {
      const kv = await getKv();
      if (kv) {
        await kv.set('user:testuser', JSON.stringify(userData));
        await kv.sadd('all_users', 'testuser');
      }
    } catch (e) {
      console.log('KV save failed (but memory saved):', e.message);
    }

    // FIX: password tidak lagi dikembalikan lewat response. Kalau kamu butuh
    // tahu kredensial testuser, lihat langsung di kode ini ('password123'),
    // jangan expose lewat API publik.
    return res.json({
      success: true,
      message: 'User test berhasil dibuat'
    });
  } catch (e) {
    console.error('Seed error:', e);
    return res.status(500).json({
      error: 'Server error saat seeding data'
    });
  }
    }
