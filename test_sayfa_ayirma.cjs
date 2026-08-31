// Defteri sayfa sayfa PDF'e ayiran SUNUCU kodu (KALIBRASYON-MAILER.gs).
//
// Google'a istek atmadan dogrulanabilen kisim: Drive'a gonderilen multipart
// govdesi ve PDF disa aktarma adresi. Bunlar sessizce bozulursa kullanici
// yalnizca "E-Tabloya dönüştürülemedi" gorur; hangi parcanin bozuk oldugunu
// anlamak icin her seferinde canli deneme gerekir.
const fs = require('fs'), assert = require('assert');
const KOK = 'C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/';
const gs = fs.readFileSync(KOK + 'KALIBRASYON-MAILER.gs', 'utf8');

function govde(bas) {
    const i = gs.indexOf(bas);
    assert(i > 0, bas + ' yok');
    let d = 0, b = false, k = i;
    for (; k < gs.length; k++) {
        if (gs[k] === '{') { d++; b = true; }
        else if (gs[k] === '}') { d--; if (b && d === 0) { k++; break; } }
    }
    return gs.slice(i, k);
}

// Apps Script ortamini taklit et: sadece bu fonksiyonun kullandiklari
const DOSYA_BAYT = Array.from(Buffer.from('BU BIR XLS DOSYASININ BAYTLARI \x00\x01\xff', 'binary'));
const DOSYA_B64 = Buffer.from(DOSYA_BAYT).toString('base64');
function ortam(yakala) {
    return {
        Utilities: {
            getUuid: () => '11111111-2222-3333-4444-555555555555',
            newBlob: (x) => ({ getBytes: () => Array.from(Buffer.from(String(x), 'utf8')) }),
            base64Decode: () => DOSYA_BAYT
        },
        ScriptApp: { getOAuthToken: () => 'TOKEN123' },
        UrlFetchApp: {
            fetch: (url, opt) => {
                yakala.url = url; yakala.opt = opt;
                return { getResponseCode: () => 200,
                    getContentText: () => JSON.stringify({ id: 'YENI_ETABLO_ID' }) };
            }
        },
        JSON, String, Error, Array, Buffer
    };
}
function calistir(ad, o) {
    return new Function('__k', 'with (__k) {\n' + govde('function ' + ad + '(') + '\nreturn ' + ad + ';\n}')(
        new Proxy(o, { has: () => true, get: (t, p) => (p in t ? t[p] : undefined) }));
}

// 1) Drive'a giden multipart govdesi gecerli
{
    const y = {};
    const donustur = calistir('_eTablayaDonustur', ortam(y));
    const id = donustur(DOSYA_B64, 'application/vnd.ms-excel', 'gecici-defter.xls');
    assert.strictEqual(id, 'YENI_ETABLO_ID', '1a: dönen kimlik');

    const sinir = (y.opt.contentType.match(/boundary=(.+)$/) || [])[1];
    assert(sinir, '1b: sınır (boundary) yok: ' + y.opt.contentType);
    assert.strictEqual(typeof y.opt.payload, 'string',
        '1b2: gövde metin değil (' + typeof y.opt.payload + ') — eski çalışma ortamında getBytes().concat yok');
    const govdeMetin = y.opt.payload;

    assert(govdeMetin.startsWith('--' + sinir + '\r\n'), '1c: gövde sınırla başlamıyor');
    assert(govdeMetin.endsWith('\r\n--' + sinir + '--\r\n'), '1d: gövde kapanış sınırıyla bitmiyor');
    const parca = govdeMetin.split('--' + sinir);
    assert.strictEqual(parca.length, 4, '1e: parça sayısı ' + (parca.length - 2) + ' (2 olmalı)');
    console.log('✓ 1  multipart gövdesi doğru sınırlarla kuruluyor (2 parça)');
}

// 2) Ust veri: hedef tur Google E-Tablo (donusum bunu gerektirir)
{
    const y = {};
    const donustur = calistir('_eTablayaDonustur', ortam(y));
    donustur(DOSYA_B64, 'application/vnd.ms-excel', 'gecici-defter.xls');
    const metin = y.opt.payload;
    const m = metin.match(/\{"name".*?\}/);
    assert(m, '2a: üst veri JSON\'u yok');
    const meta = JSON.parse(m[0]);
    assert.strictEqual(meta.mimeType, 'application/vnd.google-apps.spreadsheet',
        '2b: hedef tür ' + meta.mimeType + ' — dönüşüm olmaz');
    assert.strictEqual(meta.name, 'gecici-defter.xls', '2c: ad');
    assert(/Content-Type: application\/json; charset=UTF-8/.test(metin), '2d: üst veri başlığı');
    assert(/Content-Type: application\/vnd\.ms-excel/.test(metin), '2e: dosya başlığı');
    console.log('✓ 2  üst veri Google E-Tablo\'ya dönüştürmeyi istiyor');
}

