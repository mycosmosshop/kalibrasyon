// Tanınmayan dosya aktarilinca NE oldugu soylenmeli.
// Gercek olay: kullanici "veri bulunamadi" mesajini aliyordu ama hangi
// dosyanin/sutunun sorunlu oldugu anlasilmiyordu; ancak konsol
// gunlugunden ("Satir 2..14 atlandi") baslik satirinin hic bulunamadigi
// ve dosyanin beklenenden kucuk oldugu cikarilabildi.
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync('C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/index.html', 'utf8');
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
function aktar(data) {
    const m = { hata: [], bilgi: [], ok: [] };
    const ortam = {
        instruments: [], calibrationRecords: [], settings: { locations: [] },
        setInstruments: () => {}, setCalibrationRecords: () => {},
        toastService: { error: t => m.hata.push(t), info: t => m.bilgi.push(t),
            success: t => m.ok.push(t), warning: () => {} },
        RecordType: { CALIBRATION: 'Kalibrasyon', VERIFICATION: 'Doğrulama' },
        CalibrationResult: CR,
        dateKeyOf: gercek('dateKeyOf'),
        calculateEffectiveDeviation: gercek('calculateEffectiveDeviation'),
        getCalibrationResult: gercek('getCalibrationResult'),
        generateSequentialId: gercek('generateSequentialId'),
        XLSX: { SSF: { parse_date_code: () => null } },
        console: { warn: () => {}, log: () => {} },
        String, Number, Object, Array, Date, Map, Set, JSON, Math, isNaN, parseInt, parseFloat
    };
    new Function('__k', 'with (__k) {\n' + govdeAl('const handleUnifiedImport = (data, sayfaAdi) => {')
        + '\nreturn handleUnifiedImport;\n}')(
        new Proxy(ortam, { has: () => true, get: (t, p) => (p in t ? t[p] : function () {}) }))(data);
    return m;
}

// 1) Baslik satiri YOK -> net hata, ilk satiri gosterir
{
    const m = aktar([['Zimmet Listesi', null, 'Tarih'], ['1', 'Ali', '01.01.2026'], ['2', 'Veli', '']]);
    assert.strictEqual(m.hata.length, 1, '1a: hata verilmedi');
    assert(/Başlık satırı bulunamadı/.test(m.hata[0]), '1b');
    assert(/Zimmet Listesi/.test(m.hata[0]), '1c: okunan ilk satır gösterilmiyor');
    assert(/Cihaz Adı/.test(m.hata[0]), '1d: beklenen sütunlar yazılmıyor');
    assert.strictEqual(m.bilgi.length, 0, '1e: ayrıca belirsiz mesaj da veriliyor');
    console.log('✓ 1  başlık satırı yoksa "bu dosya kontrol planı değil" diyor + ilk satırı gösteriyor');
}

// 2) Baslik VAR ama satirlar bos -> sayilarla aciklar
{
    const m = aktar([['Cihaz Adı', 'Seri No', 'Bilinmeyen Sütun'], [null, null, 'x'], [null, null, 'y']]);
    assert.strictEqual(m.bilgi.length, 1, '2a');
    assert(/Başlık satırı: 1\. satır/.test(m.bilgi[0]), '2b: başlık satırı numarası yok');
    assert(/okunan veri satırı: 2/.test(m.bilgi[0]), '2c: satır sayısı yok');
    assert(/Tanınmayan sütunlar: Bilinmeyen Sütun/.test(m.bilgi[0]), '2d: tanınmayan sütun yazılmıyor');
    console.log('✓ 2  başlık varsa: hangi satır, kaç veri satırı, hangi sütun tanınmadı');
}

// 3) Gecerli dosyada teshis mesaji CIKMAZ
{
    const satirlar = JSON.parse(fs.readFileSync(__dirname + '/ankara_rows.json', 'utf8'));
    const m = aktar(satirlar);
    assert.strictEqual(m.hata.length, 0, '3a: geçerli dosyada hata verildi');
    assert.strictEqual(m.bilgi.length, 0, '3b: geçerli dosyada "bulunamadı" verildi');
    assert(/27 yeni cihaz/.test(m.ok.join(' ')), '3c: ' + m.ok.join(' '));
    console.log('✓ 3  geçerli kontrol planında teşhis mesajı çıkmıyor, aktarım yapılıyor');
}

console.log('\nTüm senaryolar geçti.');
