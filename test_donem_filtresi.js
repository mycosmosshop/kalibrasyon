// Gosterge paneli donem suzgeci: kaynaktaki GERCEK islevlerle calistirilir.
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync('C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/index.html', 'utf8');
const al = ad => { const i = src.indexOf('function ' + ad + '('); return src.slice(i, src.indexOf('\n}', i) + 2); };
const F = new Function(al('kayitTarihi') + '\n' + al('kayitDonemde') + '\nreturn { kayitTarihi, kayitDonemde };')();
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
assert(!/instrumentsWithStatus = useMemo\([^;]*donem/.test(src), 'cihaz durumu dönemle süzülmez');
assert(src.includes("useLocalStorage('panoDonem', '')") && src.includes('"📅 Tümü"'), 'seçici ve Tümü');
console.log('✔ dönem süzgeci: Tümü, yıl, son 12 ay, tarih biçimleri, konumla birlikte');
