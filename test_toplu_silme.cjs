// Secilen kayitlari silerken Drive'daki rapor dosyalari da silinsin.
//
// Asil risk BASKASININ dosyasini silmek: ayni Drive dosyasi birden cok kayda
// bagli olabilir (bir sertifika iki kayda; 10.14 oncesi bir defter yirmi
// kayda). Silinen kaydin dosyasi geride kalan bir kayitta da kullaniliyorsa
// silinmemeli, yoksa o kayitlarin rapor baglantisi sessizce kirilir.
const fs = require('fs'), assert = require('assert');
const KOK = 'C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/';
const src = fs.readFileSync(KOK + 'index.html', 'utf8');

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
const secilen = new Function(govde('function silinecekDriveDosyalari(') +
    '\nreturn silinecekDriveDosyalari;')();

const dosyali = (id, fid) => ({ id, instrumentId: 'C1', reportFile: { name: fid + '.pdf', driveFileId: fid } });
const dosyasiz = (id) => ({ id, instrumentId: 'C1' });

// 1) Her kaydin kendi dosyasi: hepsi silinir
{
    const silinen = [dosyali('K1', 'f1'), dosyali('K2', 'f2'), dosyali('K3', 'f3')];
    assert.deepStrictEqual(secilen(silinen, []), ['f1', 'f2', 'f3'], '1');
    console.log('✓ 1  kendi dosyası olan kayıtların dosyaları siliniyor');
}

// 2) ASIL KORUMA: geride kalan bir kayit da kullaniyorsa SILINMEZ
{
    const silinen = [dosyali('K1', 'ortak'), dosyali('K2', 'f2')];
    const kalan = [dosyali('K9', 'ortak')];
    assert.deepStrictEqual(secilen(silinen, kalan), ['f2'],
        '2: başka kaydın kullandığı dosya siliniyor — o kaydın raporu kırılır');
    console.log('✓ 2  geride kalan kaydın da kullandığı dosyaya dokunulmuyor');
}

// 3) Yirmi kayit ayni deftere bagliysa (10.14 oncesi) ve 19'u silinirse dosya kalir
{
    const hepsi = [];
    for (let i = 1; i <= 20; i++) hepsi.push(dosyali('K' + i, 'defter'));
    const silinen = hepsi.slice(0, 19), kalan = hepsi.slice(19);
    assert.deepStrictEqual(secilen(silinen, kalan), [], '3a: son kaydın defteri silindi');
    // hepsi silinirse dosya da gider, bir kez
    assert.deepStrictEqual(secilen(hepsi, []), ['defter'], '3b: ' + secilen(hepsi, []).length);
    console.log('✓ 3  ortak defter ancak son kayıt da silinince kaldırılıyor, bir kez');
}

// 4) Dosyasi olmayan kayitlar sorun cikarmiyor
{
    assert.deepStrictEqual(secilen([dosyasiz('K1'), dosyasiz('K2')], []), [], '4a');
    assert.deepStrictEqual(secilen([dosyasiz('K1'), dosyali('K2', 'f2')], []), ['f2'], '4b');
    assert.deepStrictEqual(secilen([], []), [], '4c');
    assert.deepStrictEqual(secilen(null, null), [], '4d');
    console.log('✓ 4  dosyası olmayan kayıtlar atlanıyor, boş liste patlamıyor');
}

// 5) Yalniz tarayicida tutulan dosya (Drive kimligi yok) Drive'a gonderilmiyor
{
    const yerel = { id: 'K1', reportFile: { name: 'x.pdf', data: 'data:application/pdf;base64,AAA' } };
    assert.deepStrictEqual(secilen([yerel], []), [], '5: Drive kimliği olmayan dosya listeye girdi');
    console.log('✓ 5  Drive kimliği olmayan (yerel) dosya için Drive isteği yapılmıyor');
}

