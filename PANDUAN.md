# Dashboard FA Detail Kemenko Infra — Supabase (migrasi dari Apps Script v28)

## Isi paket

| Berkas | Fungsi |
|---|---|
| `index.html` | Dashboard, riwayat, Analisis Pergeseran Anggaran, dan Jenis Belanja 521/522/524 |
| `mapping.js` | Mapping Kegiatan.KRO.RO.Komponen → unit kerja dari aplikasi sebelumnya |
| `fa-processor.js` | Klasifikasi dan perhitungan FA Detail; **sisa = pagu − realisasi**, tanpa Lock Pagu |
| `supabase-adapter.js` | Pengganti Google Apps Script untuk membaca/menyimpan riwayat dan PDF |
| `config.js` | Isi URL project dan **publishable key** Supabase |
| `setup.sql` | Tabel database, Storage private, dan Row Level Security |

## 1. Siapkan project Supabase

1. Masuk ke [Supabase Dashboard](https://supabase.com/dashboard), buat atau pilih project yang akan dipakai untuk dashboard ini.
2. Buka **SQL Editor**, jalankan isi `setup.sql` hingga berhasil. SQL ini membuat tabel `public.fa_reports` dan bucket privat `fa-detail-pdf`.
3. Buka **Authentication → Users**, buat/invite akun pengguna yang diizinkan. Hindari pendaftaran publik untuk data anggaran internal. Bila perlu, nonaktifkan opsi **Allow new users to sign up** pada konfigurasi Auth.
4. Temukan **Project URL** dan **publishable key** pada Project Settings / API Keys atau Connect. Masukkan ke `config.js`.
5. **Jangan** memasukkan `service_role`, secret API key, database password, atau token pengguna ke berkas frontend.

## 2. Jalankan halaman web

Supabase menyediakan database, Auth, dan Storage; **file HTML statis memerlukan hosting web**. Cara termudah: deploy isi folder pada layanan hosting statis seperti Netlify, Cloudflare Pages, atau GitHub Pages. Pada hosting, pastikan file `index.html`, `config.js`, `mapping.js`, `fa-processor.js`, dan `supabase-adapter.js` berada pada root direktori yang sama.

Untuk uji lokal, buka terminal pada folder dan jalankan:

```bash
python3 -m http.server 8080
```

Lalu buka `http://localhost:8080/`. Jangan membuka file sebagai `file:///...`; gunakan server HTTP lokal.

Jika login email mengharuskan redirect, masukkan URL hosting pada **Authentication → URL Configuration** (Site URL / Redirect URLs).

## 3. Menggunakan aplikasi

1. Login dengan akun Supabase yang sudah dibuat.
2. Pilih **PDF FA Detail** dari SAKTI (maks 15 MB); parsing PDF dilakukan di browser.
3. Pilih **Batal**, **Lanjutkan tanpa menyimpan**, atau **Simpan FA Detail**.
4. Jika disimpan, hasil pengolahan tercatat dalam PostgreSQL, PDF di Storage private, dan dapat dibuka melalui filter riwayat berdasarkan tanggal.
5. Buka **Analisis Pergeseran Anggaran** atau **Jenis Belanja** tanpa mengunggah PDF ulang. Seluruh menu menggunakan laporan aktif yang sama.
6. **Keluar** dari aplikasi jika selesai.

## Perhitungan dan pengelompokan

- Pagu dan realisasi berasal dari akun 6 digit pada FA Detail. Sisa dihitung `pagu − realisasi` **tanpa Lock Pagu**.
- Nonoperasional per jenis belanja: 521 (Barang), 522 (Jasa), dan 524 (Perjalanan Dinas). EBA.994 operasional, 51, 53, dan 523 tidak masuk tabel ini.
- Rekomendasi simulasi memperbolehkan antarunit kerja dalam **Kegiatan.KRO sama**: 524 ↔ 524 dan Non-524 ↔ Non-524 yang lolos klasifikasi. Data asli tidak diubah.
- Selalu periksa mapping dan pemisahan operasional/nonoperasional, terutama PRRP serta belanja berbasis 7394.EBA. Jangan menjadikan simulasi sebagai persetujuan revisi SAKTI.

## Keamanan & keterbatasan

- Login wajib; RLS dan Storage private membatasi setiap pengguna pada PDF dan riwayat **milik akunnya sendiri**. Belum ada akses riwayat lintas-pengguna, pengelolaan admin, atau pembagian izin tim. Bila seluruh tim perlu melihat riwayat bersama, harus dirancang aturan grup/role yang terverifikasi terlebih dahulu.
- Data diproses pada browser menggunakan PDF.js; ketika menyimpan, laporan hasil olahan dan PDF dikirim ke project Supabase.
- Project Supabase tidak otomatis dibuat ataupun dideploy oleh paket ini. SQL dan hosting harus dijalankan pada akun pemilik.
- **Riwayat Google Drive lama tidak otomatis dipindahkan**. PDF lama dapat diunggah ulang lalu disimpan di aplikasi Supabase ini. Untuk memindahkan seluruh arsip lama secara massal diperlukan akses Drive dan proses migrasi tersendiri.
- Uji memakai data contoh sudah dilakukan untuk 521/522/524, mapping, dan sisa tanpa Lock Pagu. Koneksi ke project Supabase dan pengujian PDF aktual di hosting belum dijalankan.
