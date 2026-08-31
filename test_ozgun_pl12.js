// Sanifoam'in OZGUN PL12 formu ("PL 12- Kalibrasyon Takip Plani Ankara.xlsx",
// sayfa 'Ankara 2025') ice aktarilabiliyor mu?
//
// Bu form uygulamanin disa aktarma biciminden tamamen farkli basliklar
// kullaniyor (MAKİNA-BÖLÜM, SERİ NUMARASI, KABUL EDİLEN MAX. SAPMA...).
// Hicbiri taninmadigi icin 'Baslik satiri bulunamadi' hatasi aliniyordu.
const fs = require('fs'), assert = require('assert');
const XLSX = require(__dirname + '/xlsx.full.min.js');
const src = fs.readFileSync('C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/index.html', 'utf8');
const DOSYA = 'C:/Users/User/Desktop/PL 12- Kalibrasyon Takip Planı Ankara.xlsx';

const wb = XLSX.read(fs.readFileSync(DOSYA, 'binary'), { type: 'binary', cellDates: true });
const sayfaAdi = wb.SheetNames[0];
const satirlar = XLSX.utils.sheet_to_json(wb.Sheets[sayfaAdi], { header: 1 });

const CR = { COMPLIANT: 'Uygun', MARGINAL: 'Sınırda Uygun', NON_COMPLIANT: 'Uygun Değil' };
function govdeAl(bas) {
    const i = src.indexOf(bas); assert(i > 0, bas + ' yok');
    let d = 0, b = false, k = i;
    for (; k < src.length; k++) {
        if (src[k] === '{') { d++; b = true; }
        else if (src[k] === '}') { d--; if (b && d === 0) { k++; break; } }
    }
    return src.slice(i, k + 1);
}
function gercek(ad) {
    let j = src.indexOf('const ' + ad + ' = ');
    if (j < 0) j = src.indexOf('function ' + ad + '(');
    let d = 0, b = false, m = j;
    for (; m < src.length; m++) {
        if (src[m] === '{') { d++; b = true; }
        else if (src[m] === '}') { d--; if (b && d === 0) { m++; break; } }
    }
    return new Function('CalibrationResult', src.slice(j, m) + '\nreturn ' + ad + ';')(CR);
}
function aktar(mevcut, kayitlar, konumlar) {
    const out = { cihaz: null, kayit: null, hata: [], bilgi: [], ok: [], log: [] };
    const ortam = {
        instruments: mevcut || [], calibrationRecords: kayitlar || [],
        settings: { locations: konumlar || ['Çerkezköy', 'Ankara', 'Bursa'] },
        setInstruments: v => { out.cihaz = v; }, setCalibrationRecords: v => { out.kayit = v; },
        toastService: { error: t => out.hata.push(t), info: t => out.bilgi.push(t),
            success: t => out.ok.push(t), warning: () => {} },
        RecordType: { CALIBRATION: 'Kalibrasyon', VERIFICATION: 'Doğrulama' },
        CalibrationResult: CR,
        dateKeyOf: gercek('dateKeyOf'),
        calculateEffectiveDeviation: gercek('calculateEffectiveDeviation'),
        getCalibrationResult: gercek('getCalibrationResult'),
        generateSequentialId: gercek('generateSequentialId'),
        XLSX: { SSF: { parse_date_code: () => null } },
        console: { log: t => out.log.push(t), warn: () => {} },
        String, Number, Object, Array, Date, Map, Set, JSON, Math, isNaN, parseInt, parseFloat
    };
    new Function('__k', 'with (__k) {\n' + govdeAl('const handleUnifiedImport = (data, sayfaAdi) => {')
        + '\nreturn handleUnifiedImport;\n}')(
        new Proxy(ortam, { has: () => true, get: (t, p) => (p in t ? t[p] : function () {}) }))(satirlar, sayfaAdi);
    return out;
}

// 1) Artik "baslik bulunamadi" HATASI VERMIYOR
{
    const r = aktar([], []);
    assert.strictEqual(r.hata.length, 0, '1a: hâlâ hata veriyor: ' + r.hata[0]);
    assert.strictEqual(r.bilgi.length, 0, '1b: "veri bulunamadı" veriyor: ' + r.bilgi[0]);
    assert(/yeni cihaz/.test(r.ok.join(' ')), '1c: ' + r.ok.join(' '));
    console.log('✓ 1  özgün PL12 formu tanınıyor — ' + r.ok[0].trim());
}

