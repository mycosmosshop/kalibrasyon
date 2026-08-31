// Otomatik kalibrasyon maili: gercekten calisiyor mu, kullanici bunu
// gorebiliyor mu?
//
// Bulunan hatalar:
//  1) dailyCheck 'emailNotificationsEnabled' kapaliysa hic gondermiyordu.
//     O kutu uygulamada ELLE taslak butonu icin ve varsayilani KAPALI —
//     yani hic dokunulmamis bir kutu otomatik maili sessizce olduruyordu.
//  2) Test maili cihazlari 'serial'/'nextCalibration' adlariyla gonderiyordu,
//     sunucudaki sablon 'serialNumber'/'nextCalibrationDate'/'department'/
//     'daysLeft' okuyor: test mailinde 5 sutunun 4'u BOS geliyordu.
//  3) Ayar penceresi "yalnizca bu pencere acikken calisir" diyordu (yanlis)
//     ve hicbir sey yapmayan bir "Manuel Senk." dugmesi "Senkron OK" yaziyordu.
const fs = require('fs'), assert = require('assert');
const KOK = 'C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/';
const src = fs.readFileSync(KOK + 'index.html', 'utf8');
const gs = fs.readFileSync(KOK + 'KALIBRASYON-MAILER.gs', 'utf8');

// ---- gercek fonksiyonlari kaynaktan cikar ----
function govde(metin, bas) {
    const i = metin.indexOf(bas);
    assert(i > 0, bas + ' yok');
    let d = 0, b = false, k = i;
    for (; k < metin.length; k++) {
        if (metin[k] === '{') { d++; b = true; }
        else if (metin[k] === '}') { d--; if (b && d === 0) { k++; break; } }
    }
    return metin.slice(i, k);
}
function gsFonk(ad, ortam) {
    const g = govde(gs, 'function ' + ad + '(');
    const temel = {
        Boolean, String, Number, Date, Math, Array, Object, JSON, isNaN, parseInt, parseFloat,
        Logger: { log: () => {} }
    };
    return new Function('__k', 'with (__k) {\n' + g + '\nreturn ' + ad + ';\n}')(
        new Proxy(Object.assign(temel, ortam || {}),
            { has: () => true, get: (t, p) => (p in t ? t[p] : undefined) }));
}

const CalibrationStatus = { OVERDUE: 'Gecikmiş', DUE_SOON: 'Yaklaşıyor', OK: 'Uygun' };
const calculateNextCalibrationDate = new Function(
    'return ' + govde(src, 'const calculateNextCalibrationDate = (lastDate, intervalMonths) => {')
        .replace('const calculateNextCalibrationDate = ', '') + ';')();

// SettingsModal icindeki criticalInstruments listesini gercek kodla uret.
// getInstrumentStatus bilerek sabitlendi: burada test edilen sey HANGI
// cihazin secildigi degil, cihazin HANGI ALAN ADLARIYLA gonderildigi.
function kritikListe(instruments) {
    const memo = govde(src, 'const criticalInstruments = useMemo(() => {');
    const g = memo.slice(memo.indexOf('{') + 1, memo.lastIndexOf('}'));
    return new Function('__k', 'with (__k) {\n' + g + '\n}')(new Proxy({
        instruments,
        getInstrumentStatus: () => CalibrationStatus.OVERDUE,
        localSettings: { thresholdDays: 15 },
        CalibrationStatus, calculateNextCalibrationDate,
        dateKeyOf: (d) => new Date(d).toISOString().slice(0, 10),
        Date, Math, String, Number
    }, { has: () => true, get: (t, p) => (p in t ? t[p] : undefined) }));
}

const CIHAZLAR = [
    { id: 'A1', name: 'DİGİTAL KUMPAS', serialNumber: '37180517306', department: 'MESAFE ÖLÇÜMÜ',
      location: 'Ankara', lastCalibrationDate: '2025-01-10', calibrationInterval: 12 },
    { id: 'A2', name: 'ÇELİK CETVEL', serialNumber: '20244561', department: 'LABORATUVAR',
      location: 'Çerkezköy', lastCalibrationDate: '2024-11-21', calibrationInterval: 24 }
];

