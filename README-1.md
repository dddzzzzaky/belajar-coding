# Belajar Coding - code_academy

Web app belajar 10 bahasa pemrograman (50 bab tiap bahasa), dengan sistem daftar akun & login yang **tersimpan permanen** di database, plus panel khusus administrator.

## Struktur project

```
index.html          <- halaman utama (frontend)
api/register.js     <- serverless function: daftar akun baru
api/login.js        <- serverless function: login + catat IP
api/admin.js        <- serverless function: data khusus admin
package.json        <- daftar dependency
```

**Upload semua file dan folder ini ke root repo GitHub kamu, jangan cuma index.html-nya doang** — folder `api/` dan `package.json` wajib ikut ke-upload biar fitur login/daftar akun jalan.

## Cara deploy ke Vercel

1. Buat repo baru di GitHub, upload semua file di atas (jaga struktur foldernya, terutama folder `api/`).
2. Buka https://vercel.com, login pakai akun GitHub.
3. **Add New → Project**, pilih repo yang tadi dibuat, klik **Deploy**.
4. Setelah deploy pertama selesai (fiturnya belum jalan penuh dulu, karena databasenya belum disambung), lanjut ke langkah database di bawah.

## Setup database (Vercel KV) — WAJIB biar akun tersimpan permanen

1. Di dashboard project kamu di Vercel, buka tab **Storage**.
2. Klik **Create Database → KV (Redis)**.
3. Kasih nama bebas, lalu klik **Create**.
4. Setelah dibuat, Vercel akan otomatis menawarkan buat **Connect** database itu ke project kamu — klik **Connect** dan pilih project-nya. Ini otomatis nambahin environment variable yang dibutuhkan (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, dll), kamu gak perlu isi manual.
5. Buka tab **Deployments**, ambil deployment terakhir, klik titik tiga → **Redeploy**. Ini penting supaya project kebaca environment variable yang baru disambungkan tadi.

Setelah itu, akun yang didaftarkan lewat halaman "daftar dulu" bakal tersimpan permanen di database, gak akan hilang walau website di-refresh atau dibuka dari device lain.

## Login administrator

- Username: `dzaky`
- Password: `1122`

Kredensial ini **tidak ada di kode frontend sama sekali** — cuma dicek di server (`api/login.js` dan `api/admin.js`), jadi orang lain gak bisa lihat lewat "view source" browser.

Setelah login sebagai admin, kamu masuk ke **Panel Admin** yang menampilkan:
- Daftar semua akun yang terdaftar (username, kapan daftar, IP login terakhir, waktu login terakhir)
- Log 100 percobaan login terbaru (username yang dipakai, IP address, berhasil/gagal, waktu)

## Soal keamanan & privasi (penting dibaca)

- Password pengguna disimpan dalam bentuk **hash** (scrypt + salt acak per akun), bukan teks polos — jadi walau database bocor, password asli tetap gak kebaca langsung.
- Karena situs ini sekarang beneran mencatat IP address orang yang login, kalau situs ini dipakai publik (bukan cuma buat kamu sendiri), idealnya kasih tau pengunjung lewat semacam catatan singkat di halaman login bahwa aktivitas login mereka dicatat untuk keperluan keamanan — supaya transparan.
- Ganti password admin (`1122`) ke sesuatu yang lebih kuat langsung di file `api/login.js` dan `api/admin.js` sebelum dipakai serius, karena `1122` gampang banget ditebak.
