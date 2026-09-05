import { memoryDB, getMemoryUser, getMemoryLastLogin } from '../lib/memoryDb.js';

// FIX: sama seperti login.js — KV di-lazy-load dan di-await, bukan
// fire-and-forget di top-level yang bisa telat siap saat cold start.
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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { adminUser, adminPass } = req.body || {};

  if (
    !process.env.ADMIN_USERNAME ||
    !process.env.ADMIN_PASSWORD ||
    adminUser !== process.env.ADMIN_USERNAME ||
    adminPass !== process.env.ADMIN_PASSWORD
  ) {
    return res.status(403).json({ error: 'Bukan administrator' });
  }

  try {
    const kv = await getKv();
    let usernames = [];
    let logs = [...memoryDB.logs];

    // Try to get from KV
    try {
      if (kv) {
        const kvUsers = (await kv.smembers('all_users')) || [];
        usernames = [...new Set([...usernames, ...kvUsers])];

        const kvLogs = (await kv.lrange('login_logs', 0, 99)) || [];
        logs = [...kvLogs.map(l => (typeof l === 'string' ? JSON.parse(l) : l)), ...logs];
      }
    } catch (e) {
      console.log('KV fetch failed:', e.message);
    }

    // Add users from memory
    usernames = [...new Set([...usernames, ...Object.keys(memoryDB.users)])];

    // Get user details
    const users = [];
    for (const u of usernames) {
      let user = getMemoryUser(u);

      // Try KV if not in memory
      if (!user && kv) {
        try {
          const raw = await kv.get(`user:${u}`);
          user = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
        } catch (e) {
          console.log('KV user fetch failed:', e.message);
        }
      }

      if (user) {
        let lastLogin = getMemoryLastLogin(u);

        if (!lastLogin && kv) {
          try {
            const raw = await kv.get(`lastlogin:${u}`);
            lastLogin = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
          } catch (e) {
            console.log('KV lastlogin fetch failed:', e.message);
          }
        }

        users.push({
          username: u,
          createdAt: user.createdAt || null,
          lastLoginIp: lastLogin?.ip || '-',
          lastLoginTime: lastLogin?.time || null
        });
      }
    }

    return res.status(200).json({
      totalUsers: users.length,
      users,
      logs: logs.slice(0, 100)
    });
  } catch (e) {
    console.error('Admin error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