// 6) Ayni dosya iki silinen kayitta: tek sefer
{
    const silinen = [dosyali('K1', 'f1'), dosyali('K2', 'f1'), dosyali('K3', 'f1')];
    assert.deepStrictEqual(secilen(silinen, []), ['f1'], '6: aynı dosya için birden çok istek');
    console.log('✓ 6  aynı dosya birden çok kayıtta olsa tek silme isteği');
}

// 7) Uygulama tarafi: onay penceresi, kutu ve silme sirasi
{
    assert(/const \[driveDaSil, setDriveDaSil\] = useState\(true\)/.test(src), '7a: seçenek yok');
    assert(/const silmeOzeti = useMemo/.test(src), '7b: silme özeti yok');
    assert(/const confirmDelete = async \(\)/.test(src), '7c: silme eşzamansız değil, Drive beklenemez');
    assert(/rapor dosyası da silinsin/.test(src), '7d: onay penceresinde kutu yok');
    assert(/await deleteFromDrive\(fid\)/.test(src), '7e: Drive silme çağrılmıyor');
    console.log('✓ 7  onay penceresinde sayı + seçenek var, Drive silme bekleniyor');
}

// 8) Drive silme YEREL silmeden SONRA yapiliyor
{
    const g = govde('const confirmDelete = async ()');
    const yerelSon = g.lastIndexOf('setCalibrationRecords');
    const driveIlk = g.indexOf('deleteFromDrive');
    assert(yerelSon > 0 && driveIlk > 0, '8a: bölümler bulunamadı');
    assert(driveIlk > yerelSon,
        '8b: Drive dosyası yerel kayıt silinmeden önce siliniyor — yerel silme başarısız olursa dosya boşuna gider');
    console.log('✓ 8  önce yerel kayıt siliniyor, sonra Drive dosyası');
}

// 9) Cihaz silmede de bagli kayitlarin dosyalari hesaplaniyor
{
    const g = govde('const silmeOzeti = useMemo');
    assert(/instrumentId/.test(g), '9a: cihaz silmede bağlı kayıtlar dikkate alınmıyor');
    assert(/bulk_instruments/.test(g), '9b: toplu cihaz silme kapsanmıyor');
    assert(/silinecekDriveDosyalari\(silinen, kalan\)/.test(g), '9c: koruma çağrılmıyor');
    console.log('✓ 9  cihaz silmede de bağlı kayıtların dosyaları kapsanıyor');
}

// 10) Cihaz Detayi'nda da coklu secim var ve AYNI onay penceresine gidiyor
{
    // govde() burada ise yaramaz: ilk suslu parantez, parametrelerin
    // destructure blogu. Bilesenin tamamini iki isaret arasindan al.
    const bas = src.indexOf('const InstrumentDetailView = (');
    const son = src.indexOf('// ===== Kalibrasyon Düzeltme', bas);
    assert(bas > 0 && son > bas, 'InstrumentDetailView bulunamadı');
    const g = src.slice(bas, son);
    assert(/onBulkDeleteRecords/.test(g), '10a: detay sayfasında toplu silme yok');
    assert(/onBulkDeleteRecords\(secili\)/.test(g), '10b: seçilenler gönderilmiyor');
    assert(/Seçilenleri Sil/.test(g), '10c: düğme yok');
    assert(/type: "checkbox"/.test(g), '10d: satırlarda seçim kutusu yok');
    assert(/Tümünü seç/.test(g), '10e: tümünü seç yok');
    // Tum Kayitlar ile AYNI islev kullanilmali; Drive korumasi oradan geliyor
    assert(/onBulkDeleteRecords: handleBulkDeleteRecords/.test(src),
        '10f: ayrı bir silme yoluna bağlanmış — Drive koruması atlanır');
    console.log('✓ 10 cihaz detayında çoklu seçim var, aynı onay penceresine gidiyor');
}

