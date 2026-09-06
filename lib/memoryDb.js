// Shared in-memory database untuk semua API endpoints
// Persistent across function invocations dalam same process

import { getKv } from './kv.js';

// FIX: sebelumnya ada 'testuser' hardcode yang otomatis ada di SETIAP
// deployment (gak perlu manggil /api/seed). Hash-nya kebetulan rusak jadi
// gak bisa dipakai login, tapi tetap bikin daftar user di panel admin gak
// bersih. Sekarang dikosongkan — kalau butuh akun percobaan, pakai
// /api/seed (yang sudah digerbang kredensial admin).
const DEFAULT_USERS = {};

// Use global to persist across invocations
if (!global.memoryDBInstance) {
  global.memoryDBInstance = {
    users: { ...DEFAULT_USERS },
    logs: [],
    lastLogins: {}
  };
}

export const memoryDB = global.memoryDBInstance;

export function getMemoryUser(username) {
  return memoryDB.users[username] || null;
}

export function saveMemoryUser(username, userData) {
  memoryDB.users[username] = userData;
  return userData;
}

export async function addMemoryLog(username, ip, success) {
  const entry = {
    username,
    ip,
    success,
    time: new Date().toISOString()
  };

  memoryDB.logs.push(entry);
  if (memoryDB.logs.length > 500) {
    memoryDB.logs = memoryDB.logs.slice(-500);
  }

  // FIX: sebelumnya cek `global.kv` yang sekarang gak pernah ke-set lagi
  // (karena pola fire-and-forget di tiap file udah dihapus). Sekarang
  // pakai getKv() yang sama dengan file lain, dan di-await dengan benar.
  try {
    const kv = await getKv();
    if (kv) {
      await kv.lpush('login_logs', JSON.stringify(entry));
      await kv.ltrim('login_logs', 0, 499);
    }
  } catch (e) {
    console.log('KV log failed:', e.message);
  }

  return entry;
}

export function saveMemoryLastLogin(username, ip) {
  memoryDB.lastLogins[username] = {
    ip,
    time: new Date().toISOString()
  };
}

export function getMemoryLastLogin(username) {
  return memoryDB.lastLogins[username] || null;
}
