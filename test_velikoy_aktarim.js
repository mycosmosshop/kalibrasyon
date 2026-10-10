// Veliköy PL12 kontrol plani ice aktarilinca: cihazlar Veliköy'e duser,
// sertifika no (KALİBRASYON KODU) kayda gelir, BASKA tesisteki ayni seri
// numarali cihaz EZILMEZ. GERCEK handleUnifiedImport ve GERCEK dosya ile.
const fs = require('fs'), assert = require('assert');
const XLSX = require(__dirname + '/xlsx.full.min.js');
const src = fs.readFileSync('C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/index.html', 'utf8');
// Kaynak dosyalar depoya KONMAZ (depo herkese acik): git disi _yerel_test klasorunde.
// pl12.xlsx = Veliköy 'PL12- Kalibrasyon 2026.xlsx', fr72.xlsx = 'ŞERİT METRE ZİMMET TAKİP LİSTESİ GÜNCEL.xlsx'
const YT = 'C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/_yerel_test/';
const DOSYA = YT + 'pl12.xlsx', FR72 = YT + 'fr72.xlsx';
if (!fs.existsSync(DOSYA) || !fs.existsSync(FR72)) { console.log('_yerel_test dosyaları yok — test atlandı'); process.exit(0); }

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
    if (src.slice(j, j + 200).indexOf('=>') > 0 && src.slice(j, j + 200).indexOf('{') < 0) {
        const son = j + src.slice(j).search(/;\r?\n/) + 1;   // dosya CRLF olabilir
        return new Function(src.slice(j, son) + '\nreturn ' + ad + ';')();
    }
    let d = 0, b = false, m = j;
    for (; m < src.length; m++) {
        if (src[m] === '{') { d++; b = true; }
        else if (src[m] === '}') { d--; if (b && d === 0) { m++; break; } }
    }
    return new Function('CalibrationResult', src.slice(j, m) + '\nreturn ' + ad + ';')(CR);
}
const _katla = gercek('_katla');
const _excelGunu = gercek('_excelGunu');
function aktar(mevcut, kayitlar) {
    const out = { cihaz: null, kayit: null, hata: [], ok: [], uyari: [] };
    const ortam = {
        instruments: mevcut || [], calibrationRecords: kayitlar || [],
        settings: { locations: ['Çerkezköy', 'Ankara', 'Eskişehir', 'Sakarya', 'Adana', 'Bursa', 'Veliköy'] },
        setInstruments: v => { out.cihaz = v; }, setCalibrationRecords: v => { out.kayit = v; },
        toastService: { error: t => out.hata.push(t), info: () => {}, success: t => out.ok.push(t), warning: () => {} },
        RecordType: { CALIBRATION: 'Kalibrasyon', VERIFICATION: 'Doğrulama' },
        CalibrationResult: CR, _katla, _excelGunu,
        dateKeyOf: gercek('dateKeyOf'),
        calculateEffectiveDeviation: gercek('calculateEffectiveDeviation'),
        getCalibrationResult: gercek('getCalibrationResult'),
        generateSequentialId: gercek('generateSequentialId'),
        XLSX: { SSF: { parse_date_code: () => null } },
        console: { log: () => {}, warn: t => out.uyari.push(t) },
        String, Number, Object, Array, Date, Map, Set, JSON, Math, isNaN, parseInt, parseFloat
    };
    new Function('__k', 'with (__k) {\n' + govdeAl('const handleUnifiedImport = (data, sayfaAdi, secenek) => {')
        + '\nreturn handleUnifiedImport;\n}')(
        new Proxy(ortam, { has: () => true, get: (t, p) => (p in t ? t[p] : function () {}) }))(satirlar, sayfaAdi);
    return out;
}

// 1) 32 cihaz, hepsi Veliköy (sayfa adi 'Veliköy 2025')
{
    const r = aktar([], []);
    assert.strictEqual(r.hata.length, 0, '1a: ' + r.hata[0]);
    assert.strictEqual(r.cihaz.length, 32, '1b: cihaz sayısı ' + r.cihaz.length);
    assert(r.cihaz.every(c => c.location === 'Veliköy'), '1c: konumu Veliköy olmayan cihaz var');
    console.log('✓ 1  32 cihaz, hepsi Veliköy');
}

// 2) Her cihaza bir kalibrasyon kaydi; sertifika no ve firma dolu
{
    const r = aktar([], []);
    assert.strictEqual(r.kayit.length, 32, '2a: kayıt sayısı ' + r.kayit.length);
    const ter = r.cihaz.find(c => String(c.serialNumber) === 'HSAL201700061');
    const k = r.kayit.find(x => x.instrumentId === ter.id);
    assert.strictEqual(k.reportNumber, 'AS25.01634', '2b: sertifika no: ' + k.reportNumber);
    assert.strictEqual(k.date, '2025-07-10', '2c: tarih: ' + k.date);
    assert.strictEqual(k.calibratingCompany, 'TÜDAN', '2d: firma: ' + k.calibratingCompany);
    assert(r.kayit.every(x => x.reportNumber), '2e: sertifika nosu boş kayıt var');
    console.log('✓ 2  32 kalibrasyon kaydı, sertifika no (AS25/TK25) ve firma dolu');
}