// 1) Test maili sunucudaki sablonun okudugu alanlarla gidiyor
{
    const liste = kritikListe(CIHAZLAR);
    assert.strictEqual(liste.length, 2, '1a: liste uzunluğu ' + liste.length);
    liste.forEach(d => {
        assert(d.serialNumber, '1b: serialNumber boş — sunucu bu adı okuyor');
        assert(d.nextCalibrationDate, '1c: nextCalibrationDate boş');
        assert(d.department, '1d: department gönderilmiyor');
        assert(typeof d.daysLeft === 'number', '1e: daysLeft yok (Durum sütunu boş kalır)');
    });
    console.log('✓ 1  test maili cihazları serialNumber/department/nextCalibrationDate/daysLeft ile gönderiyor');
}

// 2) Sunucudaki sablonda HICBIR sutun bos kalmiyor (asil hata buydu)
{
    const buildHtml = gsFonk('buildHtml', {});
    const html = buildHtml(kritikListe(CIHAZLAR), 15);
    const satirlar = html.split('<tr').slice(2); // basliktan sonrakiler
    assert.strictEqual(satirlar.length, 2, '2a: satır sayısı ' + satirlar.length);
    satirlar.forEach((r, i) => {
        const hucre = r.match(/<td[^>]*>([^<]*)<\/td>/g).map(x => x.replace(/<[^>]+>/g, '').trim());
        assert.strictEqual(hucre.length, 5, '2b: hücre sayısı');
        const bos = hucre.filter(x => !x).length;
        assert.strictEqual(bos, 0, '2c: ' + (i + 1) + '. satırda ' + bos + ' boş hücre: ' + JSON.stringify(hucre));
    });
    assert(/GECİKTİ|gün kaldı/.test(html), '2d: Durum sütunu boş');
    console.log('✓ 2  mail tablosunda boş sütun kalmıyor');
}

