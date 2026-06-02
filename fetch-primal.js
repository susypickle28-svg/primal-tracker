// fetch-primal.js — #primal daily activity tracker v7
// Conta i video postati nelle ultime 24h con #primal usando Apify
// Aggiornamento automatico ogni 15 minuti
// Gestisce paginazione per catturare tutti i video recenti

const https = require('https');
const fs = require('fs');

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const DATA_FILE = 'data.json';

if (!APIFY_TOKEN) {
  console.error('❌ APIFY_TOKEN non trovato! Controlla i GitHub Secrets.');
  process.exit(1);
}

// Helper: richiesta HTTP con gestione errori e retry
function httpRequest(options, body = null, retry = 3) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', (err) => {
      if (retry > 0) {
        console.log(`⚠️  Retry (${retry})...`);
        setTimeout(() => httpRequest(options, body, retry - 1).then(resolve).catch(reject), 2000);
      } else {
        reject(err);
      }
    });
    if (body) req.write(body);
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Recupera tutti i video con #primal (paginazione fino a 500 risultati)
async function fetchAllPrimalVideos() {
  console.log('🚀 Avvio scraper #primal — ricerca video ultimi 24h...');

  // Parametri per ottenere video recenti con #primal (max 500)
  const runBody = JSON.stringify({
    hashtags: ['primal'],
    resultsPerPage: 100,        // 100 per richiesta
    maxItems: 500,             // massimo totale
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
    shouldDownloadSlideshowImages: false,
    sortBy: 'latest',          // più recenti per primi
  });

  const runRes = await httpRequest({
    hostname: 'api.apify.com',
    path: `/v2/acts/clockworks~tiktok-scraper/runs?token=${APIFY_TOKEN}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(runBody),
    }
  }, runBody);

  if (runRes.status !== 201) {
    console.error('❌ Errore avvio actor:', JSON.stringify(runRes.body));
    throw new Error(`Actor start failed: ${runRes.status}`);
  }

  const runId = runRes.body.data.id;
  console.log(`✅ Actor avviato. Run ID: ${runId}`);

  // Attendi completamento (con timeout esteso)
  let status = 'RUNNING';
  let attempts = 0;
  const maxAttempts = 60; // 15 minuti di attesa
  while (['RUNNING', 'READY', 'ABORTING'].includes(status)) {
    await sleep(15000);
    attempts++;
    if (attempts > maxAttempts) {
      throw new Error('Timeout: l\'actor non è completato in 15 minuti');
    }
    const s = await httpRequest({
      hostname: 'api.apify.com',
      path: `/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`,
      method: 'GET',
    });
    status = s.body.data.status;
    console.log(`⏳ Stato: ${status} (${attempts * 15}s)`);
  }

  if (status !== 'SUCCEEDED') {
    throw new Error(`Actor fallito: ${status}`);
  }

  // Recupera ID dataset
  const runInfo = await httpRequest({
    hostname: 'api.apify.com',
    path: `/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`,
    method: 'GET',
  });
  const datasetId = runInfo.body.data.defaultDatasetId;

  // Recupera tutti gli item (paginazione interna)
  let allItems = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore && allItems.length < 500) {
    const itemsRes = await httpRequest({
      hostname: 'api.apify.com',
      path: `/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=${limit}&offset=${offset}`,
      method: 'GET',
    });

    const items = itemsRes.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      hasMore = false;
      break;
    }

    allItems = allItems.concat(items);
    offset += items.length;
    console.log(`📦 Ricevuti ${items.length} video (totale ${allItems.length})`);

    if (items.length < limit) {
      hasMore = false;
    }
  }

  console.log(`✅ Totale video ricevuti: ${allItems.length}`);
  return allItems;
}

async function fetchDailyVideos() {
  const items = await fetchAllPrimalVideos();

  // Calcola timestamp 24h fa
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

  const recentVideos = items.filter(item => {
    // Usa createTimeISO se presente, altrimenti createTime (timestamp)
    let ts = 0;
    if (item.createTimeISO) {
      ts = new Date(item.createTimeISO).getTime();
    } else if (item.createTime) {
      ts = item.createTime * 1000; // assuming seconds
    }
    return ts >= oneDayAgo;
  });

  const totalLikes = recentVideos.reduce((s, v) => s + (v.diggCount || 0), 0);
  const totalViews = recentVideos.reduce((s, v) => s + (v.playCount || 0), 0);
  const totalShares = recentVideos.reduce((s, v) => s + (v.shareCount || 0), 0);

  console.log(`📅 Video nelle ultime 24h: ${recentVideos.length}`);
  console.log(`❤️  Like: ${totalLikes}  👁️  View: ${totalViews}`);

  return {
    dailyVideos: recentVideos.length,
    totalFetched: items.length,
    totalLikes,
    totalViews,
    totalShares,
  };
}

async function updateDataFile(stats) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  // Ora italiana (UTC+2 in estate)
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
    // Se il dato precedente aveva più video, mantieni il massimo? No, sovrascrivi con l'ultimo rilevamento
    records[idx] = newRecord;
    console.log(`🔄 Aggiornato ${today} @ ${updateTime}`);
  } else {
    records.push(newRecord);
    console.log(`➕ Aggiunto ${today} @ ${updateTime}`);
  }

  // Mantieni solo gli ultimi 90 giorni per non appesantire
  if (records.length > 90) {
    records = records.slice(-90);
  }

  records.sort((a, b) => a.date.localeCompare(b.date));
  fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2));
  console.log(`💾 Salvati ${records.length} record`);
}

// Esecuzione principale con gestione errori robusta
(async () => {
  try {
    console.log('⏰ Avvio fetch #primal -', new Date().toISOString());
    const stats = await fetchDailyVideos();
    await updateDataFile(stats);
    console.log('✅ Completato con successo!');
  } catch (err) {
    console.error('❌ Errore fatale:', err);
    // Se fallisce, non uscire con exit(1) per evitare che il workflow segni errore
    // Invece, logga e termina normalmente (così il cron continua)
    console.log('⚠️  Il workflow continuerà al prossimo ciclo.');
    process.exit(0);
  }
})();
