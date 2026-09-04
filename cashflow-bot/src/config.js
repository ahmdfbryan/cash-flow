require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  ownerId: process.env.OWNER_ID,
  channels: {
    default: process.env.CHANNEL_DEFAULT,
    transaksi: process.env.CHANNEL_TRANSAKSI,
    budget: process.env.CHANNEL_BUDGET,
    recurring: process.env.CHANNEL_RECURRING,
    laporan: process.env.CHANNEL_LAPORAN,
    system: process.env.CHANNEL_SYSTEM,
  },
  googleSheetId: process.env.GOOGLE_SHEET_ID,
  googleServiceAccountPath: process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './service-account.json',
  timezone: process.env.TIMEZONE || 'Asia/Jakarta',
  currency: process.env.CURRENCY || 'IDR',
};
