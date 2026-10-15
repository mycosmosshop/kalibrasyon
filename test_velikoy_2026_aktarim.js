// Veliköy 2026 sertifikalari ice aktarilinca: seri nosuz cihazlar (brulor
// gostergesi, dedektor mastari, kutle) 'Önceki Rapor No' ile 2025 kaydindan
// bulunur, YENI cihaz acilmaz; son kalibrasyon tarihi 2026'ya gecer.
// GERCEK handleUnifiedImport, GERCEK PL12 ve 2026 dosyasi ile.
const fs = require('fs'), assert = require('assert');
const XLSX = require(__dirname + '/xlsx.full.min.js');
const src = fs.readFileSync('C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/index.html', 'utf8');
// Kaynak dosyalar depoya KONMAZ (depo herkese acik).
const PL12 = 'C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/_yerel_test/pl12.xlsx';
const Y2026 = 'D:/Yazılım/kalibrasyon-velikoy-2026/Veliköy 2026 kalibrasyon - ERP aktarım.xlsx';
if (!fs.existsSync(PL12) || !fs.existsSync(Y2026)) { console.log('yerel dosyalar yok — test atlandı'); process.exit(0); }
const CR = { COMPLIANT: 'Uygun', MARGINAL: 'Sınırda Uygun', NON_COMPLIANT: 'Uygun Değil' };

function govde(bas, j) {
    let d = 0, b = false, k = j;
    for (; k < src.length; k++) {
        if (src[k] === '{') { d++; b = true; }
        else if (src[k] === '}') { d--; if (b && d === 0) { k++; break; } }
    }
    return src.slice(j, k);
}
function gercek(ad) {
    let j = src.indexOf('const ' + ad + ' = ');
    if (j < 0) j = src.indexOf('function ' + ad + '(');
    if (src.slice(j, j + 200).indexOf('=>') > 0 && src.slice(j, j + 200).indexOf('{') < 0) {
        const son = j + src.slice(j).search(/;\r?\n/) + 1;
        return new Function(src.slice(j, son) + '\nreturn ' + ad + ';')();
    }
    return new Function('CalibrationResult', govde(ad, j) + '\nreturn ' + ad + ';')(CR);
}
const ortamOrtak = {
    _katla: gercek('_katla'), _excelGunu: gercek('_excelGunu'), _rprAnahtar: gercek('_rprAnahtar'),
    dateKeyOf: gercek('dateKeyOf'), calculateEffectiveDeviation: gercek('calculateEffectiveDeviation'),
    getCalibrationResult: gercek('getCalibrationResult'), generateSequentialId: gercek('generateSequentialId'),
    RecordType: { CALIBRATION: 'Kalibrasyon', VERIFICATION: 'Doğrulama' }, CalibrationResult: CR,
    XLSX: { SSF: { parse_date_code: () => null } },
    String, Number, Object, Array, Date, Map, Set, JSON, Math, isNaN, parseInt, parseFloat
};
function aktar(dosya, mevcut, kayitlar) {
    const wb = XLSX.read(fs.readFileSync(dosya, 'binary'), { type: 'binary', cellDates: true });
    const ad = wb.SheetNames[0];
    const satirlar = XLSX.utils.sheet_to_json(wb.Sheets[ad], { header: 1 });
    const out = { cihaz: mevcut, kayit: kayitlar, uyari: [], hata: [] };
    const ortam = Object.assign({}, ortamOrtak, {
        instruments: mevcut, calibrationRecords: kayitlar,
        settings: { locations: ['Çerkezköy', 'Ankara', 'Veliköy'] },
        setInstruments: v => { out.cihaz = v; }, setCalibrationRecords: v => { out.kayit = v; },
        toastService: { error: t => out.hata.push(t), info: () => {}, success: () => {}, warning: t => out.uyari.push(t) },
        console: { log: () => {}, warn: () => {} }
    });
    const bas = 'const handleUnifiedImport = (data, sayfaAdi, secenek) => {';
    new Function('__k', 'with (__k) {\n' + govde(bas, src.indexOf(bas)) + '\nreturn handleUnifiedImport;\n}')(
        new Proxy(ortam, { has: () => true, get: (t, p) => (p in t ? t[p] : function () {}) }))(satirlar, ad);
    return out;
}

const y25 = aktar(PL12, [], []);
const r = aktar(Y2026, y25.cihaz, y25.kayit);
const kayit26 = r.kayit.filter(k => k.date && k.date.startsWith('2026'));
const cihazOf = rn => { const k = y25.kayit.find(x => x.reportNumber === rn); return r.cihaz.find(c => c.id === k.instrumentId); };
const kayitOf = rn => r.kayit.find(k => k.reportNumber === rn);