// 3) Dosyanin baytlari BOZULMADAN gidiyor
{
    const y = {};
    const donustur = calistir('_eTablayaDonustur', ortam(y));
    donustur(DOSYA_B64, 'application/vnd.ms-excel', 'd.xls');
    assert(y.opt.payload.indexOf(DOSYA_B64) >= 0, '3a: dosya içeriği gövdede yok/bozulmuş');
    assert(/Content-Transfer-Encoding: base64/.test(y.opt.payload),
        '3b: base64 başlığı yok — Drive içeriği bozuk okur');
    console.log('✓ 3  dosya içeriği base64 olarak bozulmadan gönderiliyor');
}

// 4) Yetki basligi ve uploadType
{
    const y = {};
    calistir('_eTablayaDonustur', ortam(y))(DOSYA_B64, 'application/vnd.ms-excel', 'd.xls');
    assert(/uploadType=multipart/.test(y.url), '4a: uploadType eksik: ' + y.url);
    assert(/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files/.test(y.url), '4b: adres: ' + y.url);
    assert.strictEqual(y.opt.headers.Authorization, 'Bearer TOKEN123', '4c: yetki başlığı');
    assert.strictEqual(y.opt.method, 'post', '4d: yöntem');
    console.log('✓ 4  Drive yükleme adresi ve yetki başlığı doğru');
}

// 5) Donusum basarisizsa SESSIZ gecilmiyor
{
    const y = {};
    const o = ortam(y);
    o.UrlFetchApp.fetch = () => ({ getResponseCode: () => 403,
        getContentText: () => '{"error":{"message":"Insufficient Permission"}}' });
    let hata = null;
    try {
        calistir('_eTablayaDonustur', o)(DOSYA_B64, 'x', 'd.xls');
    } catch (err) { hata = String(err.message || err); }
    assert(hata, '5a: hata fırlatılmadı');
    assert(/403/.test(hata) && /Insufficient Permission/.test(hata),
        '5b: hata mesajı sebebi söylemiyor: ' + hata);
    console.log('✓ 5  dönüştürme başarısızsa sebebiyle birlikte hata veriyor');
}

// 6) Her sayfa icin AYRI PDF, dogru gid ile
{
    const cagrilar = [];
    const silinen = [];
    const olusan = [];
    const sayfalar = [{ ad: 'SM1', gid: 111 }, { ad: 'SM2', gid: 222 }, { ad: 'SM20', gid: 333 }];
    const o = {
        Utilities: { base64Decode: () => DOSYA_BAYT,
            newBlob: (b, t, n) => ({ getContentType: () => t, getBytes: () => DOSYA_BAYT, getName: () => n }) },
        ScriptApp: { getOAuthToken: () => 'TOKEN123' },
        SpreadsheetApp: { openById: () => ({ getSheets: () => sayfalar.map(s => ({
            getSheetId: () => s.gid, getName: () => s.ad })) }) },
        DriveApp: { getFileById: (id) => ({ setTrashed: () => silinen.push(id) }),
            Access: { ANYONE_WITH_LINK: 'a' }, Permission: { VIEW: 'v' } },
        UrlFetchApp: { fetch: (url) => { cagrilar.push(url);
            return { getResponseCode: () => 200, getBlob: () => ({ setName: (n) => ({ ad: n }) }) }; } },
        _eTablayaDonustur: () => 'GECICI_ID',
        _raporKlasoru: () => 'KLASOR',
        _paylasilanDosya: (f, blob) => { olusan.push(blob.ad);
            return { fileId: 'id-' + blob.ad, driveUrl: 'u', previewUrl: 'p' }; },
        String, JSON, Error, Array
    };
    const ayir = calistir('formSayfalariniAyir', o);
    const r = ayir('BASE64', 'Şeritmetre Doğrulama Formlar.xls', 'application/vnd.ms-excel', '');

    assert.strictEqual(r.success, true, '6a: ' + r.error);
    assert.strictEqual(r.sayfalar.length, 3, '6b: üretilen PDF ' + r.sayfalar.length);
    assert.deepStrictEqual(r.sayfalar.map(x => x.sayfa), ['SM1', 'SM2', 'SM20'], '6c: sayfa adları');
    sayfalar.forEach(s => assert(cagrilar.some(u => u.indexOf('gid=' + s.gid) >= 0),
        '6d: ' + s.ad + ' için gid=' + s.gid + ' istenmemiş'));
    assert(cagrilar.every(u => /format=pdf/.test(u)), '6e: PDF olarak dışa aktarılmıyor');
    assert.deepStrictEqual(olusan, ['Şeritmetre Doğrulama Formlar - SM1.pdf',
        'Şeritmetre Doğrulama Formlar - SM2.pdf', 'Şeritmetre Doğrulama Formlar - SM20.pdf'], '6f: dosya adları');
    console.log('✓ 6  her sekme kendi gid\'iyle ayrı PDF olarak çıkarılıyor');
}