// 11) Listeden dusen kayit secimde asili kalmiyor
{
    // govde() burada ise yaramaz: ilk suslu parantez, parametrelerin
    // destructure blogu. Bilesenin tamamini iki isaret arasindan al.
    const bas = src.indexOf('const InstrumentDetailView = (');
    const son = src.indexOf('// ===== Kalibrasyon Düzeltme', bas);
    assert(bas > 0 && son > bas, 'InstrumentDetailView bulunamadı');
    const g = src.slice(bas, son);
    assert(/const secili = secilenler\.filter\(id => mevcutIdler\.includes\(id\)\)/.test(g),
        '11a: silinen kayıt seçili sayılmaya devam ediyor');
    assert(/setSecilenler\(\[\]\); \}, \[instrument && instrument\.id\]\)/.test(g),
        '11b: başka cihaza geçince seçim taşınıyor');
    console.log('✓ 11 silinen kayıt ve cihaz değişimi seçimi kirletmiyor');
}

// 12) Cihazlar ekraninda "Sadece Kayitlari Sil": cihazlar KALIR
{
    const bas = src.indexOf('const handleBulkDeleteInstrumentRecords');
    assert(bas > 0, '12a: cihazları tutup kayıtları silme yolu yok');
    // Yalnizca bu fonksiyonun govdesi: bir sonraki bildirime kadar
    const g = src.slice(bas, src.indexOf('\n    const ', bas + 10));
    // Kayit silme yoluna gitmeli; cihaz silme yoluna DEGIL
    assert(/handleBulkDeleteRecords\(ids\)/.test(g), '12b: kayıt silme yoluna gitmiyor');
    assert(!/setInstruments/.test(g), '12c: cihazlara dokunuyor — cihazlar kalmalı');
    assert(/r\.instrumentId/.test(g), '12d: seçili cihazların kayıtları toplanmıyor');
    assert(/silinecek kayıt yok/.test(g), '12e: kayıt yokken sessiz kalıyor');
    assert(/"Sadece Kayıtları Sil"/.test(src), '12f: düğme yok');
    assert(/onBulkDeleteInstrumentRecords: handleBulkDeleteInstrumentRecords/.test(src), '12g: bağlanmamış');
    console.log('✓ 12 "Sadece Kayıtları Sil" cihazları silmeden geçmişi temizliyor');
}

// 13) Iki dugme birbirine karismiyor
{
    assert(/"Cihazları Sil"/.test(src), '13a: cihaz silme düğmesi adlandırılmamış');
    const i = src.indexOf('"Sadece Kayıtları Sil"'), j = src.indexOf('"Cihazları Sil"');
    assert(i > 0 && j > i, '13b: düğme sırası');
    // Cihaz silme hala cihaz yoluna gitmeli
    const k = src.slice(i - 400, j + 400);
    assert(/onBulkDelete\(selectedIds\)/.test(k), '13c: cihaz silme bozulmuş');
    assert(/onBulkDeleteInstrumentRecords\(selectedIds\)/.test(k), '13d: kayıt silme bağlanmamış');
    console.log('✓ 13 "Cihazları Sil" eski davranışını koruyor, ikisi ayrı');
}

// 14) Dugme adlari ne sildiklerini soyluyor (belirsiz "Toplu Sil" kalmadi)
{
    assert(!/"Toplu Sil"/.test(src), '14a: belirsiz "Toplu Sil" etiketi duruyor');
    assert(/"Seçili Kayıtları Sil"/.test(src), '14b: Tüm Kayıtlar ekranındaki etiket');
    assert(/"Sadece Kayıtları Sil"/.test(src), '14c: Cihazlar ekranındaki kayıt silme');
    assert(/"Cihazları Sil"/.test(src), '14d: Cihazlar ekranındaki cihaz silme');
    console.log('✓ 14 üç düğmenin de adı ne sildiğini söylüyor');
}

console.log('\nTüm senaryolar geçti.');
