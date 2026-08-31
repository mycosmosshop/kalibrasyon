// Dogrulama defteri: her kayit KENDI sayfasina baglanir (SUNUCU kodu).
//
// PDF disa aktarma kaldirildi. Defteri 20 ayri PDF'e cevirmek surekli sorun
// cikardi: hiz siniri (SM10/13/15/18 dusuyordu), arkada bos sayfa, sagdan
// kesilen sutunlar. Her duzeltme yeni bir dagitim gerektirdi.
//
// Yeni yol: defter Drive'da BIR KEZ Google E-Tablo'ya cevrilir ve orada kalir;
// her kayit '...#gid=<sayfa>' adresine baglanir. Disa aktarma yok.
const fs = require('fs'), assert = require('assert');
const KOK = 'C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/';
const gs = fs.readFileSync(KOK + 'KALIBRASYON-MAILER.gs', 'utf8');
const src = fs.readFileSync(KOK + 'index.html', 'utf8');

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
const DOSYA_BAYT = Array.from(Buffer.from('BU BIR XLS DOSYASININ BAYTLARI \x00\x01\xff', 'binary'));
const DOSYA_B64 = Buffer.from(DOSYA_BAYT).toString('base64');
function calistir(ad, o) {
    return new Function('__k', 'with (__k) {\n' + govde('function ' + ad + '(') + '\nreturn ' + ad + ';\n}')(
        new Proxy(o, { has: () => true, get: (t, p) => (p in t ? t[p] : undefined) }));
}

// Sahte Drive klasoru: icindeki dosyalar ada gore bulunur
function sahteKlasor(varOlan) {
    return {
        _tasinan: [], _paylasim: [],
        getFilesByName: (ad) => {
            const v = (varOlan || {})[ad];
            let verildi = false;
            return { hasNext: () => !!v && !verildi, next: () => { verildi = true; return { getId: () => v }; } };
        }
    };
}
function ortam(o) {
    const y = { url: null, opt: null, cevrildi: 0, tasindi: 0, paylasildi: 0 };
    const sayfalar = o.sayfalar || [{ ad: 'SM1', gid: 111 }, { ad: 'SM2', gid: 222 }, { ad: 'SM20', gid: 333 }];
    return [y, {
        Utilities: { getUuid: () => 'u', newBlob: (x) => ({ getBytes: () => [1] }), base64Decode: () => DOSYA_BAYT },
        ScriptApp: { getOAuthToken: () => 'T' },
        SpreadsheetApp: { openById: (id) => { y.acilan = id; return { getSheets: () => sayfalar.map(s => ({
            getSheetId: () => s.gid, getName: () => s.ad })) }; } },
        DriveApp: {
            getFileById: () => ({ moveTo: () => { y.tasindi++; }, setSharing: () => { y.paylasildi++; } }),
            Access: { ANYONE_WITH_LINK: 'a' }, Permission: { VIEW: 'v' }
        },
        _raporKlasoru: (alt) => { y.klasor = alt; return o.klasor || sahteKlasor(); },
        _eTablayaDonustur: (b64, tur, ad) => { y.cevrildi++; y.cevrilenAd = ad; return 'YENI_ID'; },
        String, JSON, Error, Array
    }];
}

// 1) Defter bir kez cevriliyor ve her sayfa icin baglanti donuyor
{
    const [y, o] = ortam({});
    const r = calistir('formSayfalariniAyir', o)(DOSYA_B64, 'Şeritmetre Doğrulama Formlar.xls', 'application/vnd.ms-excel', '');
    assert.strictEqual(r.success, true, '1a: ' + r.error);
    assert.strictEqual(y.cevrildi, 1, '1b: ' + y.cevrildi + ' kez dönüştürüldü (1 olmalı)');
    assert.strictEqual(r.sayfalar.length, 3, '1c: ' + r.sayfalar.length);
    assert.deepStrictEqual(r.sayfalar.map(x => x.sayfa), ['SM1', 'SM2', 'SM20'], '1d');
    assert.deepStrictEqual(r.hatali, [], '1e: hata listesi dolu');
    console.log('✓ 1  defter bir kez çevriliyor, her sayfa için bağlantı dönüyor');
}