// 1) 28 kayit, yalniz gaussmetre yeni cihaz; atlanan satir yok
{
    assert.deepStrictEqual(r.hata, [], '1a: ' + r.hata[0]);
    assert.deepStrictEqual(r.uyari, [], '1b: ' + r.uyari[0]);
    assert.strictEqual(kayit26.length, 28, '1c: 2026 kayıt ' + kayit26.length);
    assert.strictEqual(r.cihaz.length, y25.cihaz.length + 1, '1d: cihaz ' + y25.cihaz.length + ' → ' + r.cihaz.length);
    const yeni = r.cihaz.filter(c => !y25.cihaz.some(e => e.id === c.id));
    assert(/MIKNATIS/.test(yeni[0].name) && yeni[0].location === 'Veliköy', '1e: ' + JSON.stringify(yeni[0]));
    console.log('✓ 1  28 kayıt; yeni cihaz yalnız mıknatıs (Veliköy)');
}
// 2) seri nosuz cihazlar dogru cihaza: Brülör 2 (AS25.01638) ve mastarlar
{
    assert.strictEqual(kayitOf('0152K-0626-00375').instrumentId, cihazOf('AS25.01638').id, '2a: Brülör 2');
    assert(/BRÜLÖR 2/.test(cihazOf('AS25.01638').name), '2b: ' + cihazOf('AS25.01638').name);
    assert.strictEqual(kayitOf('TK26.01796').instrumentId, cihazOf('TK25.00255').id, '2c: GES paslanmaz mastar');
    assert.strictEqual(kayitOf('TK26.01797').instrumentId, cihazOf('TK25.00256').id, '2d: GES non-ferro mastar');
    assert.strictEqual(kayitOf('0152K-0626-00372').instrumentId, cihazOf('AS25.01636').id, '2e: Kuleli terazi');
    console.log('✓ 2  seri nosuz cihazlar önceki rapor no ile doğru cihaza bağlandı');
}
// 3) cihaz adi / seri no degismedi, son kalibrasyon 2026 oldu (seri nosuz cihazda da)
{
    y25.cihaz.forEach(e => {
        const c = r.cihaz.find(x => x.id === e.id);
        assert.strictEqual(c.name, e.name, '3a: ad değişti ' + e.name);
        assert.strictEqual(String(c.serialNumber), String(e.serialNumber), '3b: seri değişti ' + e.serialNumber);
    });
    assert.strictEqual(cihazOf('TK25.00252').lastCalibrationDate, '2026-06-09', '3c: ESİT ' + cihazOf('TK25.00252').lastCalibrationDate);
    assert.strictEqual(cihazOf('AS25.01642').lastCalibrationDate, '2026-06-14', '3d: kumpas');
    assert.strictEqual(cihazOf('AS25.01643').lastCalibrationDate, '2025-07-14', '3e: kalibre edilmeyen mikrometre değişti');
    console.log('✓ 3  ad ve seri no korunuyor; son kalibrasyon 2026 (seri nosuzlarda da)');
}
// 4) sonuclar: 4 uygunsuz, kutleler M1 ile uygun
{
    const sonuc = rn => kayitOf(rn).result;
    assert.strictEqual(sonuc('0152K-0626-00375'), 'Uygun Değil', '4a: Brülör 2');
    assert.strictEqual(sonuc('0152K-0626-00377'), 'Uygun Değil', '4b: kumpas');
    assert.strictEqual(sonuc('0152K-0626-00381'), 'Uygun Değil', '4c: termohigrometre');
    assert.strictEqual(sonuc('0152K-0626-00374'), 'Uygun', '4d: Brülör 1');
    assert.strictEqual(sonuc('TK26.01803'), 'Uygun', '4e: 100 g kütle');
    assert.strictEqual(cihazOf('TK25.00262').permissibleDeviation, 0.005, '4f: 100 g sınırı');
    assert.strictEqual(sonuc('SAN2621731'), 'Uygun', '4g: mıknatıs');
    console.log('✓ 4  Brülör 2, kumpas, termohigrometre uygun değil; kütleler M1 ile uygun');
}
// 5) ayni dosya ikinci kez: hicbir sey eklenmez
{
    const r2 = aktar(Y2026, r.cihaz, r.kayit);
    assert.strictEqual(r2.kayit.length, r.kayit.length, '5a: kayıt ' + r.kayit.length + ' → ' + r2.kayit.length);
    assert.strictEqual(r2.cihaz.length, r.cihaz.length, '5b: cihaz ' + r.cihaz.length + ' → ' + r2.cihaz.length);
    console.log('✓ 5  dosya ikinci kez yüklenince kayıt/cihaz çoğalmıyor');
}
// 6) olmayan onceki rapor: satir atlanir, cihaz acilmaz
{
    const yok = r.kayit.map(k => k.reportNumber === 'TK25.00252' ? Object.assign({}, k, { reportNumber: 'XX' }) : k);
    const r3 = aktar(Y2026, y25.cihaz, yok.filter(k => !k.date.startsWith('2026')));
    assert.strictEqual(r3.cihaz.length, y25.cihaz.length + 1, '6a: cihaz açıldı');
    assert(r3.uyari.some(t => /TK25\.00252/.test(t)), '6b: uyarı yok');
    console.log('✓ 6  önceki rapor bulunamazsa satır atlanıyor, yeni cihaz açılmıyor');
}
console.log('\nTüm senaryolar geçti.');
