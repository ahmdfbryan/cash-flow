# CashFlow Bot 💰

Bot Discord untuk pencatatan cash flow pribadi secara real-time, dengan multi-dompet,
budget tracking, transaksi berulang, laporan visual (chart), dan sync otomatis ke Google Sheets.

## Fitur

- `/catat masuk | keluar | transfer` — catat pemasukan, pengeluaran, atau transfer antar dompet
- `/dompet buat | list | hapus` — kelola multi-dompet (cash, e-wallet, rekening, dll)
- `/kategori buat | list | hapus` — kelola kategori transaksi
- `/riwayat` — riwayat transaksi dengan filter periode & dompet
- `/hapus` — hapus transaksi (dengan konfirmasi tombol) + saldo otomatis dikembalikan
- `/saldo` — cek saldo semua dompet
- `/budget set | list` — anggaran bulanan per kategori + auto-warning kalau mendekati/lewat limit
- `/laporan` — laporan visual dengan pie chart pengeluaran per kategori
- `/berulang buat | list | hapus` — transaksi otomatis berulang (tagihan/langganan)
- Laporan mingguan & bulanan otomatis dikirim ke channel yang kamu tentukan
- Sync real-time tiap transaksi ke Google Sheets
- **Notifikasi terpisah per channel** — log transaksi, warning budget, eksekusi recurring, laporan berkala, dan status/error sistem masing-masing bisa diarahkan ke channel Discord yang berbeda

## Channel Notifikasi

Bot bisa mengirim tiap jenis info ke channel Discord yang berbeda-beda, diatur lewat `.env`:

| Variabel | Isinya |
|---|---|
| `CHANNEL_TRANSAKSI` | Log tiap transaksi masuk/keluar/transfer/hapus (termasuk yang dari `/berulang`) |
| `CHANNEL_BUDGET` | Warning saat pengeluaran kategori mendekati (80%) atau melewati limit budget |
| `CHANNEL_RECURRING` | Notif saat transaksi berulang (tagihan/langganan) tereksekusi otomatis |
| `CHANNEL_LAPORAN` | Laporan otomatis mingguan (Senin pagi) & bulanan (tanggal 1) |
| `CHANNEL_SYSTEM` | Status bot online, error command, dan unhandled error |
| `CHANNEL_DEFAULT` | Fallback kalau salah satu di atas dikosongkan |

Kalau kamu mau semua jenis notif jadi satu channel saja, cukup isi `CHANNEL_DEFAULT` dan biarkan yang lain kosong.
Kalau sebuah jenis notif dan `CHANNEL_DEFAULT` sama-sama kosong, notifikasi itu otomatis dilewati tanpa error.

## 1. Setup Awal

```bash
npm install
cp .env.example .env
```

Isi `.env`:
- `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID` — dari Discord Developer Portal
- `OWNER_ID` — Discord user ID kamu (klik kanan profil kamu di Discord dengan Developer Mode aktif → Copy User ID). Ini membatasi bot cuma bisa dipakai kamu.
- `REPORT_CHANNEL_ID` — channel tempat laporan mingguan/bulanan otomatis dikirim

## 2. Setup Google Sheets

1. Buka [Google Cloud Console](https://console.cloud.google.com/) → buat project baru (atau pakai yang ada)
2. Aktifkan **Google Sheets API** (menu "APIs & Services" → "Enable APIs")
3. Buat **Service Account** ("APIs & Services" → "Credentials" → "Create Credentials" → "Service Account")
4. Di service account tadi, buat key baru bertipe **JSON** → file akan otomatis kedownload
5. Rename file itu jadi `service-account.json`, taruh di root folder project ini (sejajar dengan `package.json`)
6. Buka Google Sheets baru di browser kamu, lalu **share** sheet itu ke email service account (ada di file JSON, formatnya `xxx@xxx.iam.gserviceaccount.com`) dengan akses **Editor**
7. Copy ID spreadsheet dari URL: `docs.google.com/spreadsheets/d/{ID_INI}/edit` → masukkan ke `.env` sebagai `GOOGLE_SHEET_ID`

Bot akan otomatis bikin 2 sheet: `Transaksi` (log tiap transaksi) dan `Ringkasan` (saldo per dompet, update real-time).

> Kalau `service-account.json` belum ada, bot tetap jalan normal — sync Sheets otomatis nonaktif tanpa bikin error.

## 3. Daftarkan Slash Command & Jalankan

```bash
npm run deploy   # daftarkan slash command ke server (guild) kamu
npm start        # jalankan bot
```

## 4. Deploy ke VPS dengan PM2

```bash
npm install -g pm2   # kalau belum ada
npm run pm2:start
pm2 save
pm2 startup          # ikuti instruksi supaya pm2 auto-start saat VPS reboot
```

Lihat log: `npm run pm2:logs` atau `pm2 logs cashflow-bot`

## Struktur Project

```
src/
  commands/       -> tiap file = satu slash command
  database/       -> schema & koneksi SQLite (better-sqlite3)
  services/       -> sheetsService (sync), chartService (QuickChart), reportScheduler (cron)
  utils/          -> formatter & embed builder
  config.js       -> load environment variables
  index.js        -> entry point bot
  deploy-commands.js
data/
  cashflow.db     -> database SQLite (auto-generate, JANGAN dihapus manual)
```

## Catatan Teknis

- Chart pakai **QuickChart.io** (bukan node-canvas) supaya tidak ada native dependency yang bisa gagal compile di VPS.
- Database pakai **better-sqlite3**. Kalau di VPS kamu pernah ada isu native compile, tinggal ganti ke `node:sqlite` bawaan Node.js (Node 22+) — struktur query-nya sudah dipisah rapi di `src/database/db.js` jadi mudah di-swap.
- Bot dibatasi single-user lewat `OWNER_ID` di `.env`. Kalau nanti mau dikembangkan multi-user, tabel `wallets`/`categories`/`transactions` tinggal ditambah kolom `user_id`.

## Extend Lebih Lanjut (Ide)

- Export laporan ke PDF/Excel (`/export`)
- Reminder harian kalau belum ada transaksi tercatat
- Command `/edit` untuk ubah nominal/deskripsi transaksi tanpa hapus-buat-ulang
- Role/permission kalau nanti mau buka ke multi-user
