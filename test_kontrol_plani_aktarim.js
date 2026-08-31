// PL12 kontrol plani dosyasi ice aktarilinca ne oluyor?
// GERCEK handleUnifiedImport, GERCEK yardimci fonksiyonlar ve GERCEK
// Excel satirlariyla calistirilir.
//
// Bulunan hata: dosyanin basliklari ('Son Kalibrasyon', 'Kal. Firması',
// 'İzin Ver. Sapma') importer'in tanidigi adlar degildi. Uygulama KENDI
// disa aktardigi dosyayi bile geri alamiyordu: cihazlar geliyor, ama
// kayitlarin HICBIRI gelmiyordu ('Tarih' sutunu yok -> kayit uretilmiyor).
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync('C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/index.html', 'utf8');
const satirlar = JSON.parse(fs.readFileSync(__dirname + '/ankara_rows.json', 'utf8'));

function govdeAl(baslangic) {
    const i = src.indexOf(baslangic);
    assert(i > 0, baslangic + ' yok');
    let d = 0, b = false, k = i;
    for (; k < src.length; k++) {
        if (src[k] === '{') { d++; b = true; }
        else if (src[k] === '}') { d--; if (b && d === 0) { k++; break; } }
    }
    return src.slice(i, k + 1);
}
const CR = { COMPLIANT: 'Uygun', MARGINAL: 'Sınırda Uygun', NON_COMPLIANT: 'Uygun Değil' };
function gercek(ad) {
    let j = src.indexOf('const ' + ad + ' = ');
    if (j < 0) j = src.indexOf('function ' + ad + '(');
    assert(j > 0, ad + ' yok');
    let d = 0, b = false, m = j;
    for (; m < src.length; m++) {
        if (src[m] === '{') { d++; b = true; }
        else if (src[m] === '}') { d--; if (b && d === 0) { m++; break; } }
    }
    return new Function('CalibrationResult', src.slice(j, m) + '\nreturn ' + ad + ';')(CR);
}

function aktar(mevcutCihaz, mevcutKayit) {
    const sonuc = { cihaz: null, kayit: null, mesaj: [] };
    const ortam = {
        instruments: mevcutCihaz || [], calibrationRecords: mevcutKayit || [],
        setInstruments: v => { sonuc.cihaz = v; },
        setCalibrationRecords: v => { sonuc.kayit = v; },
        toastService: { info: m => sonuc.mesaj.push('info:' + m),
            success: m => sonuc.mesaj.push('ok:' + m), warning: m => sonuc.mesaj.push('uyari:' + m) },
        RecordType: { CALIBRATION: 'Kalibrasyon', VERIFICATION: 'Doğrulama' },
        CalibrationResult: CR,
        dateKeyOf: gercek('dateKeyOf'),
        calculateEffectiveDeviation: gercek('calculateEffectiveDeviation'),
        getCalibrationResult: gercek('getCalibrationResult'),
        generateSequentialId: gercek('generateSequentialId'),
        XLSX: { SSF: { parse_date_code: () => null } },
        console, String, Number, Object, Array, Date, Map, Set, JSON, Math, isNaN, parseInt, parseFloat
    };
    const F = new Function('__k', 'with (__k) {\n'
        + govdeAl('const handleUnifiedImport = (data) => {')
        + '\nreturn handleUnifiedImport;\n}')(
        new Proxy(ortam, { has: () => true, get: (t, p) => (p in t ? t[p] : function () {}) }));
    F(satirlar);
    return sonuc;
}

// 1) Bos uygulamaya aktarim: 27 cihaz + 27 KAYIT
{
    const r = aktar([], []);
    assert(/27 yeni cihaz/.test(r.mesaj.join(' ')), '1a: ' + r.mesaj.join(' '));
    assert.strictEqual(r.cihaz.length, 27, '1b: cihaz sayısı');
    assert.strictEqual(r.kayit.length, 27,
        '1c: kayıt sayısı ' + r.kayit.length + ' (başlık eşleşmesi bozulmuş olabilir)');
    console.log('✓ 1  27 cihaz ve 27 kayıt oluşuyor');
}

// 2) Kayit tipleri: 7 kalibrasyon + 20 dogrulama
{
    const r = aktar([], []);
    const tip = {};
    r.kayit.forEach(x => tip[x.recordType] = (tip[x.recordType] || 0) + 1);
    assert.strictEqual(tip['Kalibrasyon'], 7, '2a: kalibrasyon sayısı ' + tip['Kalibrasyon']);
    assert.strictEqual(tip['Doğrulama'], 20, '2b: doğrulama sayısı ' + tip['Doğrulama']);
    console.log('✓ 2  7 kalibrasyon + 20 doğrulama olarak ayrılıyor');
}

