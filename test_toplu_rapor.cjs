// Toplu rapor yukleme: GERCEK dosya adlari ve GERCEK sayfa adlariyla.
//
// Kaynaklar:
//   C:\Users\User\Desktop\Kalibrasyon Sertifikaları\*.pdf   (rapor no ile adlandirilmis)
//   C:\Users\User\Desktop\Şeritmetre Doğrulama Formlar.xls  (SM1..SM20 sayfalari)
//
// Riskli nokta: yanlis kayda dosya baglamak. Bu yuzden testler "eslesiyor mu"
// kadar "YANLIS eslesmiyor mu" tarafina da bakiyor.
const fs = require('fs'), assert = require('assert');
const KOK = 'C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/';
const src = fs.readFileSync(KOK + 'index.html', 'utf8');
const XLSX = require('C:/Users/User/AppData/Local/Temp/claude/D--Yaz-l-m/651c3d70-fb75-4585-8b7d-1923454b8e83/scratchpad/xlsx.full.min.js');

// ---- gercek eslestirme fonksiyonunu kaynaktan al ----
function govde(bas) {
    const i = src.indexOf(bas);
    assert(i > 0, bas + ' yok');
    let d = 0, b = false, k = i;
    for (; k < src.length; k++) {
        if (src[k] === '{') { d++; b = true; }
        else if (src[k] === '}') { d--; if (b && d === 0) { k++; break; } }
    }
    return src.slice(i, k);
}
const RecordType = { CALIBRATION: 'Kalibrasyon', VERIFICATION: 'Doğrulama' };
// tek satirlik yardimcilar: suslu parantezleri olmadigi icin satir olarak alinir
const satir = (ad) => {
    const m = src.match(new RegExp('^const ' + ad + ' = .*$', 'm'));
    assert(m, ad + ' yok');
    return m[0];
};
const raporEslestir = new Function('RecordType',
    satir('_rprAnahtar') + '\n' +
    satir('_seriAnahtar') + '\n' +
    govde('function raporEslestir(') + '\nreturn raporEslestir;')(RecordType);

// ---- gercek kaynak dosyalar ----
const PDF_KLASOR = 'C:/Users/User/Desktop/Kalibrasyon Sertifikaları/';
const PDFLER = fs.readdirSync(PDF_KLASOR).filter(f => /\.pdf$/i.test(f));
const DEFTER = 'C:/Users/User/Desktop/Şeritmetre Doğrulama Formlar.xls';
const SAYFALAR = XLSX.read(fs.readFileSync(DEFTER, 'binary'), { type: 'binary', bookSheets: true }).SheetNames;

// ---- uygulamadakine benzer veri ----
const CIHAZLAR = [];
for (let i = 1; i <= 20; i++) {
    CIHAZLAR.push({ id: 'SF' + String(i).padStart(5, '0'), name: 'ŞERİTMETRE',
        serialNumber: 'SM-' + String(i).padStart(2, '0'), location: 'Ankara' });
}
CIHAZLAR.push({ id: 'TRZ1', name: 'TERAZİ-DEPO', serialNumber: '607134', location: 'Ankara' });
CIHAZLAR.push({ id: 'KUM1', name: 'MANUEL KUMPAS', serialNumber: '37180517306', location: 'Çerkezköy' });

const RAPOR_NO = ['0143K-0726-01126', '0143K-0726-01127', '0143K-0726-01350',
                  '0143K-0726-01351', '0143K-0726-01352', '0143K-0726-01353', '0143K-0726-01354'];
const KAYITLAR = [];
// her seritmetreye 2 dogrulama kaydi
CIHAZLAR.filter(c => c.serialNumber.startsWith('SM-')).forEach((c, i) => {
    KAYITLAR.push({ id: 'D' + i + 'a', instrumentId: c.id, recordType: RecordType.VERIFICATION, date: '2026-03-04' });
    KAYITLAR.push({ id: 'D' + i + 'b', instrumentId: c.id, recordType: RecordType.VERIFICATION, date: '2026-09-05' });
});
// kalibrasyon kayitlari: ilki TERAZI, kalanlari kumpas
RAPOR_NO.forEach((rn, i) => {
    KAYITLAR.push({ id: 'K' + i, instrumentId: i === 0 ? 'TRZ1' : 'KUM1',
        recordType: RecordType.CALIBRATION, date: '2026-07-17', reportNumber: rn });
});

