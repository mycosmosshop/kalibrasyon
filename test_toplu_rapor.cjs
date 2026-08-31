// Toplu rapor yukleme: GERCEK dosya adlari ve GERCEK defter icerigiyle.
//
// Kaynaklar:
//   C:\Users\User\Desktop\Kalibrasyon Sertifikaları\*.pdf   (rapor no ile adlandirilmis)
//   C:\Users\User\Desktop\Şeritmetre Doğrulama Formlar.xls  (SM1..SM20, FR39)
//
// Bulunan hata: sayfa adi ile seri numarasi KARAKTER KARAKTER karsilastiriliyordu.
// Seri numarasi 'SM-08' kalibina uymayan cihazlar eslesemiyor, sayfa sessizce
// dusuyordu: 20 kayit beklenirken 7 baglaniyordu.
//
// Riskli nokta yanlis kayda dosya baglamak; testler "eslesiyor mu" kadar
// "YANLIS eslesmiyor mu" tarafina da bakiyor.
const fs = require('fs'), assert = require('assert');
const KOK = 'C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/';
const src = fs.readFileSync(KOK + 'index.html', 'utf8');
const XLSX = require('C:/Users/User/AppData/Local/Temp/claude/D--Yaz-l-m/651c3d70-fb75-4585-8b7d-1923454b8e83/scratchpad/xlsx.full.min.js');

// ---- gercek fonksiyonlari kaynaktan al ----
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
const _fk = govde('function formKimligi(');
const yardimcilar = src.slice(src.indexOf('const _rprAnahtar'), src.indexOf(_fk) + _fk.length);
const { raporEslestir, formKimligi } = new Function('RecordType',
    yardimcilar + '\n' + govde('function raporEslestir(') +
    '\nreturn { raporEslestir, formKimligi };')(RecordType);

// ---- gercek kaynak dosyalar ----
const PDF_KLASOR = 'C:/Users/User/Desktop/Kalibrasyon Sertifikaları/';
const PDFLER = fs.readdirSync(PDF_KLASOR).filter(f => /\.pdf$/i.test(f));
const DEFTER = 'C:/Users/User/Desktop/Şeritmetre Doğrulama Formlar.xls';
const wb = XLSX.read(fs.readFileSync(DEFTER, 'binary'), { type: 'binary' });
// Uygulamanin yaptigi isin AYNISI: her sayfanin kimligini formdan cikar
const KIMLIKLER = wb.SheetNames.map(n =>
    formKimligi(XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 }), n));
const defterTanim = [{ ad: 'Şeritmetre Doğrulama Formlar.xls', sayfalar: KIMLIKLER }];

// ---- uygulamadakine benzer veri ----
// Seri numaralari BILEREK duzensiz: gercek hayatta hepsi 'SM-01' kalibinda degil.
const SERILER = ['SM-01', 'SM-02', 'SM-03', 'SM-04', 'SM-05', 'SM-06', 'SM-07',
                 'ŞM-08', 'ŞM 09', 'SM10', '11', 'SM-12', 'sm-13', 'SM_14',
                 'ŞERİT-15', 'SM-16', 'SM-17', 'SM-18', 'SM-19', 'SM-20'];
const CIHAZLAR = SERILER.map((sn, i) => ({
    id: 'SF' + String(i + 1).padStart(5, '0'), name: 'ŞERİTMETRE',
    serialNumber: sn, location: 'Ankara'
}));
CIHAZLAR.push({ id: 'TRZ1', name: 'TERAZİ-DEPO', serialNumber: '607134', location: 'Ankara' });
CIHAZLAR.push({ id: 'KUM1', name: 'MANUEL KUMPAS', serialNumber: '37180517306', location: 'Çerkezköy' });

const RAPOR_NO = ['0143K-0726-01126', '0143K-0726-01127', '0143K-0726-01350',
                  '0143K-0726-01351', '0143K-0726-01352', '0143K-0726-01353', '0143K-0726-01354'];
const KAYITLAR = [];
CIHAZLAR.filter(c => c.name === 'ŞERİTMETRE').forEach((c, i) => {
    KAYITLAR.push({ id: 'D' + (i + 1), instrumentId: c.id, recordType: RecordType.VERIFICATION, date: '2026-09-05' });
});
RAPOR_NO.forEach((rn, i) => {
    KAYITLAR.push({ id: 'K' + i, instrumentId: i === 0 ? 'TRZ1' : 'KUM1',
        recordType: RecordType.CALIBRATION, date: '2026-07-17', reportNumber: rn });
});
const pdfTanim = PDFLER.map(ad => ({ ad, sayfalar: null }));

