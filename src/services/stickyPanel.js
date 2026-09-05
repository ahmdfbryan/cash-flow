const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database/db');

let cachedClient = null;
let panelChannelId = null;
let panelMessageId = null;
let repostTimer = null;
const REPOST_DEBOUNCE_MS = 1200;

function attachClient(client) {
  cachedClient = client;
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}
function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

/** Dipanggil sekali saat bot online, biar tetep inget panel lama abis restart. */
function loadFromSettings() {
  panelChannelId = getSetting('panel_channel_id');
  panelMessageId = getSetting('panel_message_id');
}

function buildPanelPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('⚡ Panel Cash Flow')
    .setDescription('Bot Discord untuk membantu mencatat dan memantau keuangan pribadi dengan lebih praktis. Digunakan untuk mencatat pemasukan dan pengeluaran, melihat riwayat transaksi, serta memantau kondisi keuangan secara langsung melalui Discord.')
    .addFields(
      { name: '📥 Catat Masuk', value: 'Pemasukan baru\n(gaji, bonus, jualan, dll)', inline: true },
      { name: '📤 Catat Keluar', value: 'Pengeluaran baru\n(belanja, tagihan, dll)', inline: true },
      { name: '🔄 Transfer', value: 'Pindah saldo\nantar dompet', inline: true },
    )
    .setFooter({ text: 'Noname Studios Creative' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_masuk').setLabel('Catat Masuk').setEmoji('📥').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel_keluar').setLabel('Catat Keluar').setEmoji('📤').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('panel_transfer').setLabel('Transfer').setEmoji('🔄').setStyle(ButtonStyle.Primary),
  );

  return { embeds: [embed], components: [row] };
}

/** Dipanggil dari /panel — pasang (atau pindahkan) panel ke channel yang dituju. */
async function postPanel(channel) {
  // Kalau sebelumnya ada panel di channel lain, bersihkan dulu biar gak ada yang nyangkut.
  if (panelChannelId && panelMessageId && panelChannelId !== channel.id) {
    const oldChannel = await cachedClient.channels.fetch(panelChannelId).catch(() => null);
    if (oldChannel) {
      const oldMsg = await oldChannel.messages.fetch(panelMessageId).catch(() => null);
      if (oldMsg) await oldMsg.delete().catch(() => {});
    }
  }

  const sent = await channel.send(buildPanelPayload());
  panelChannelId = channel.id;
  panelMessageId = sent.id;
  setSetting('panel_channel_id', panelChannelId);
  setSetting('panel_message_id', panelMessageId);
}

/** Dipanggil dari listener messageCreate di index.js untuk tiap pesan baru. */
function handleMessageCreate(message) {
  if (!panelChannelId || message.channelId !== panelChannelId) return;
  if (message.id === panelMessageId) return; // ini panelnya sendiri, abaikan

  if (repostTimer) clearTimeout(repostTimer);
  repostTimer = setTimeout(() => repost().catch(err => console.error('[StickyPanel] Gagal repost:', err.message)), REPOST_DEBOUNCE_MS);
}

async function repost() {
  if (!panelChannelId) return;
  const channel = await cachedClient.channels.fetch(panelChannelId).catch(() => null);
  if (!channel) return;

  const oldId = panelMessageId;
  const sent = await channel.send(buildPanelPayload());
  panelMessageId = sent.id;
  setSetting('panel_message_id', panelMessageId);

  if (oldId) {
    const oldMsg = await channel.messages.fetch(oldId).catch(() => null);
    if (oldMsg) await oldMsg.delete().catch(() => {});
  }
}

module.exports = { attachClient, loadFromSettings, postPanel, handleMessageCreate };
