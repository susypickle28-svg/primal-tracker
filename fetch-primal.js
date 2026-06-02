// fetch-primal.js — v12 (yt-dlp, senza dipendenze e senza canvas)
const { exec } = require('child_process');
const fs = require('fs');

const DATA_FILE = 'data.json';

async function fetchDailyVideos() {
  console.log('🚀 Avvio yt-dlp per #primal...');

  return new Promise((resolve, reject) => {
    // Comando yt-dlp per ottenere i video di #primal in formato JSON
    // Con --dateafter, prende solo i video delle ultime 24h
    const cmd = `yt-dlp --no-download --dump-json "https://www.tiktok.com/tag/primal" --dateafter now-24hours 2>/dev/null`;

    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.log('⚠️ yt-dlp warning (se ci sono pochi video è normale):', error.message);
        resolve({ dailyVideos: 0, totalFetched: 0, totalLikes: 0, totalViews: 0, totalShares: 0 });
        return;
      }

      // Analizza l'output (ogni riga è un JSON di un video)
      const lines = stdout.trim().split('\n').filter(l => l.trim() !== '');
      const videos = lines.map(l => {
        try { return JSON.parse(l); } catch (e) { return null; }
      }).filter(v => v !== null);

      console.log(`📦 Ricevuti ${videos.length} video totali`);

      // Calcola like, view, share (se disponibili)
      const totalLikes = videos.reduce((s, v) => s + (v.like_count || 0), 0);
      const totalViews = videos.reduce((s, v) => s + (v.view_count || 0), 0);
      // share_count non sempre disponibile su TikTok
      const totalShares = videos.reduce((s, v) => s + (v.share_count || 0), 0);

      console.log(`📅 Video trovati: ${videos.length}`);
      console.log(`❤️ Like: ${totalLikes}  👁️ View: ${totalViews}`);

      resolve({
        dailyVideos: videos.length,
        totalFetched: videos.length,
        totalLikes,
        totalViews,
        totalShares,
      });
    });
  });
}

async function updateDataFile(stats) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const updateTime = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });

  let records = [];
  if (fs.existsSync(DATA_FILE)) {
    try {
      records = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (!Array.isArray(records)) records = [];
    } catch (e) {
      records = [];
    }
  }

  const newRecord = {
    date: today,
    dailyVideos: stats.dailyVideos,
    totalFetched: stats.totalFetched,
    totalLikes: stats.totalLikes,
    totalViews: stats.totalViews,
    totalShares: stats.totalShares,
    updateTime,
  };

  const idx = records.findIndex(r => r.date === today);
  if (idx >= 0) {
    records[idx] = newRecord;
    console.log(`🔄 Aggiornato ${today} @ ${updateTime}`);
  } else {
    records.push(newRecord);
    console.log(`➕ Aggiunto ${today} @ ${updateTime}`);
  }

  if (records.length > 90) records = records.slice(-90);
  records.sort((a, b) => a.date.localeCompare(b.date));
  fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2));
  console.log(`💾 Salvati ${records.length} record`);
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
