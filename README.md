# 🎬 SanusiPlay — Nonton & Cari Video Tanpa Iklan

**Aplikasi video independen** yang terhubung ke YouTube: bisa mencari video, memutar video,
dan trending harian — lengkap dengan **🛡️ Perisai Sanusi** (sistem blokir iklan).

> Hak cipta © **2026 Sanusi** · Berlogo **AMIK Serang** (warna kebesaran navy `#0f172a` + biru `#3b82f6`)

## ✨ Fitur

| Fitur | Keterangan |
|---|---|
| 🔍 Pencarian video | Lewat API publik Piped & Invidious — **tanpa kunci API**, dengan failover 3 server |
| ▶ Pemutaran video | **Mode Iklan-Nol** (stream langsung ke `<video>`) → otomatis mundur ke **embed resmi** `youtube-nocookie` |
| 🛡️ Perisai Sanusi | CSP memblokir semua domain iklan/pelacak (`doubleclick`, `googlesyndication`, `pagead2`, dll) sebelum tersambung; pelanggaran dihitung tampil di aplikasi |
| 🔥 Trending | Harian per negara (Indonesia default) |
| 🔖 Simpanan | Simpan video favorit di perangkat (localStorage) |
| 🎨 Tema | Gelap / Terang / Ikut sistem |
| 📲 PWA | Pasang di layar utama, shell aplikasi tetap jalan luring (video tetap butuh internet) |

## ⚙️ Cara kerja perisai iklan

1. **Content-Security-Policy** di `index.html` hanya mengizinkan domain YouTube resmi +
   3 server API. Semua domain iklan & pelacak **diblokir sebelum permintaan berangkat**.
2. **Hanya `youtube-nocookie.com`** yang boleh menjadi bingkai — tak ada ruang untuk banner.
3. **Mode Iklan-Nol**: video diputar dari stream publik langsung ke pemutar HTML —
   sistem iklan YouTube tidak dilalui sama sekali.
4. **Kejujuran**: pada Mode Resmi, iklan pre-roll yang muncul *di dalam* bingkai dikendalikan
   YouTube dan tak bisa disaring dari luar frame.

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
node tools/test-app.mjs       # 44+ asersi jsdom (alur cari, putar, simpan, perisai)
node tools/cross-check.mjs    # silang-periksa struktur HTML/CSS/JS
```

`tools/node_modules` adalah simbolik modul dari proyek KasKu (sharp & jsdom).

## 📦 Teknologi

Vanilla HTML/CSS/JS — tanpa framework, tanpa dependensi runtime, tanpa kunci API.
Server data: [Piped](https://github.com/TeamPiped/Piped) & [Invidious](https://github.com/iv-org/invidious)
(API publik ber-CORS longgar, diuji otomatis).

---

Hak cipta © 2026 **Sanusi**. SanusiPlay tidak berafiliasi dengan YouTube atau Google.