// 1) Formun kendi kimligi okunuyor: 'Şeritmetre' + 1..20
{
    assert.strictEqual(KIMLIKLER.length, 20, '1a: sayfa sayısı ' + KIMLIKLER.length);
    KIMLIKLER.forEach((k, i) => {
        assert.strictEqual(k.ad, 'Şeritmetre', '1b: ' + k.sayfa + ' cihaz adı: ' + JSON.stringify(k.ad));
        assert.strictEqual(k.no, i + 1, '1c: ' + k.sayfa + ' cihaz no: ' + k.no);
    });
    console.log('✓ 1  FR39 formundan CİHAZ ADI ve CİHAZ NO okunuyor (Şeritmetre 1…20)');
}

// 2) ASIL HATA: 20 sayfanin YIRMISI de kayda baglaniyor (eskiden 7)
{
    const r = raporEslestir(defterTanim, KAYITLAR, CIHAZLAR, false);
    assert.strictEqual(r[0].eslesmeyen.length, 0, '2a: eşleşmeyen: ' + r[0].eslesmeyen.join(', '));
    assert.strictEqual(r[0].hedefler.length, 20, '2b: hedef sayısı ' + r[0].hedefler.length + ' (20 olmalı)');
    console.log('✓ 2  seri numarası düzensiz olsa da 20 sayfanın yirmisi de bağlanıyor');
}

// 3) Her sayfa KENDI cihazina gidiyor (1 -> SM-01, 8 -> ŞM-08, 11 -> '11')
{
    const r = raporEslestir(defterTanim, KAYITLAR, CIHAZLAR, false);
    const harita = {};
    r[0].hedefler.forEach(h => { harita[h.sayfa] = h.kayitId; });
    assert.strictEqual(harita['SM1'], 'D1', '3a: SM1 -> ' + harita['SM1']);
    assert.strictEqual(harita['SM8'], 'D8', '3b: ŞM-08 bulunamadı, SM8 -> ' + harita['SM8']);
    assert.strictEqual(harita['SM11'], 'D11', '3c: seri no "11" olan cihaz, SM11 -> ' + harita['SM11']);
    assert.strictEqual(harita['SM15'], 'D15', '3d: ŞERİT-15, SM15 -> ' + harita['SM15']);
    assert.strictEqual(harita['SM10'], 'D10', '3e: SM10 -> ' + harita['SM10']);
    assert.strictEqual(harita['SM20'], 'D20', '3f: SM20 -> ' + harita['SM20']);
    console.log('✓ 3  SM1/SM10/SM11/SM20 karışmıyor; Türkçe harf ve eksik ön ek sorun değil');
}

// 4) Karsiligi olmayan sayfa SESSIZCE dusmuyor, onizlemede yaziyor
{
    const eksik = CIHAZLAR.filter(c => !['SF00003', 'SF00004'].includes(c.id));
    const r = raporEslestir(defterTanim, KAYITLAR, eksik, false);
    assert.strictEqual(r[0].hedefler.length, 18, '4a: hedef ' + r[0].hedefler.length);
    assert.deepStrictEqual(r[0].eslesmeyen.sort(), ['SM3', 'SM4'], '4b: ' + r[0].eslesmeyen.join(', '));
    console.log('✓ 4  cihazı bulunamayan sayfa önizlemede adıyla bildiriliyor');
}

// 5) Cihaz var ama DOGRULAMA kaydi yoksa bu da soyleniyor
{
    const kayitsiz = KAYITLAR.filter(k => k.id !== 'D5');
    const r = raporEslestir(defterTanim, kayitsiz, CIHAZLAR, false);
    assert(r[0].eslesmeyen.some(x => /^SM5 /.test(x)), '5: ' + r[0].eslesmeyen.join(', '));
    console.log('✓ 5  "doğrulama kaydı yok" durumu ayrıca belirtiliyor');
}

