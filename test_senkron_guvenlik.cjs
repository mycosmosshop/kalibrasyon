// kalibrasyon-sync.js güvenlik testi (20.11.2026): bulut okunamazken ya da okunmadan önce ESKİ yerel veri buluta yazılmamalı.
//   node test_senkron_guvenlik.cjs
const fs = require('fs'), assert = require('assert');
const KOD = fs.readFileSync(__dirname + '/kalibrasyon-sync.js', 'utf8');
const bekle = (ms) => new Promise(r => setTimeout(r, ms));

async function senaryo({ okuma, yerel, onceYaz, bekleme, kota }) {
  const depo = Object.assign({}, yerel), oturum = {}, yazilan = [];
  let yenilendi = 0, tazele = 0, sira = 0;
  const localStorage = {
    get length() { return Object.keys(depo).length; }, key: (i) => Object.keys(depo)[i],
    getItem: (k) => (k in depo ? depo[k] : null), removeItem: (k) => { delete depo[k]; },
    setItem: (k, v) => { const top = Object.entries(depo).reduce((t, [a, b]) => t + (a === k ? 0 : b.length), 0); if (kota && top + String(v).length > kota) { const e = new Error('exceeded the quota'); e.name = 'QuotaExceededError'; throw e; } depo[k] = String(v); },
  };
  const sessionStorage = { getItem: (k) => oturum[k] || null, setItem: (k, v) => { oturum[k] = v; }, removeItem: (k) => { delete oturum[k]; } };
  const sb = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }), refreshSession: async () => { tazele++; return { data: { session: { user: { id: 'u1' } } } }; } },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => { await bekle(1700); return Array.isArray(okuma) ? okuma[Math.min(sira++, okuma.length - 1)] : okuma; } }) }),   // okuma 1,7 sn; dizi = sırayla cevaplar
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
  await bekle(bekleme || 2500);
  return { yazilan, yenilendi, depo, ls: localStorage, tazele, oturum };
}

(async () => {
  const ESKI = { instruments: '["eski"]', calibrationRecords: '[]', settings: '{}' };
  const YENI = { instruments: '["yeni"]', calibrationRecords: '[1]', settings: '{}' };

  // 1) bulut okunamadı -> hiçbir şey yazılmaz
  let s = await senaryo({ okuma: { data: null, error: { message: 'JWT expired' } }, yerel: ESKI, onceYaz: '["eski"]' });
  assert.strictEqual(s.yazilan.length, 0, 'okuma hatasında buluta yazıldı');

  // 1b) ilk okuma hata, oturum tazelenince okunur -> bulut uygulanır, eski veri yazılmaz
  s = await senaryo({ okuma: [{ data: null, error: { message: 'JWT expired' } }, { data: { data: YENI }, error: null }], yerel: ESKI, onceYaz: '["eski"]', bekleme: 6000 });
  assert.strictEqual(s.yazilan.length, 0); assert.ok(s.tazele >= 1, 'oturum tazelenmedi');
  assert.strictEqual(s.depo.instruments, '["yeni"]'); assert.strictEqual(s.yenilendi, 1);

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

  // 5) tarayıcı hafızası dolu: güncel veri sekme hafızasında tutulur, okununca güncel döner, buluta eksik yazılmaz
  const DOLU = { instruments: '["eski"]', calibrationRecords: '[0]', settings: '{}', baska_modul: 'x'.repeat(40) };
  const BUYUK = { instruments: '["yeni"]', calibrationRecords: '[' + '1,'.repeat(30) + '1]', settings: '{}' };
  s = await senaryo({ okuma: { data: { data: BUYUK }, error: null }, yerel: DOLU, kota: 70 });
  assert.strictEqual(s.ls.getItem('calibrationRecords'), BUYUK.calibrationRecords, 'güncel veri okunamıyor');
  assert.strictEqual(s.depo.baska_modul.length, 40, 'başka modülün verisi silindi');
  assert.strictEqual(s.yazilan.length, 0); assert.strictEqual(s.yenilendi, 1);

  // 4) bulutta satır yok -> ilk yükleme yapılır
  s = await senaryo({ okuma: { data: null, error: null }, yerel: YENI });
  assert.strictEqual(s.yazilan.length, 1, 'ilk yükleme yapılmadı');

  console.log('test_senkron_guvenlik: 6 senaryo geçti');
})().catch(e => { console.error('BAŞARISIZ:', e.message); process.exit(1); });