// 3) Alanlar dolu: tarih, firma, rapor no, sapma, sonuc
{
    const r = aktar([], []);
    assert.strictEqual(r.kayit.filter(x => !x.date).length, 0, '3a: tarihsiz kayıt var');
    assert.strictEqual(r.kayit.filter(x => !x.result).length, 0, '3b: sonuçsuz kayıt var');
    const kal = r.kayit.find(x => x.recordType === 'Kalibrasyon');
    assert.strictEqual(kal.date, '2026-07-17', '3c: tarih: ' + kal.date);
    assert.strictEqual(kal.calibratingCompany, 'ANKARA KALİBRASYON', '3d: firma boş');
    assert.strictEqual(kal.reportNumber, '0143K-0726-01126', '3e: rapor no');
    assert.strictEqual(kal.deviation, -0.004, '3f: sapma');
    assert.strictEqual(kal.result, 'Uygun', '3g: sonuç');
    console.log('✓ 3  tarih, firma, rapor no, sapma ve sonuç doluyor');
}

// 4) Cihaz alanlari: konum, izin verilen sapma, aralik
{
    const r = aktar([], []);
    const t = r.cihaz.find(c => c.serialNumber === '607134');
    assert.strictEqual(t.location, 'Ankara', '4a: konum');
    assert.strictEqual(t.permissibleDeviation, 0.1, '4b: izin verilen sapma (İzin Ver. Sapma)');
    assert.strictEqual(t.calibrationInterval, 12, '4c: kalibrasyon aralığı');
    assert.strictEqual(t.department, 'LABORATUVAR', '4d: departman');
    assert.strictEqual(t.unit, 'g', '4e: birim');
    assert.strictEqual(r.cihaz.filter(c => c.location === 'Ankara').length, 27, '4f: hepsi Ankara');
    console.log('✓ 4  konum, izin verilen sapma, aralık, departman, birim doluyor');
}

// 5) Her kayit KENDI cihazina bagli (kimlikler benzersiz)
{
    const r = aktar([], []);
    const idler = r.cihaz.map(c => c.id);
    assert.strictEqual(new Set(idler).size, idler.length, '5a: aynı id\'ye sahip cihaz var');
    assert.strictEqual(idler.filter(x => !x).length, 0, '5b: id\'si boş cihaz var');
    const sahipsiz = r.kayit.filter(x => !idler.includes(x.instrumentId));
    assert.strictEqual(sahipsiz.length, 0, '5c: sahipsiz kayıt: ' + sahipsiz.length);
    const terazi = r.cihaz.find(c => c.serialNumber === '607134');
    const kendi = r.kayit.filter(x => x.instrumentId === terazi.id);
    assert.strictEqual(kendi.length, 1, '5d: cihaza ' + kendi.length + ' kayıt bağlandı');
    assert.strictEqual(kendi[0].date, '2026-07-17', '5e: yanlış kayıt bağlanmış');
    console.log('✓ 5  kimlikler benzersiz, her kayıt kendi cihazına bağlı');
}

// 6) CERKEZKOY BOZULMUYOR: mevcut cihaz ve kayitlar aynen duruyor
{
    const cerkez = [
        { id: 'ÇC01', name: 'ÇELİK CETVEL/LABORATUVAR', serialNumber: '20244561',
          location: 'Çerkezköy', department: 'MESAFE ÖLÇÜMÜ', lastCalibrationDate: '2024-11-21' },
        { id: 'KUM02', name: 'MANUEL KUMPAS', serialNumber: '20244562',
          location: 'Çerkezköy', department: 'MESAFE ÖLÇÜMÜ', lastCalibrationDate: '2026-06-10' }
    ];
    const kayitlar = [{ id: 'eski1', instrumentId: 'ÇC01', date: '2024-11-21',
        recordType: 'Kalibrasyon', result: 'Uygun' }];
    const r = aktar(cerkez, kayitlar);

    cerkez.forEach(onceki => {
        const sonra = r.cihaz.find(c => c.id === onceki.id);
        assert(sonra, '6a: Çerkezköy cihazı kayboldu: ' + onceki.id);
        assert.deepStrictEqual(sonra, onceki, '6b: Çerkezköy cihazı DEĞİŞTİ: ' + onceki.id);
    });
    assert(r.kayit.some(x => x.id === 'eski1'), '6c: eski kayıt kayboldu');
    assert.strictEqual(r.cihaz.length, 2 + 27, '6d: toplam cihaz ' + r.cihaz.length);
    assert.strictEqual(r.kayit.length, 1 + 27, '6e: toplam kayıt ' + r.kayit.length);
    console.log('✓ 6  Çerkezköy cihaz ve kayıtları hiç değişmiyor, üstüne ekleniyor');
}

// 7) Ayni dosya IKINCI kez aktarilirsa cihaz cogalmaz
{
    const ilk = aktar([], []);
    const ikinci = aktar(ilk.cihaz, ilk.kayit);
    assert.strictEqual(ikinci.cihaz.length, 27,
        '7: ikinci aktarımda cihaz sayısı ' + ikinci.cihaz.length + ' (27 olmalı)');
    console.log('✓ 7  aynı dosya tekrar aktarılınca cihazlar çoğalmıyor (seri no ile eşleşiyor)');
}

console.log('\nTüm senaryolar geçti.');