// 7) Gecici E-Tablo HER durumda siliniyor (hata olsa bile)
{
    const silinen = [];
    const temel = (fetchFn) => ({
        Utilities: { base64Decode: () => DOSYA_BAYT, newBlob: (b, t, n) => ({ getContentType: () => t, getBytes: () => DOSYA_BAYT }) },
        ScriptApp: { getOAuthToken: () => 'T' },
        SpreadsheetApp: { openById: () => ({ getSheets: () => [{ getSheetId: () => 1, getName: () => 'SM1' }] }) },
        DriveApp: { getFileById: (id) => ({ setTrashed: () => silinen.push(id) }),
            Access: { ANYONE_WITH_LINK: 'a' }, Permission: { VIEW: 'v' } },
        UrlFetchApp: { fetch: fetchFn },
        _eTablayaDonustur: () => 'GECICI_ID', _raporKlasoru: () => 'K',
        _paylasilanDosya: () => ({ fileId: 'i', driveUrl: 'u', previewUrl: 'p' }),
        String, JSON, Error, Array
    });
    // basarili yol
    calistir('formSayfalariniAyir', temel(() => ({ getResponseCode: () => 200,
        getBlob: () => ({ setName: () => ({}) }) })))('B', 'd.xls', 'x', '');
    // hatali yol
    const r2 = calistir('formSayfalariniAyir', temel(() => { throw new Error('patladı'); }))('B', 'd.xls', 'x', '');
    assert.strictEqual(silinen.length, 2, '7a: geçici dosya silinmedi (' + silinen.length + '/2)');
    assert.strictEqual(r2.success, false, '7b: hata yutuldu');
    console.log('✓ 7  geçici E-Tablo hata durumunda da siliniyor (Drive\'da çöp kalmıyor)');
}

// 8) PDF'i cikmayan sayfa bildiriliyor, digerleri yine de uretiliyor
{
    let n = 0;
    const o = {
        Utilities: { base64Decode: () => DOSYA_BAYT, newBlob: (b, t) => ({ getContentType: () => t, getBytes: () => DOSYA_BAYT }) },
        ScriptApp: { getOAuthToken: () => 'T' },
        SpreadsheetApp: { openById: () => ({ getSheets: () => [
            { getSheetId: () => 1, getName: () => 'SM1' },
            { getSheetId: () => 2, getName: () => 'SM2' }] }) },
        DriveApp: { getFileById: () => ({ setTrashed: () => {} }), Access: {}, Permission: {} },
        UrlFetchApp: { fetch: () => ({ getResponseCode: () => (++n === 1 ? 500 : 200),
            getBlob: () => ({ setName: (x) => ({ ad: x }) }) }) },
        _eTablayaDonustur: () => 'G', _raporKlasoru: () => 'K',
        _paylasilanDosya: () => ({ fileId: 'i', driveUrl: 'u', previewUrl: 'p' }),
        String, JSON, Error, Array
    };
    const r = calistir('formSayfalariniAyir', o)('B', 'd.xls', 'x', '');
    assert.deepStrictEqual(r.hatali, ['SM1'], '8a: ' + JSON.stringify(r.hatali));
    assert.strictEqual(r.sayfalar.length, 1, '8b: diğer sayfa da düştü');
    console.log('✓ 8  bir sayfa çıkmazsa adı bildiriliyor, diğerleri yine üretiliyor');
}

console.log('\nTüm senaryolar geçti.');