// 2) Cihaz sayisi ve alanlari
{
    const r = aktar([], []);
    assert(r.cihaz.length >= 7, '2a: cihaz sayısı ' + r.cihaz.length);
    const kum = r.cihaz.find(c => String(c.serialNumber) === '37180517306');
    assert(kum, '2b: kumpas bulunamadı');
    assert(/KUMPAS/i.test(kum.name), '2c: ad (MAKİNA-BÖLÜM): ' + kum.name);
    assert.strictEqual(kum.department, 'MESAFE ÖLÇÜMÜ', '2d: departman (İŞLEV)');
    assert.strictEqual(kum.measurementRange, '0-150 mm', '2e: ölçüm aralığı');
    assert.strictEqual(kum.unit, 'mm', '2f: birim');
    console.log('✓ 2  ad, departman, seri no, aralık ve birim doğru eşleşiyor');
}

// 3) '1 YIL' -> 12 ay, '2 YIL' -> 24 ay
{
    const r = aktar([], []);
    const kum = r.cihaz.find(c => String(c.serialNumber) === '37180517306');
    assert.strictEqual(kum.calibrationInterval, 12, '3a: 1 YIL -> ' + kum.calibrationInterval);
    const cetvel = r.cihaz.find(c => /ÇELİK CETVEL/i.test(String(c.name)));
    assert(cetvel, '3b: çelik cetvel yok');
    assert.strictEqual(cetvel.calibrationInterval, 24, '3c: 2 YIL -> ' + cetvel.calibrationInterval);
    console.log('✓ 3  "1 YIL"/"2 YIL" 12/24 aya çevriliyor');
}

// 4) '± 0,05mm' -> 0.05
{
    const r = aktar([], []);
    const kum = r.cihaz.find(c => String(c.serialNumber) === '37180517306');
    assert.strictEqual(kum.permissibleDeviation, 0.05,
        '4: "± 0,05mm" -> ' + kum.permissibleDeviation);
    console.log('✓ 4  "± 0,05mm" sayıya çevriliyor (0.05)');
}

// 5) Konum SAYFA ADINDAN cikariliyor ('Ankara 2025' -> Ankara)
{
    const r = aktar([], []);
    const ankara = r.cihaz.filter(c => c.location === 'Ankara');
    assert.strictEqual(ankara.length, r.cihaz.length,
        '5a: konumu Ankara olmayan cihaz var (' + (r.cihaz.length - ankara.length) + ')');
    console.log('✓ 5  konum sayfa adından çıkarılıyor: "' + sayfaAdi + '" → Ankara');
}

// 6) Bilinmeyen sayfa adinda konum UYDURULMUYOR
{
    const eski = satirlar;
    const out = { cihaz: null };
    // sayfa adi listede yoksa konum bos kalmali
    const r2 = (function () {
        const kayit = aktar([], [], ['Çerkezköy', 'Bursa']);   // Ankara listede YOK
        return kayit;
    })();
    assert(r2.cihaz.every(c => !c.location),
        '6: listede olmayan sayfa adından konum uydurulmuş');
    console.log('✓ 6  sayfa adı konum listesinde yoksa konum boş bırakılıyor');
}

// 7) Kayitlar da olusuyor (tarih ONCEKI KALIBRASYON'dan)
{
    const r = aktar([], []);
    assert(r.kayit.length >= 7, '7a: kayıt sayısı ' + r.kayit.length);
    assert.strictEqual(r.kayit.filter(x => !x.date).length, 0, '7b: tarihsiz kayıt');
    const k = r.kayit[0];
    assert(/^\d{4}-\d{2}-\d{2}$/.test(k.date), '7c: tarih biçimi: ' + k.date);
    assert(/Ankara Kalibrasyon/i.test(k.calibratingCompany), '7d: firma: ' + k.calibratingCompany);
    console.log('✓ 7  kayıtlar oluşuyor (tarih ÖNCEKİ KALİBRASYON, firma dolu)');
}

// 8) CERKEZKOY BOZULMUYOR
{
    const cerkez = [{ id: 'ÇC01', name: 'ÇELİK CETVEL/LABORATUVAR', serialNumber: '20244561',
        location: 'Çerkezköy', lastCalibrationDate: '2024-11-21' }];
    const r = aktar(cerkez, [{ id: 'e1', instrumentId: 'ÇC01', date: '2024-11-21',
        recordType: 'Kalibrasyon', result: 'Uygun' }]);
    const sonra = r.cihaz.find(c => c.id === 'ÇC01');
    assert.deepStrictEqual(sonra, cerkez[0], '8a: Çerkezköy cihazı değişti');
    assert(r.kayit.some(x => x.id === 'e1'), '8b: eski kayıt kayboldu');
    console.log('✓ 8  Çerkezköy cihaz ve kaydı birebir korunuyor');
}

console.log('\nTüm senaryolar geçti.');