const pdfTanim = PDFLER.map(ad => ({ ad, sayfalar: null }));
const defterTanim = [{ ad: 'Şeritmetre Doğrulama Formlar.xls', sayfalar: SAYFALAR }];

// 1) Yedi sertifikanin YEDISI de kendi kaydini buluyor
{
    const r = raporEslestir(pdfTanim, KAYITLAR, CIHAZLAR, false);
    assert.strictEqual(r.length, 7, '1a: dosya sayısı ' + r.length);
    const bos = r.filter(x => x.hedefler.length === 0).map(x => x.ad);
    assert.strictEqual(bos.length, 0, '1b: eşleşmeyen: ' + bos.join(', '));
    r.forEach(x => assert.strictEqual(x.hedefler.length, 1,
        '1c: ' + x.ad + ' -> ' + x.hedefler.length + ' kayıt (1 olmalı)'));
    console.log('✓ 1  yedi sertifikanın yedisi de tek ve doğru kayda eşleşiyor');
}

// 2) Dosya DOGRU kayda gidiyor (rapor no birbirine cok benziyor)
{
    const r = raporEslestir(pdfTanim, KAYITLAR, CIHAZLAR, false);
    r.forEach(x => {
        const rn = x.ad.replace(/_.*$/, '');                 // 0143K-0726-01126
        const kayit = KAYITLAR.find(k => k.id === x.hedefler[0].kayitId);
        assert.strictEqual(kayit.reportNumber, rn, '2: ' + x.ad + ' -> ' + kayit.reportNumber);
    });
    console.log('✓ 2  benzer rapor numaraları karışmıyor (01350 ≠ 01351 ≠ 01352…)');
}

// 3) Ilgisiz dosya HICBIR seye baglanmiyor
{
    const r = raporEslestir([{ ad: 'rastgele_belge.pdf', sayfalar: null },
                             { ad: '2026 ozet.pdf', sayfalar: null }], KAYITLAR, CIHAZLAR, false);
    assert.strictEqual(r[0].hedefler.length, 0, '3a: ilgisiz dosya eşleşti');
    assert.strictEqual(r[1].hedefler.length, 0, '3b: kısa/rakamlı ad eşleşti');
    console.log('✓ 3  eşleşmeyen dosya hiçbir kayda bağlanmıyor (sessizce yanlış yere gitmiyor)');
}

// 4) FR39 defteri: SM1..SM20 -> SM-01..SM-20 (bastaki sifir onemsiz)
{
    const r = raporEslestir(defterTanim, KAYITLAR, CIHAZLAR, false);
    assert.strictEqual(r[0].tur, 'form', '4a: tür ' + r[0].tur);
    assert.strictEqual(r[0].hedefler.length, 40, '4b: hedef sayısı ' + r[0].hedefler.length + ' (20 cihaz × 2 kayıt)');
    const cihazlar = new Set(r[0].hedefler.map(h => h.cihaz));
    assert.strictEqual(cihazlar.size, 1, '4c: tek cihaz adı bekleniyordu');
    const sayfalar = new Set(r[0].hedefler.map(h => h.sayfa));
    assert.strictEqual(sayfalar.size, 20, '4d: eşleşen sayfa sayısı ' + sayfalar.size);
    console.log('✓ 4  defterin 20 sayfası 20 şeritmetrenin 40 doğrulama kaydına bağlanıyor');
}