// 3) Cam termometre UYGUN DEGIL cikar (|−4,33| + 1,2 > 2 °C)
{
    const r = aktar([], []);
    const cam = r.cihaz.find(c => /CAM TERMOMETRE/.test(c.name));
    const k = r.kayit.find(x => x.instrumentId === cam.id);
    assert.strictEqual(k.result, 'Uygun Değil', '3: ' + k.result);
    console.log('✓ 3  cam termometre "Uygun Değil" (kaynakta da UYGUN DEĞİL)');
}

// 4) Ayni seri no ANKARA'da varsa Ankara cihazi EZILMEZ, Veliköy'e ayri cihaz acilir
{
    const ankara = { id: 'SF00007', name: 'HASSAS TERAZİ', serialNumber: 'HSAL201700061',
        location: 'Ankara', lastCalibrationDate: '2026-07-17' };
    const cerkez = { id: 'ÇC01', name: 'ÇELİK CETVEL/LABORATUVAR', serialNumber: '20244561',
        location: 'Çerkezköy', lastCalibrationDate: '2024-11-21' };
    const eskiKayit = { id: 'e1', instrumentId: 'SF00007', date: '2026-07-17', recordType: 'Kalibrasyon', result: 'Uygun' };
    const r = aktar([ankara, cerkez], [eskiKayit]);
    assert.deepStrictEqual(r.cihaz.find(c => c.id === 'SF00007'), ankara, '4a: Ankara cihazı değişti');
    assert.deepStrictEqual(r.cihaz.find(c => c.id === 'ÇC01'), cerkez, '4b: Çerkezköy cihazı değişti');
    const vel = r.cihaz.filter(c => String(c.serialNumber) === 'HSAL201700061' && c.location === 'Veliköy');
    assert.strictEqual(vel.length, 1, '4c: Veliköy terazisi açılmadı');
    assert.strictEqual(r.cihaz.length, 34, '4d: toplam ' + r.cihaz.length);
    assert(r.kayit.some(x => x.id === 'e1' && x.instrumentId === 'SF00007'), '4e: Ankara kaydı kayboldu');
    assert(r.kayit.filter(x => x.instrumentId === 'SF00007').length === 1, '4f: Ankara cihazına Veliköy kaydı eklendi');
    console.log('✓ 4  aynı seri no Ankara\'da: Ankara ve Çerkezköy birebir korunuyor, Veliköy ayrı cihaz');
}

// 5) FR72 zimmet listesi: tarihler "6/17/26" bicimli hucreler; 28 satirin hepsi okunur
{
    const bas = src.indexOf('const SM_SUTUN = ['), son = src.indexOf('const DataImportModal');
    const smAyristir = new Function('XLSX', '_katla', '_excelGunu', src.slice(bas, son) + '\nreturn smAyristir;')(XLSX, _katla, _excelGunu);
    const wb2 = XLSX.read(fs.readFileSync(FR72, 'binary'), { type: 'binary', cellDates: true });
    const r = smAyristir(wb2);
    assert(!r.hata, '5a: ' + r.hata);
    assert.strictEqual(r.satirlar.length, 28, '5b: okunan ' + r.satirlar.length + ', atlanan ' + JSON.stringify(r.atlanan.slice(0, 2)));
    const d = r.satirlar[0].dogrulama;
    assert.deepStrictEqual([d.getFullYear(), d.getMonth() + 1, d.getDate()], [2026, 6, 17], '5c: tarih ' + d);
    assert.strictEqual(r.satirlar[0].ay, 7, '5d: 1 nolu aralık ' + r.satirlar[0].ay);
    assert.strictEqual(r.satirlar[4].ay, 6, '5e: 5 nolu aralık ' + r.satirlar[4].ay);
    assert.strictEqual(r.satirlar[2].sorumlu, 'Ceren KAHRAMAN DALGIÇ', '5f: ' + r.satirlar[2].sorumlu);
    console.log('✓ 5  FR72: 28 şerit metre, doğrulama 17.06.2026, aralık 6/7 ay, zimmetli personel doğru');
}

// 6) SheetJS 0.18.5 (tarayici) tarihi bir onceki gun 23:59:04 veriyor -> dogru gune yuvarlanir
{
    const k = d => [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()];
    assert.deepStrictEqual(k(_excelGunu(new Date(2025, 6, 9, 23, 59, 4))), [2025, 7, 10, 0], '6a: 23:59:04 yuvarlanmadı');
    assert.deepStrictEqual(k(_excelGunu(new Date(2025, 6, 10, 0, 0, 0))), [2025, 7, 10, 0], '6b: doğru tarih bozuldu');
    assert.deepStrictEqual(k(_excelGunu(new Date(2025, 6, 10, 0, 0, 56))), [2025, 7, 10, 0], '6c: 00:00:56 bozuldu');
    console.log('✓ 6  tarayıcıdaki 23:59:04 kayması doğru güne yuvarlanıyor');
}

console.log('\nTüm senaryolar geçti.');
