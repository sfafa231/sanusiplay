# 🎬 SanusiPlay — Nonton & Cari Video Tanpa Iklan

**Aplikasi video independen** yang terhubung ke YouTube: bisa mencari video, memutar video,
dan trending harian — lengkap dengan **🛡️ Perisai Mutlak** (sistem blokir iklan tiga lapis).

> Hak cipta © **2026 Sanusi** · Berlogo **AMIK Serang** (warna kebesaran navy `#0f172a` + biru `#2563eb`)

## ✨ Fitur

| Fitur | Keterangan |
|---|---|
| 🔍 Pencarian video | Lewat API publik Piped & Invidious — **tanpa kunci API**, dengan failover 3 server |
| ▶ Pemutaran video | **Hanya jalur bebas iklan**: satu aliran gabungan, atau dua aliran (video-saja + audio-saja) yang disinkronkan. **Pemutar resmi YouTube beriklan dihapus total** |
| 🛡️ Perisai Mutlak | **Tiga lapis**: CSP (`frame-src 'none'` + blokir domain iklan) → penjaga jaringan `fetch()` → pencegat Service Worker. Pelanggaran dihitung & tampil di aplikasi |
| 🔥 Trending | Harian per negara (Indonesia default) |
| 🔖 Simpanan | Simpan video favorit di perangkat (localStorage) |
| 🎨 Tema | Gelap / Terang / Ikut sistem |
| 📲 PWA | Pasang di layar utama, shell aplikasi tetap jalan luring (video tetap butuh internet) |

## ⚙️ Cara kerja Perisai Mutlak (nol iklan)

1. **CSP `frame-src 'none'`** — *semua* bingkai dilarang mutlak. Pemutar YouTube yang
   menyiarkan iklan pre-roll **tidak mungkin hidup**, sekalipun ada celah di dalam kode.
2. **Penjaga jaringan (JavaScript)** — `window.fetch` dibungkus; setiap permintaan ke
   domain iklan/pelacak (`doubleclick`, `googlesyndication`, `pagead`, dll) ditolak.
3. **Pencegat Service Worker** — permintaan iklan yang lolos pun diputus di level
   jaringan perangkat (dijawab `204`), bahkan sebelum meninggalkan ponsel.
4. **Jalur putar tanpa iklan** — video diputar dari stream publik langsung ke elemen
   `<video>`/`<audio>`; bila tak ada aliran gabungan, dua aliran video & audio
   disinkronkan (cari posisi, volume, senyap, kecepatan) agar tayangan tetap mulus.
5. **Kejujuran** — bila suatu tayangan benar-benar tak punya jalur bebas iklan, aplikasi
   berkata jujur dan memberi tombol **Coba lagi**, bukan diam-diam menyalakan iklan.

## 🚀 Menjalankan

Buka `index.html` lewat web server (GitHub Pages / `python3 -m http.server`).
Tanpa server pun bisa (file://), hanya service worker yang nonaktif.

```bash
python3 -m http.server 8000
# → http://localhost:8000/
```

## 🛠️ Bengkel (`tools/`)

```bash
node tools/make-icons.mjs     # ukir logo (SVG → PNG, sharp)
node tools/verify-icons.mjs   # verifikasi piksel logo
node tools/test-app.mjs       # 116 asersi jsdom (cari, putar, perisai 3 lapis, failover)
node tools/cross-check.mjs    # 61 asersi silang-periksa struktur HTML/CSS/JS
```

`tools/node_modules` adalah simbolik modul dari proyek KasKu (sharp & jsdom).

## 📦 Teknologi

Vanilla HTML/CSS/JS — tanpa framework, tanpa dependensi runtime, tanpa kunci API.
Server data: [Piped](https://github.com/TeamPiped/Piped) & [Invidious](https://github.com/iv-org/invidious)
(API publik ber-CORS longgar, diuji otomatis).

---

Hak cipta © 2026 **Sanusi**. SanusiPlay tidak berafiliasi dengan YouTube atau Google.
