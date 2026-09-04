const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const TX_SHEET = 'Transaksi';
const SUMMARY_SHEET = 'Ringkasan';

let sheetsClient = null;
let ready = false;

async function init() {
  try {
    const keyPath = path.resolve(config.googleServiceAccountPath);
    if (!fs.existsSync(keyPath)) {
      console.warn('[Sheets] service-account.json tidak ditemukan — sync Sheets dinonaktifkan.');
      return;
    }
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    sheetsClient = google.sheets({ version: 'v4', auth });
    await ensureSheetsExist();
    ready = true;
    console.log('[Sheets] Terhubung dan siap sync.');
  } catch (err) {
    console.error('[Sheets] Gagal inisialisasi:', err.message);
  }
}

async function ensureSheetsExist() {
  const meta = await sheetsClient.spreadsheets.get({ spreadsheetId: config.googleSheetId });
  const existing = meta.data.sheets.map(s => s.properties.title);

  const requests = [];
  if (!existing.includes(TX_SHEET)) requests.push({ addSheet: { properties: { title: TX_SHEET } } });
  if (!existing.includes(SUMMARY_SHEET)) requests.push({ addSheet: { properties: { title: SUMMARY_SHEET } } });

  if (requests.length) {
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId: config.googleSheetId,
      requestBody: { requests },
    });
  }

  // Header baris pertama untuk sheet transaksi
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId: config.googleSheetId,
    range: `${TX_SHEET}!A1:G1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [['ID', 'Tanggal', 'Tipe', 'Dompet', 'Kategori', 'Jumlah', 'Deskripsi']],
    },
  });
}

async function appendTransaction(tx, walletName, categoryName) {
  if (!ready) return;
  try {
    const typeLabel = { income: 'Masuk', expense: 'Keluar', transfer_in: 'Transfer Masuk', transfer_out: 'Transfer Keluar' }[tx.type];
    await sheetsClient.spreadsheets.values.append({
      spreadsheetId: config.googleSheetId,
      range: `${TX_SHEET}!A:G`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[tx.id, tx.created_at, typeLabel, walletName, categoryName || '-', tx.amount, tx.description || '']],
      },
    });
  } catch (err) {
    console.error('[Sheets] Gagal append transaksi:', err.message);
  }
}

async function syncSummary(wallets, totalBalance) {
  if (!ready) return;
  try {
    const rows = [['Dompet', 'Saldo'], ...wallets.map(w => [w.name, w.balance]), ['TOTAL', totalBalance]];
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: config.googleSheetId,
      range: `${SUMMARY_SHEET}!A1:B${rows.length}`,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });
  } catch (err) {
    console.error('[Sheets] Gagal update ringkasan:', err.message);
  }
}

function isReady() {
  return ready;
}

module.exports = { init, appendTransaction, syncSummary, isReady };
