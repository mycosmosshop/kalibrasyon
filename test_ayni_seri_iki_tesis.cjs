// Seri no tesis içinde benzersiz: Hendek 01 ve Veliköy 01 birbirini ezmez (etiket numarası = seri no, 25.11.2026).
// GERÇEK handleUnifiedImport ve raporEslestir ile.
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/index.html', 'utf8');
function govde(bas) {
    const j = src.indexOf(bas); assert(j >= 0, bas);
    let d = 0, b = false, k = j;
    for (; k < src.length; k++) { if (src[k] === '{') { d++; b = true; } else if (src[k] === '}') { d--; if (b && d === 0) { k++; break; } } }
    return src.slice(j, k);
}
const al = (ad) => { const j = src.indexOf('const ' + ad + ' = '); const s = src.slice(j); return s.slice(0, s.search(/;\r?\n/) + 1); };
const yard = al('_katla') + al('_rprAnahtar') + al('_seriAnahtar') + govde('const _seriSayi = ') + ';' + src.match(/function konumListesi.*/)[0] + ';';
const Y = new Function(yard + 'return {_katla,_rprAnahtar,_seriAnahtar,_seriSayi,konumListesi};')();
const H = ['Cihaz ID', 'Cihaz Adı', 'Seri No', 'Konum', 'Kayıt Tipi', 'Tarih', 'Zimmetli Personel'];
function aktar(satirlar, cihazlar, secenek) {
    const out = { cihaz: cihazlar, uyari: [] };
    const ortam = Object.assign({}, Y, {
        instruments: cihazlar, calibrationRecords: [], settings: { locations: ['Hendek', 'Veliköy'] },
        RecordType: { CALIBRATION: 'Kalibrasyon', VERIFICATION: 'Doğrulama' }, calculateEffectiveDeviation: (a, b) => a + b, getCalibrationResult: () => 'Uygun',
        generateSequentialId: p => 'SF' + String(p.length + 1).padStart(5, '0'), _excelGunu: d => d, dateKeyOf: d => d.toISOString().slice(0, 10),
        setInstruments: v => { out.cihaz = v; }, setCalibrationRecords: v => { out.kayit = v; },
        toastService: { error: t => out.uyari.push(t), info() {}, success() {}, warning: t => out.uyari.push(t) }, console: { log() {}, warn() {} },
        XLSX: { SSF: {} }, String, Number, Object, Array, Date, Map, Set, JSON, Math, isNaN, parseInt, parseFloat });
    new Function('__k', 'with (__k) {\n' + govde('const handleUnifiedImport = (data, sayfaAdi, secenek) => {') + '\nreturn handleUnifiedImport;\n}')(
        new Proxy(ortam, { has: () => true, get: (t, p) => (p in t ? t[p] : function () {}) }))([H].concat(satirlar), null, secenek);
    return out;
}
const M = [
    { id: 'SM-HEN-001', name: 'Şerit Metre', serialNumber: '01', location: 'Hendek', assignedPersonnel: 'H' },
    { id: 'SM-VEL-001', name: 'Şerit Metre', serialNumber: '01', location: 'Veliköy', assignedPersonnel: 'V' }];
const bul = (o, id) => o.cihaz.find(c => c.id === id);
for (const sira of [M, [M[1], M[0]]]) {
    let o = aktar([['', 'Şerit Metre', '01', 'Hendek', 'Doğrulama', '20.05.2027', 'YENİ']], sira);
    assert.strictEqual(o.cihaz.length, 2, 'yeni cihaz açılmamalı');
    assert.strictEqual(bul(o, 'SM-HEN-001').assignedPersonnel, 'YENİ'); assert.strictEqual(bul(o, 'SM-VEL-001').assignedPersonnel, 'V', 'öbür tesis ezildi');
    assert.deepStrictEqual(o.kayit.map(k => k.instrumentId), ['SM-HEN-001']);
    o = aktar([['', 'Şerit Metre', '01', '', 'Doğrulama', '20.05.2027', 'X']], sira);
    assert.deepStrictEqual(o.cihaz, sira, 'konumsuz belirsiz satır yazılmamalı'); assert.strictEqual(o.uyari.length, 1);
    // Şerit metre listesi: seri no etiketten, kimlik SM-VEL-001
    o = aktar([['SM-VEL-001', 'Şerit Metre', '01', 'Veliköy', 'Doğrulama', '17.12.2026', 'YENİ']], sira, { kaynak: 'seritmetre' });
    assert.strictEqual(o.cihaz.length, 2); assert.strictEqual(bul(o, 'SM-VEL-001').assignedPersonnel, 'YENİ'); assert.strictEqual(bul(o, 'SM-HEN-001').assignedPersonnel, 'H');
}
// Aynı dosyada iki tesisin 01'i iki ayrı yeni cihaz
let o = aktar([['', 'Şerit Metre', '01', 'Hendek', 'Doğrulama', '20.05.2027', 'H'], ['', 'Şerit Metre', '01', 'Veliköy', 'Doğrulama', '20.05.2027', 'V']], []);
assert.strictEqual(o.cihaz.length, 2); assert.strictEqual(o.kayit.length, 2);
// FR39 defteri: sekme adı SM-VEL-001 yalnız Veliköy 01'e bağlanır (seri no artık 01)
const E = new Function('RecordType', yard + govde('function raporEslestir(') + ';return raporEslestir;')({ VERIFICATION: 'Doğrulama' });
const K = M.map(c => ({ id: 'K-' + c.id, instrumentId: c.id, recordType: 'Doğrulama', date: '2026-06-17' }));
const r = E([{ ad: 'x.xlsx', sayfalar: [{ sayfa: 'SM-VEL-001', ad: 'ŞERİT METRE (VELİKÖY)', no: 1 }] }], K, M, true);
assert.deepStrictEqual(r[0].hedefler.map(h => h.kayitId), ['K-SM-VEL-001']);
assert(/baskaTesiste \? String\(s\.no\)\.padStart\(2, '0'\) : id/.test(src), 'içe aktarma seri noyu etiketten verir');
console.log('test_ayni_seri_iki_tesis: geçti');
