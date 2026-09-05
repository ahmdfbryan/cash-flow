const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');

let model = null;
let ready = false;

function init() {
  if (!config.geminiApiKey) {
    console.warn('[Gemini] GEMINI_API_KEY tidak diisi — narasi AI dinonaktifkan, laporan tetap jalan tanpa narasi.');
    return;
  }
  try {
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
    ready = true;
    console.log('[Gemini] Siap digunakan.');
  } catch (err) {
    console.error('[Gemini] Gagal inisialisasi:', err.message);
  }
}

/**
 * Generate teks natural dari prompt. Kalau Gemini belum siap atau gagal,
 * balikin null diam-diam — pemanggil harus siap kalau hasilnya null dan
 * skip bagian narasi, JANGAN sampai bikin command gagal total gara-gara AI down.
 */
async function generateText(prompt) {
  if (!ready) return null;
  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    console.error('[Gemini] Gagal generate teks:', err.message);
    return null;
  }
}

function isReady() {
  return ready;
}

module.exports = { init, generateText, isReady };