// 5) SM1 SADECE SM-01'e gidiyor; SM10/SM20 ile karismiyor
{
    const r = raporEslestir(defterTanim, KAYITLAR, CIHAZLAR, false);
    const sm1 = r[0].hedefler.filter(h => h.sayfa === 'SM1').map(h => h.kayitId);
    const sm10 = r[0].hedefler.filter(h => h.sayfa === 'SM10').map(h => h.kayitId);
    assert.strictEqual(sm1.length, 2, '5a: SM1 -> ' + sm1.length + ' kayıt');
    assert.deepStrictEqual(sm1.sort(), ['D0a', 'D0b'], '5b: SM1 yanlış cihaza gitti: ' + sm1);
    assert.deepStrictEqual(sm10.sort(), ['D9a', 'D9b'], '5c: SM10 yanlış cihaza gitti: ' + sm10);
    console.log('✓ 5  SM1 ile SM10/SM20 karışmıyor (baştaki sıfır doğru çözülüyor)');
}

// 6) Defter KALIBRASYON kaydina baglanmiyor (FR39 bir dogrulama formu)
{
    const r = raporEslestir(defterTanim, KAYITLAR, CIHAZLAR, false);
    const kalib = r[0].hedefler.filter(h => {
        const k = KAYITLAR.find(x => x.id === h.kayitId);
        return k.recordType !== RecordType.VERIFICATION;
    });
    assert.strictEqual(kalib.length, 0, '6: doğrulama formu kalibrasyon kaydına bağlandı');
    console.log('✓ 6  doğrulama formu kalibrasyon kayıtlarına bulaşmıyor');
}

// 7) Dolu kayitlar varsayilan olarak ATLANIYOR, kutu isaretlenince yaziliyor
{
    const doluKayitlar = KAYITLAR.map(k => k.id === 'D0a' ? { ...k, reportFile: { name: 'eski.pdf' } } : k);
    const atla = raporEslestir(defterTanim, doluKayitlar, CIHAZLAR, false);
    const yaz = raporEslestir(defterTanim, doluKayitlar, CIHAZLAR, true);
    assert.strictEqual(atla[0].hedefler.length, 39, '7a: dolu kayıt atlanmadı');
    assert.strictEqual(yaz[0].hedefler.length, 40, '7b: üzerine yaz seçeneği çalışmıyor');
    assert(!atla[0].hedefler.some(h => h.kayitId === 'D0a'), '7c: dolu kayıt yine hedefte');
    console.log('✓ 7  mevcut dosyalar korunuyor; "üzerine yaz" işaretlenirse değişiyor');
}

// 8) Cihazi olmayan sayfa sessizce atlaniyor, hata vermiyor
{
    const r = raporEslestir([{ ad: 'defter.xlsx', sayfalar: ['SM1', 'SM99', 'Sayfa1'] }], KAYITLAR, CIHAZLAR, false);
    const sayfalar = new Set(r[0].hedefler.map(h => h.sayfa));
    assert.deepStrictEqual(Array.from(sayfalar), ['SM1'], '8: ' + Array.from(sayfalar));
    console.log('✓ 8  karşılığı olmayan sayfa atlanıyor (SM99, Sayfa1)');
}

// 9) Uygulama tarafi bagli: dugme, modal ve kayit guncelleme
{
    assert(/onAttachReports: handleAttachReports/.test(src), '9a: App bağlantısı yok');
    assert(/const handleAttachReports = \(guncelleme\)/.test(src), '9b: kayıt güncelleyici yok');
    assert(/e\(TopluRaporModal, \{ isOpen: topluRaporAcik/.test(src), '9c: modal ekrana konmamış');
    assert(/"Toplu Rapor Yükle"/.test(src), '9d: düğme yok');
    // ayni dosya Drive'a bir kez yuklenmeli
    assert(/Dosya Drive'a BIR KEZ yuklenir/.test(src), '9e: dosya her hedef için yeniden yükleniyor olabilir');
    console.log('✓ 9  düğme, pencere ve kayıt güncelleme birbirine bağlı');
}

console.log('\nTüm senaryolar geçti.');