// 2) Baglanti DOGRU sayfaya gidiyor (#gid)
{
    const [y, o] = ortam({});
    const r = calistir('formSayfalariniAyir', o)(DOSYA_B64, 'defter.xls', 'x', '');
    const sm2 = r.sayfalar.find(x => x.sayfa === 'SM2');
    assert(/\/spreadsheets\/d\/YENI_ID\/edit#gid=222$/.test(sm2.driveUrl),
        '2a: yanlış adres: ' + sm2.driveUrl);
    assert.strictEqual(sm2.previewUrl, sm2.driveUrl, '2b: önizleme adresi farklı');
    assert.strictEqual(sm2.ad, 'defter - SM2', '2c: etiket: ' + sm2.ad);
    const gidler = r.sayfalar.map(x => x.driveUrl.split('#gid=')[1]);
    assert.deepStrictEqual(gidler, ['111', '222', '333'], '2d: sayfalar karışmış: ' + gidler);
    console.log('✓ 2  her kayıt kendi sayfasının adresine bağlanıyor');
}

// 3) ASIL KAZANC: hic PDF disa aktarma istegi yok
{
    const f = govde('function formSayfalariniAyir(');
    assert(!/export\?format=pdf/.test(f), '3a: hâlâ PDF dışa aktarıyor');
    assert(!/UrlFetchApp/.test(f), '3b: hâlâ ağ isteği atıyor — hız sınırına takılır');
    assert(!/Utilities\.sleep/.test(f), '3c: hâlâ bekleme var');
    assert(!/scale=|fitw=|range=/.test(f), '3d: hâlâ sayfa sığdırma parametreleri var');
    console.log('✓ 3  dışa aktarma, bekleme ve sayfa sığdırma kodu tamamen kalktı');
}

// 4) Ayni defter tekrar yuklenirse YENIDEN CEVRILMIYOR
{
    const [y, o] = ortam({ klasor: sahteKlasor({ 'defter': 'ESKI_ID' }) });
    const r = calistir('formSayfalariniAyir', o)(DOSYA_B64, 'defter.xls', 'x', '');
    assert.strictEqual(y.cevrildi, 0, '4a: gereksiz yere yeniden dönüştürdü');
    assert.strictEqual(y.acilan, 'ESKI_ID', '4b: mevcut E-Tablo kullanılmadı');
    assert(/\/d\/ESKI_ID\//.test(r.sayfalar[0].driveUrl), '4c: adres eski dosyaya gitmiyor');
    console.log('✓ 4  aynı defter tekrar yüklenirse mevcut E-Tablo kullanılıyor');
}

// 5) Yeni cevrilen dosya klasore tasiniyor ve baglantiyla paylasiliyor
{
    const [y, o] = ortam({});
    calistir('formSayfalariniAyir', o)(DOSYA_B64, 'defter.xls', 'x', '');
    assert.strictEqual(y.klasor, 'Doğrulama Formları', '5a: klasör: ' + y.klasor);
    assert.strictEqual(y.tasindi, 1, '5b: klasöre taşınmadı');
    assert.strictEqual(y.paylasildi, 1, '5c: bağlantıyla paylaşılmadı — kayıttan açılmaz');
    console.log('✓ 5  yeni E-Tablo klasöre taşınıyor ve bağlantıyla paylaşılıyor');
}

// 6) Yalnizca ISTENEN sayfalar donuyor
{
    const [y, o] = ortam({});
    const r = calistir('formSayfalariniAyir', o)(DOSYA_B64, 'defter.xls', 'x', '', ['SM2']);
    assert.strictEqual(r.sayfalar.length, 1, '6a: ' + r.sayfalar.length);
    assert.strictEqual(r.sayfalar[0].sayfa, 'SM2', '6b');
    console.log('✓ 6  yalnızca istenen sayfa için bağlantı üretiliyor');
}

// 7) Donusum patlarsa sessiz gecilmiyor
{
    const [y, o] = ortam({});
    o._eTablayaDonustur = () => { throw new Error('E-Tabloya dönüştürülemedi (403)'); };
    const r = calistir('formSayfalariniAyir', o)(DOSYA_B64, 'defter.xls', 'x', '');
    assert.strictEqual(r.success, false, '7a: hata yutuldu');
    assert(/403/.test(r.error), '7b: sebep yazmıyor: ' + r.error);
    console.log('✓ 7  dönüştürme başarısızsa sebebiyle birlikte bildiriliyor');
}

// 8) Uygulama tarafi degismedi: gereken sayfalari bildirip kayda bagliyor
{
    assert(/action: 'formSayfalari'/.test(src), '8a: istek yok');
    assert(/const gereken = Array\.from\(new Set\(es\.hedefler\.map\(h => h\.sayfa\)/.test(src), '8b');
    assert(/function sayfaDosyalariniEsle\(/.test(src), '8c: eşleme yok');
    assert(/driveFileId: sp\.fileId/.test(src), '8d: kayda bağlanmıyor');
    console.log('✓ 8  uygulama tarafı aynı: gereken sayfalar isteniyor, kayda bağlanıyor');
}

console.log('\nTüm senaryolar geçti.');
