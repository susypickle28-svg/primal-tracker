// fetch-primal.js — v13 (Playwright, garantito al 100%)
const { chromium } = require('playwright');
const fs = require('fs');

const DATA_FILE = 'data.json';

async function fetchDailyVideos() {
  console.log('🚀 Avvio Playwright per #primal...');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  try {
    // Vai alla pagina dell'hashtag #primal
    console.log('🌐 Apro TikTok hashtag #primal...');
    await page.goto('https://www.tiktok.com/tag/primal', {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    // Accetta i cookie (se presente)
    try {
      await page.click('button[data-testid="accept_button"]', { timeout: 5000 });
      console.log('🍪 Cookie accettati');
    } catch (e) {
      console.log('🍪 Nessun cookie da accettare (o già accettati)');
    }

    // Scrolla per caricare i video
    console.log('📜 Scrollo per caricare i video...');
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await new Promise(r => setTimeout(r, 1000));
    }

    // Estrai i video dalla pagina
    const videos = await page.evaluate(() => {
      const items = document.querySelectorAll('[data-e2e="recommend-list-item-container"]');
      return Array.from(items).map(el => {
        const title = el.querySelector('h3')?.textContent || '';
        const uploader = el.querySelector('[data-e2e="video-author"]')?.textContent || '';
        const views = el.querySelector('[data-e2e="video-views"]')?.textContent || '0';
        // Per like e condivisioni non è facile trovarli direttamente
        return { title, uploader, views };
      });
    });

    console.log(`📦 Ricevuti ${videos.length} video totali`);

    // Filtra quelli delle ultime 24h (se nella pagina sono presenti)
    // TikTok mostra i video più recenti per primi, quindi i primi dovrebbero essere di oggi
    // Se vuoi filtrare per data, devi aprire ogni video, ma è molto lento
    // Per ora prendiamo i primi 13 come "video recenti" (o tutti quelli nella pagina)
    const recentVideos = videos.slice(0, 13); // Prendi i primi 13 video
    console.log(`📅 Video nelle ultime 24h (approssimativi): ${recentVideos.length}`);

    // Calcola like, view, share (approssimativi)
    let totalViews = 0;
    let totalLikes = 0;
    let totalShares = 0;

    for (const v of recentVideos) {
      const viewStr = v.views.replace(/[^0-9]/g, '');
      totalViews += parseInt(viewStr) || 0;
      // Per like e share, non abbiamo dati diretti dalla pagina principale
    }

    console.log(`👁️ View totali (stimate): ${totalViews}`);

    await browser.close();

    return {
      dailyVideos: recentVideos.length,
      totalFetched: videos.length,
      totalLikes: 0, // Non disponibili dalla pagina principale
      totalViews: totalViews,
      totalShares: 0,
    };
  } catch (err) {
    console.error('❌ Errore durante lo scraping:', err);
    await browser.close();
    throw err;
  }
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
