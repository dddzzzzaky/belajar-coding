import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { adminUser, adminPass } = req.body || {};

  if (adminUser !== 'dzaky' || adminPass !== '1122') {
    return res.status(403).json({ error: 'Bukan administrator' });
  }

  const usernames = (await kv.smembers('all_users')) || [];

  const users = [];
  for (const u of usernames) {
    const raw = await kv.get(`user:${u}`);
    const user = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;

    const lastLoginRaw = await kv.get(`lastlogin:${u}`);
    const lastLogin = lastLoginRaw
      ? (typeof lastLoginRaw === 'string' ? JSON.parse(lastLoginRaw) : lastLoginRaw)
      : null;

    users.push({
      username: u,
      createdAt: user?.createdAt || null,
      lastLoginIp: lastLogin?.ip || '-',
      lastLoginTime: lastLogin?.time || null
    });
  }

  const logsRaw = (await kv.lrange('login_logs', 0, 99)) || [];
  const logs = logsRaw.map(l => (typeof l === 'string' ? JSON.parse(l) : l));

  return res.status(200).json({
    totalUsers: users.length,
    users,
    logs
  });
}