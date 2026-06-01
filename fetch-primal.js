// fetch-primal.js
// Eseguito ogni notte da GitHub Actions
// Legge il conteggio di #primal da TikTok via Apify e aggiorna data.json

const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const fs = require('fs');

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const HASHTAG = 'primal';
const DATA_FILE = 'data.json';

async function runApifyActor() {
  console.log(`🚀 Avvio scraper TikTok per #${HASHTAG}...`);

  // Avvia l'actor Apify per TikTok hashtag
  const runRes = await fetch(
    `https://api.apify.com/v2/acts/clockworks~tiktok-hashtag-scraper/runs?token=${APIFY_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hashtags: [HASHTAG],
        resultsPerPage: 1,        // ci basta solo il conteggio totale
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
      })
    }
  );

  if (!runRes.ok) {
    throw new Error(`Errore avvio actor: ${runRes.status} ${await runRes.text()}`);
  }

  const runData = await runRes.json();
  const runId = runData.data.id;
  console.log(`✅ Actor avviato. Run ID: ${runId}`);

  // Aspetta che finisca (polling ogni 10 secondi, max 3 minuti)
  let status = 'RUNNING';
  let attempts = 0;
  while (status === 'RUNNING' || status === 'READY') {
    await new Promise(r => setTimeout(r, 10000));
    attempts++;
    if (attempts > 18) throw new Error('Timeout: actor ci ha messo troppo');

    const statusRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
    );
    const statusData = await statusRes.json();
    status = statusData.data.status;
    console.log(`⏳ Stato: ${status} (tentativo ${attempts})`);
  }

  if (status !== 'SUCCEEDED') {
    throw new Error(`Actor fallito con stato: ${status}`);
  }

  // Leggi i risultati dal dataset
  const datasetId = (await (await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
  )).json()).data.defaultDatasetId;

  const itemsRes = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=1`
  );
  const items = await itemsRes.json();

  if (!items || items.length === 0) {
    throw new Error('Nessun risultato dal dataset');
  }

  // Estrai il conteggio totale dei post
  const item = items[0];
  console.log('📦 Risposta Apify:', JSON.stringify(item, null, 2));

  // Il campo può variare — proviamo i più comuni
  const postCount =
    item.videoCount ||
    item.postsCount ||
    item.stats?.videoCount ||
    item.challengeInfo?.stats?.videoCount ||
    item.hashtagInfo?.stats?.videoCount ||
    null;

  if (!postCount) {
    throw new Error('Non riesco a trovare il conteggio dei post nella risposta');
  }

  console.log(`🎯 Post totali #${HASHTAG}: ${postCount}`);
  return postCount;
}

async function updateDataFile(count) {
  const today = new Date().toISOString().slice(0, 10);

  // Leggi il file esistente o crea da zero
  let records = [];
  if (fs.existsSync(DATA_FILE)) {
    try {
      records = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch(e) {
      console.warn('⚠️ data.json corrotto, ricreo da zero');
      records = [];
    }
  }

  // Aggiorna o aggiungi il dato di oggi
  const existing = records.findIndex(r => r.date === today);
  if (existing >= 0) {
    records[existing].total = count;
    console.log(`🔄 Aggiornato dato di oggi (${today})`);
  } else {
    records.push({ date: today, total: count });
    console.log(`➕ Aggiunto nuovo record per ${today}`);
  }

  // Ordina per data
  records.sort((a, b) => a.date.localeCompare(b.date));

  // Salva
  fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2));
  console.log(`💾 data.json salvato con ${records.length} record`);
}

// Main
(async () => {
  try {
    const count = await runApifyActor();
    await updateDataFile(count);
    console.log('✅ Tutto fatto!');
  } catch(err) {
    console.error('❌ Errore:', err.message);
    process.exit(1);
  }
})();
