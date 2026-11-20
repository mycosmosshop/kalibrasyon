// kalibrasyon-sync.js güvenlik testi (20.11.2026): bulut okunamazken ya da okunmadan önce ESKİ yerel veri buluta yazılmamalı.
//   node test_senkron_guvenlik.cjs
const fs = require('fs'), assert = require('assert');
const KOD = fs.readFileSync(__dirname + '/kalibrasyon-sync.js', 'utf8');
const bekle = (ms) => new Promise(r => setTimeout(r, ms));

async function senaryo({ okuma, yerel, onceYaz }) {
  const depo = Object.assign({}, yerel), oturum = {}, yazilan = [];
  let yenilendi = 0;
  const localStorage = {
    get length() { return Object.keys(depo).length; }, key: (i) => Object.keys(depo)[i],
    getItem: (k) => (k in depo ? depo[k] : null), setItem: (k, v) => { depo[k] = String(v); }, removeItem: (k) => { delete depo[k]; },
  };
  const sessionStorage = { getItem: (k) => oturum[k] || null, setItem: (k, v) => { oturum[k] = v; }, removeItem: (k) => { delete oturum[k]; } };
  const sb = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => { await bekle(1700); return okuma; } }) }),   // okuma 1,7 sn sürsün
      upsert: (x) => { yazilan.push(x); return Promise.resolve({ error: null }); },
    }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  };
  const window = { supabase: { createClient: () => sb } };
  const document = { readyState: 'complete' };
  const location = { reload: () => { yenilendi++; } };
  new Function('window', 'localStorage', 'sessionStorage', 'document', 'location', 'console', KOD)
    (window, localStorage, sessionStorage, document, location, { log() {}, warn() {} });
  if (onceYaz) localStorage.setItem('instruments', onceYaz);    // React açılışta eski durumu yazar
  await bekle(2500);
  return { yazilan, yenilendi, depo, ls: localStorage };
}

(async () => {
  const ESKI = { instruments: '["eski"]', calibrationRecords: '[]', settings: '{}' };
  const YENI = { instruments: '["yeni"]', calibrationRecords: '[1]', settings: '{}' };

  // 1) bulut okunamadı -> hiçbir şey yazılmaz
  let s = await senaryo({ okuma: { data: null, error: { message: 'JWT expired' } }, yerel: ESKI, onceYaz: '["eski"]' });
  assert.strictEqual(s.yazilan.length, 0, 'okuma hatasında buluta yazıldı');

  // 2) bulut farklı, tarayıcıda eski veri -> eski veri yazılmaz, bulut uygulanır, sayfa yenilenir
  s = await senaryo({ okuma: { data: { data: YENI }, error: null }, yerel: ESKI, onceYaz: '["eski"]' });
  assert.strictEqual(s.yazilan.length, 0, 'eski yerel veri buluta yazıldı');
  assert.strictEqual(s.depo.instruments, '["yeni"]'); assert.strictEqual(s.yenilendi, 1);

  // 3) bulut ile yerel aynı -> hazır; sonraki düzenleme buluta gider
  s = await senaryo({ okuma: { data: { data: YENI }, error: null }, yerel: YENI });
  assert.strictEqual(s.yazilan.length, 0);
  s.ls.setItem('instruments', '["duzenlendi"]'); await bekle(1700);
  assert.strictEqual(s.yazilan.length, 1, 'normal düzenleme buluta gitmedi');
  assert.strictEqual(s.yazilan[0].data.instruments, '["duzenlendi"]');

  // 4) bulutta satır yok -> ilk yükleme yapılır
  s = await senaryo({ okuma: { data: null, error: null }, yerel: YENI });
  assert.strictEqual(s.yazilan.length, 1, 'ilk yükleme yapılmadı');

  console.log('test_senkron_guvenlik: 4 senaryo geçti');
})().catch(e => { console.error('BAŞARISIZ:', e.message); process.exit(1); });
