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

/**
 * Reply ke interaction dengan smart routing:
 * - Kalau command dijalankan DI channel tujuan (atau channel tujuan tidak diset), embed lengkap
 *   langsung jadi reply biasa di situ (tidak dobel).
 * - Kalau dijalankan DI CHANNEL LAIN, reply cuma jadi konfirmasi singkat ephemeral (cuma keliatan
 *   buat kamu), dan embed lengkapnya dikirim ke channel tujuan.
 * jenis: 'transaksi' | 'budget' | 'recurring' | 'laporan' | 'system'
 */
async function replyRouted(interaction, jenis, embed, { confirmText } = {}) {
  const channelId = config.channels[jenis] || config.channels.default;

  if (!channelId || interaction.channelId === channelId) {
    return interaction.reply({ embeds: [embed] });
  }

  await interaction.reply({ content: confirmText || `✅ Tercatat — cek detailnya di <#${channelId}>`, ephemeral: true });
  return send(jenis, { embeds: [embed] });
}

module.exports = {
  attachClient,
  replyRouted,
  notifyTransaksi: (payload) => send('transaksi', payload),
  notifyBudget: (payload) => send('budget', payload),
  notifyRecurring: (payload) => send('recurring', payload),
  notifyLaporan: (payload) => send('laporan', payload),
  notifySystem: (payload) => send('system', payload),
};
