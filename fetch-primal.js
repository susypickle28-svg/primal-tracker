// fetch-primal.js — #primal tracker
// Legge videoCount direttamente dall'API web pubblica di TikTok (no auth richiesta)

const https = require('https');
const fs = require('fs');

const DATA_FILE = 'data.json';

function httpRequest(options) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), raw: data });
        } catch(e) {
          resolve({ status: res.statusCode, body: null, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchPrimalVideoCount() {
  console.log('🚀 Fetching #primal stats da TikTok...');

  // TikTok API pubblica usata dalla webapp per le stats degli hashtag
  const res = await httpRequest({
    hostname: 'www.tiktok.com',
    path: '/api/challenge/detail/?challengeName=primal&aid=1988',
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.tiktok.com/tag/primal',
    }
  });

  console.log('📡 Status:', res.status);

  if (res.body) {
    console.log('🔍 Keys risposta:', Object.keys(res.body));

    const videoCount =
      res.body?.challengeInfo?.stats?.videoCount ||
      res.body?.challenge?.stats?.videoCount ||
      res.body?.stats?.videoCount ||
      res.body?.data?.stats?.videoCount ||
      null;

    if (videoCount) {
      console.log(`🎯 Video totali #primal: ${videoCount}`);
      return videoCount;
    }

    // Debug completo se non trovato
    console.log('🔍 Body completo:', JSON.stringify(res.body, null, 2));
  } else {
    console.log('🔍 Raw response (primi 500 chars):', res.raw.substring(0, 500));
  }

  // Fallback: scraping della pagina HTML del tag
  console.log('⚠️ API JSON non ha funzionato, provo scraping HTML...');
  return await scrapeFromHTML();
}

async function scrapeFromHTML() {
  const res = await httpRequest({
    hostname: 'www.tiktok.com',
    path: '/tag/primal',
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });

  console.log('📡 HTML Status:', res.status);

  // Cerca __UNIVERSAL_DATA_FOR_REHYDRATION__ o simile nello script
  const raw = res.raw;

  // Pattern per trovare videoCount nel JSON embedded nella pagina
  const patterns = [
    /"videoCount"\s*:\s*(\d+)/,
    /"video_count"\s*:\s*(\d+)/,
    /"postCount"\s*:\s*(\d+)/,
    /videoCount['"]\s*:\s*(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) {
      const count = parseInt(match[1]);
      console.log(`🎯 Trovato via HTML scraping: ${count}`);
      return count;
    }
  }

  // Stampa un pezzo di HTML per debug
  const idx = raw.indexOf('primal');
  if (idx > -1) {
    console.log('🔍 Contesto "primal" nella pagina:', raw.substring(Math.max(0, idx-100), idx+300));
  }

  console.error('❌ videoCount non trovato neanche via HTML');
  process.exit(1);
}

async function updateDataFile(count) {
  const today = new Date().toISOString().slice(0, 10);
  let records = [];

  if (fs.existsSync(DATA_FILE)) {
    try {
      records = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (!Array.isArray(records)) records = [];
    } catch(e) {
      records = [];
    }
  }

  const idx = records.findIndex(r => r.date === today);
  if (idx >= 0) {
    records[idx].total = count;
    console.log(`🔄 Aggiornato ${today}`);
  } else {
    records.push({ date: today, total: count });
    console.log(`➕ Aggiunto ${today}`);
  }

  records.sort((a, b) => a.date.localeCompare(b.date));
  fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2));
  console.log(`💾 Salvati ${records.length} record`);
}

(async () => {
  try {
    const count = await fetchPrimalVideoCount();
    await updateDataFile(count);
    console.log('✅ Completato!');
  } catch(err) {
    console.error('❌ Errore fatale:', err);
    process.exit(1);
  }
})();
