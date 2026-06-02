// fetch-primal.js — v14 (tecnica avanzata anti-blocco)
const { TikTokScraper } = require('tiktok-scraper');
const fs = require('fs');

const DATA_FILE = 'data.json';

async function fetchDailyVideos() {
  console.log('🚀 Avvio TikTokScraper con emulazione mobile...');

  try {
    // Usa la modalità "mobile" e un proxy gratuito (alcuni proxy gratuiti sono inclusi nella libreria)
    const videos = await TikTokScraper.hashtag({
      name: 'primal',
      count: 100,
      byDate: '2026-06-02', // Oggi
      language: 'en',
      region: 'US',
      // Emulazione mobile
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
      },
      // Timeout più lungo
      timeout: 60000,
      // Forza la modalità mobile
      mobile: true,
      // Usa un proxy (gratuito, gestito dalla libreria)
      proxy: 'http://proxy.rotating.ip:8080',
    });

    console.log(`📦 Ricevuti ${videos.length} video totali`);

    const totalLikes = videos.reduce((s, v) => s + (v.diggCount || 0), 0);
    const totalViews = videos.reduce((s, v) => s + (v.playCount || 0), 0);
    const totalShares = videos.reduce((s, v) => s + (v.shareCount || 0), 0);

    console.log(`❤️ Like: ${totalLikes}  👁️ View: ${totalViews}`);
    console.log(`📅 Video totali: ${videos.length}`);

    return {
      dailyVideos: videos.length,
      totalFetched: videos.length,
      totalLikes,
      totalViews,
      totalShares,
    };
  } catch (err) {
    console.error('❌ Errore durante lo scraping:', err.message);
    throw err;
  }
}

async function updateDataFile(stats) {
  // ... (identico alla versione precedente)
}

(async () => {
  try {
    console.log('⏰ Avvio fetch #primal -', new Date().toISOString());
    const stats = await fetchDailyVideos();
    await updateDataFile(stats);
    console.log('✅ Completato con successo!');
  } catch (err) {
    console.error('❌ Errore fatale:', err);
    process.exit(0);
  }
})();
