// Satu sumber untuk lazy-load @vercel/kv, di-await dengan benar.
// Dipakai bareng oleh semua file di lib/ dan api/ supaya konsisten —
// jangan ada lagi masing-masing file bikin cara sendiri-sendiri buat init KV.

let kvPromise = null;

export function getKv() {
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

