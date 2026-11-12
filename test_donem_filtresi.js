// Gosterge paneli donem suzgeci: kaynaktaki GERCEK islevlerle calistirilir.
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync('C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/index.html', 'utf8');
const al = ad => { const i = src.indexOf('function ' + ad + '('); return src.slice(i, src.indexOf('\n}', i) + 2); };
const F = new Function('CalibrationStatus', al('kayitTarihi') + '\n' + al('kayitDonemde') + '\n' + al('cihazDonemde') + '\nreturn { kayitTarihi, kayitDonemde, cihazDonemde };')({ OVERDUE: 'Gecikmiş', DUE_SOON: 'Yaklaşıyor', OK: 'Tamam' });
const bugun = new Date(2026, 10, 12);
assert.strictEqual(F.kayitDonemde('2025-03-01', ''), true, 'Tümü');
assert.strictEqual(F.kayitDonemde('2025-03-01', '2025'), true); assert.strictEqual(F.kayitDonemde('2025-03-01', '2026'), false);
assert.strictEqual(F.kayitDonemde('15.03.2026', '2026'), true, 'GG.AA.YYYY');
assert.strictEqual(F.kayitDonemde('2025-12-01', 'son12', bugun), true); assert.strictEqual(F.kayitDonemde('2025-11-01', 'son12', bugun), false);
assert.strictEqual(F.kayitDonemde('2027-01-01', 'son12', bugun), false, 'gelecek tarih son 12 aya girmez');
assert.strictEqual(F.kayitDonemde('', '2026'), false, 'tarihsiz kayıt yalnız Tümü');
assert.strictEqual(F.kayitDonemde('2026-02-30x', '2026'), true, 'tarih başı okunur');
// Konum suzgeci aynen duruyor, donem onun ustune ekleniyor; cihaz durumu donemle suzulmuyor
assert(/konum \? _tumKayitlar\.filter\(r => _kimlikler\.has\(r\.instrumentId\)\) : _tumKayitlar/.test(src), 'konum süzgeci');
assert(src.includes("donem ? _konumKayitlari.filter(r => kayitDonemde(r.date, donem)) : _konumKayitlari"), 'dönem kayıtlara uygulanır');
// Cihaz: o dönemde kaydı / planlı kalibrasyonu var; gecikmiş ve yaklaşan her dönemde görünür
const kayitli = new Set(['A1']);
assert.strictEqual(F.cihazDonemde({ id: 'A1', status: 'Tamam', nextCalibrationDate: '2027-03-01' }, '2025', kayitli), true, 'kaydı var');
assert.strictEqual(F.cihazDonemde({ id: 'A2', status: 'Tamam', nextCalibrationDate: '2027-03-01' }, '2027', kayitli), true, '2027 planlı');
assert.strictEqual(F.cihazDonemde({ id: 'A2', status: 'Tamam', nextCalibrationDate: '2027-03-01' }, '2025', kayitli), false);
assert.strictEqual(F.cihazDonemde({ id: 'A3', status: 'Gecikmiş', nextCalibrationDate: '2024-01-01' }, '2027', kayitli), true, 'gecikmiş gizlenmez');
assert.strictEqual(F.cihazDonemde({ id: 'A4', status: 'Tamam', nextCalibrationDate: 'N/A' }, '2025', kayitli), false);
assert.strictEqual(F.cihazDonemde({ id: 'A4', status: 'Tamam' }, '', kayitli), true, 'Tüm Dönemler');
// Ortak seçim: tek durum App'te, üç ekrana gidiyor; yıllara bu yıl + gelecek yıl hep eklenir
assert.strictEqual((src.match(/useLocalStorage\('panoDonem', ''\)/g) || []).length, 1, 'tek ortak durum');
assert.strictEqual((src.match(/\.\.\.donemOrtak/g) || []).length, 3, 'panel, Cihazlar, Tüm Kayıtlar');
assert(src.includes("new Set([String(y), String(y + 1)])"), 'gelecek yıl seçenekte');
assert(src.includes('cihazDonemde(instrument, seciliDonem, donemKayitliCihazlar)') && src.includes('kayitDonemde(r.date, seciliDonem)'), 'Cihazlar ve Tüm Kayıtlar süzülür');
assert((src.match(/donemSecenekleri\(donemYillari\)/g) || []).length === 3, 'üç ekranda seçici');
console.log('✔ dönem süzgeci: Tümü, yıl, son 12 ay, tarih biçimleri, konumla birlikte');
