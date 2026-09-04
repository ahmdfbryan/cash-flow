const config = require('../config');

let cachedClient = null;
const channelCache = new Map();

function attachClient(client) {
  cachedClient = client;
}

/**
 * Kirim embed ke channel sesuai jenis notifikasi. Fallback ke CHANNEL_DEFAULT
 * kalau channel spesifik untuk jenis itu belum diisi di .env.
 * jenis: 'transaksi' | 'budget' | 'recurring' | 'laporan' | 'system'
 */
async function send(jenis, payload) {
  if (!cachedClient) return;
  const channelId = config.channels[jenis] || config.channels.default;
  if (!channelId) return; // tidak ada channel dikonfigurasi untuk jenis ini, skip diam-diam

  try {
    let channel = channelCache.get(channelId);
    if (!channel) {
      channel = await cachedClient.channels.fetch(channelId);
      channelCache.set(channelId, channel);
    }
    if (channel) await channel.send(payload);
  } catch (err) {
    console.error(`[Notifier] Gagal kirim ke channel ${jenis} (${channelId}):`, err.message);
  }
}

module.exports = {
  attachClient,
  notifyTransaksi: (payload) => send('transaksi', payload),
  notifyBudget: (payload) => send('budget', payload),
  notifyRecurring: (payload) => send('recurring', payload),
  notifyLaporan: (payload) => send('laporan', payload),
  notifySystem: (payload) => send('system', payload),
};