// 3) Otomatik mail artik SADECE 'Otomatik mail gönderilsin' kutusuna bakiyor
{
    const dc = govde(gs, 'function dailyCheck()');
    assert(!/if \(settings\.emailNotificationsEnabled/.test(dc),   // yorumdaki gecis sayilmaz
        '3a: dailyCheck hâlâ elle-taslak kutusuna bakıyor — kapalıysa mail hiç gitmez');
    assert(/settings\.scheduleEnabled === false/.test(dc), '3b: otomatik anahtarı kontrol edilmiyor');
    console.log('✓ 3  otomatik mail yalnızca kendi anahtarına bakıyor (sessiz kapanma tuzağı kalktı)');
}

// 4) Sunucu durumu: tetikleyici, alicilar, saat, esik, son gonderim
{
    const _fmt = gsFonk('_fmt', {});
    const nextCal = gsFonk('nextCalibrationDate', { Number, Date, _date: gsFonk('_date', { Date, isNaN }) });
    const _gecikenler = gsFonk('_gecikenler', { Date, Math, nextCalibrationDate: nextCal, _fmt });

    const ortam = {
        DEFAULT_THRESHOLD: 30, Number, String, Date, Math,
        Session: { getScriptTimeZone: () => 'Europe/Istanbul' },
        Utilities: { formatDate: () => '09' },
        PropertiesService: { getScriptProperties: () => ({ getProperty: () => '2026-08-30' }) },
        ScriptApp: { getProjectTriggers: () => [{ getHandlerFunction: () => 'dailyCheck' }] },
        readSupabase: () => ({
            instruments: CIHAZLAR, calibrationRecords: [],
            settings: { scheduleEnabled: true, scheduleTime: '07:30', thresholdDays: 20,
                        toList: 'a@x.com, b@x.com', emailNotificationsEnabled: false }
        }),
        _gecikenler
    };
    const d = gsFonk('durumOzeti', ortam)();
    assert.strictEqual(d.tetikleyici, true, '4a: tetikleyici görülmüyor');
    assert.strictEqual(d.veri, true, '4b: veri okunamadı');
    assert.strictEqual(d.acik, true, '4c: elle-taslak kutusu kapalı diye "kapalı" diyor');
    assert.deepStrictEqual(d.alicilar, ['a@x.com', 'b@x.com'], '4d: alıcılar: ' + JSON.stringify(d.alicilar));
    assert.strictEqual(d.saat, '07:30', '4e: saat');
    assert.strictEqual(d.esik, 20, '4f: eşik');
    // 20 gunluk esikte yalniz suresi GECMIS cihaz sayilir; digeri 2026-11-21,
    // yani esigin disinda. Sayi sunucunun kendi esigiyle uretiliyor.
    assert.strictEqual(d.cihazSayisi, 1, '4g: cihaz sayısı ' + d.cihazSayisi);
    assert.strictEqual(d.sonGonderim, '2026-08-30', '4h: son gönderim');
    console.log('✓ 4  sunucu kendi gerçeklerini bildiriyor (tetikleyici, alıcı, saat, eşik, son gönderim)');
}

// 5) Tetikleyici kurulmamissa acikca soyleniyor
{
    const d = gsFonk('durumOzeti', {
        DEFAULT_THRESHOLD: 30, Number, String, Date,
        Session: { getScriptTimeZone: () => 'Europe/Istanbul' },
        Utilities: { formatDate: () => '09' },
        PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
        ScriptApp: { getProjectTriggers: () => [] },
        readSupabase: () => null
    })();
    assert.strictEqual(d.tetikleyici, false, '5a');
    assert.strictEqual(d.veri, false, '5b');
    assert(/KURULU DEĞİL/.test(src), '5c: uygulamada uyarı metni yok');
    console.log('✓ 5  kurulum() çalıştırılmamışsa durum panelinde açıkça yazıyor');
}

// 6) JSONP: GitHub Pages sayfasi sunucuyu CORS'a takilmadan okuyabiliyor
{
    assert(/action === 'durum'/.test(gs), '6a: durum eylemi yok');
    assert(/MimeType\.JAVASCRIPT/.test(gs), '6b: JSONP çıktısı yok — tarayıcı CORS\'a takılır');
    assert(/action=durum&callback=/.test(src), '6c: uygulama durumu sormuyor');
    console.log('✓ 6  durum sorgusu JSONP ile okunuyor (CORS engeline takılmıyor)');
}

// 7) Yanlis bilgi ve olu dugmeler kalkti
{
    assert(!/Yalnızca bu ayarlar penceresi açıkken/.test(src),
        '7a: "pencere açıkken çalışır" yanlış uyarısı duruyor');
    assert(!/handleSyncServerSnapshot/.test(src), '7b: ölü senkron kodu duruyor');
    assert(!/Manuel Senk\./.test(src), '7c: hiçbir şey yapmayan düğme duruyor');
    assert(!/Yönetici Anahtarı/.test(src), '7d: sunucunun hiç kullanmadığı alan hâlâ isteniyor');
    assert(/kapalıyken de gider/.test(src), '7e: doğru açıklama yok');
    console.log('✓ 7  yanlış uyarı, ölü düğme ve kullanılmayan alan kaldırıldı');
}

// 8) Ayarlar hala Supabase'e senkronlanan anahtarda
{
    const sync = fs.readFileSync(KOK + 'kalibrasyon-sync.js', 'utf8');
    assert(/KEYS=\['instruments','calibrationRecords','settings'\]/.test(sync),
        '8: settings artık senkronlanmıyor — sunucu yeni ayarları göremez');
    console.log('✓ 8  ayarlar Supabase\'e gidiyor, sunucu okuyabiliyor');
}

console.log('\nTüm senaryolar geçti.');