// 6) Dogrulama formu KALIBRASYON kaydina bulasmiyor
{
    const r = raporEslestir(defterTanim, KAYITLAR, CIHAZLAR, false);
    const yanlis = r[0].hedefler.filter(h =>
        KAYITLAR.find(k => k.id === h.kayitId).recordType !== RecordType.VERIFICATION);
    assert.strictEqual(yanlis.length, 0, '6: kalibrasyon kaydına bağlandı');
    console.log('✓ 6  doğrulama formu kalibrasyon kayıtlarına bulaşmıyor');
}

// 7) Sertifikalar: yedisi de tek ve DOGRU kayda
{
    const r = raporEslestir(pdfTanim, KAYITLAR, CIHAZLAR, false);
    assert.strictEqual(r.length, 7, '7a: dosya sayısı ' + r.length);
    r.forEach(x => {
        assert.strictEqual(x.hedefler.length, 1, '7b: ' + x.ad + ' -> ' + x.hedefler.length);
        const rn = x.ad.replace(/_.*$/, '');
        const kayit = KAYITLAR.find(k => k.id === x.hedefler[0].kayitId);
        assert.strictEqual(kayit.reportNumber, rn, '7c: ' + x.ad + ' -> ' + kayit.reportNumber);
    });
    console.log('✓ 7  yedi sertifika doğru kayda gidiyor (01350 ≠ 01351 ≠ 01352…)');
}

// 8) Ilgisiz dosya hicbir seye baglanmiyor
{
    const r = raporEslestir([{ ad: 'rastgele_belge.pdf', sayfalar: null },
                             { ad: '2026 ozet.pdf', sayfalar: null }], KAYITLAR, CIHAZLAR, false);
    assert.strictEqual(r[0].hedefler.length, 0, '8a: ilgisiz dosya eşleşti');
    assert.strictEqual(r[1].hedefler.length, 0, '8b: kısa/rakamlı ad eşleşti');
    console.log('✓ 8  eşleşmeyen dosya hiçbir kayda bağlanmıyor');
}

// 9) Baska cihaz turu ayni numarayi tasisa da form ona gitmiyor
{
    const karisik = CIHAZLAR.concat([
        { id: 'X1', name: 'ÇELİK CETVEL', serialNumber: 'CC-03', location: 'Ankara' }]);
    const kayitlar2 = KAYITLAR.concat([
        { id: 'DX', instrumentId: 'X1', recordType: RecordType.VERIFICATION, date: '2026-09-05' }]);
    const r = raporEslestir(defterTanim, kayitlar2, karisik, false);
    assert(!r[0].hedefler.some(h => h.kayitId === 'DX'),
        '9: şeritmetre formu çelik cetvele bağlandı');
    console.log('✓ 9  aynı numaralı başka cihaz türüne bulaşmıyor (cihaz adı da tutmalı)');
}

// 10) Dolu kayitlar korunuyor; "uzerine yaz" isaretlenince degisiyor
{
    const dolu = KAYITLAR.map(k => k.id === 'D1' ? { ...k, reportFile: { name: 'eski.pdf' } } : k);
    const atla = raporEslestir(defterTanim, dolu, CIHAZLAR, false);
    const yaz = raporEslestir(defterTanim, dolu, CIHAZLAR, true);
    assert.strictEqual(atla[0].hedefler.length, 19, '10a: dolu kayıt atlanmadı');
    assert.strictEqual(yaz[0].hedefler.length, 20, '10b: üzerine yaz çalışmıyor');
    console.log('✓ 10 mevcut dosyalar korunuyor; "üzerine yaz" işaretlenirse değişiyor');
}

// 11) Uygulama tarafi bagli
{
    assert(/onAttachReports: handleAttachReports/.test(src), '11a: App bağlantısı yok');
    assert(/const handleAttachReports = \(guncelleme\)/.test(src), '11b: kayıt güncelleyici yok');
    assert(/e\(TopluRaporModal, \{ isOpen: topluRaporAcik/.test(src), '11c: modal ekrana konmamış');
    assert(/"Toplu Rapor Yükle"/.test(src), '11d: düğme yok');
    assert(/Dosya Drive'a BIR KEZ yuklenir/.test(src), '11e: dosya her hedef için yeniden yükleniyor olabilir');
    assert(/eşleşmeyen sayfa: /.test(src), '11f: eşleşmeyen sayfalar önizlemede gösterilmiyor');
    console.log('✓ 11 düğme, pencere, kayıt güncelleme ve uyarı satırı bağlı');
}

console.log('\nTüm senaryolar geçti.');
