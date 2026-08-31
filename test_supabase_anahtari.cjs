// Supabase okuma: anahtar nerede duruyor ve okunamayinca SEBEBI soyleniyor mu?
//
// İki sorun vardi:
//  1) service_role anahtari koda yaziliydi; bu dosya HERKESE ACIK bir depoda
//     duruyor ve o anahtar RLS'i tamamen bypass eder.
//  2) 'veri: false' donuyordu ama nedeni yazmiyordu; izin eksikligi ile
//     gecersiz anahtar disaridan ayni goruniyordu.
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
// readSupabase modul duzeyindeki _sonVeriHatasi'ni yazar; ikisini birlikte kur
function kur(o) {
    const kod = 'var _sonVeriHatasi = "";\n' +
        govde('function _servisAnahtari()') + '\n' + govde('function readSupabase()') +
        '\nreturn { oku: readSupabase, hata: function () { return _sonVeriHatasi; } };';
    return new Function('__k', 'with (__k) {\n' + kod + '\n}')(
        new Proxy(o, { has: () => true, get: (t, p) => (p in t ? t[p] : undefined) }));
}
const temel = (anahtar, yanit) => ({
    SUPA_URL: 'https://x.supabase.co', ROW_ID: 'kalibrasyon',
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => anahtar }) },
    UrlFetchApp: { fetch: () => yanit },
    Logger: { log: () => {} },
    _parse: (v, d) => { try { return typeof v === 'string' ? JSON.parse(v) : (v || d); } catch (e) { return d; } },
    String, JSON, Number, Array, Object
});
const GECERLI = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.imzaimza';

// 1) Anahtar KODA YAZILI DEGIL (depo herkese acik)
{
    assert(!/eyJpc3MiOiJzdXBhYmFzZSI/.test(gs), '1a: service_role anahtarı hâlâ kodda');
    assert(!/SERVICE_ROLE_KEY\s*=\s*['"]ey/.test(gs), '1b: anahtar koda gömülü');
    assert(/getProperty\('SUPABASE_SERVICE_KEY'\)/.test(gs), '1c: anahtar Komut Dosyası Özellikleri\'nden okunmuyor');
    console.log('✓ 1  anahtar kodda değil, Komut Dosyası Özellikleri\'nden okunuyor');
}

// 2) Anahtar hic tanimli degilse: nereye yazilacagi soyleniyor
{
    const m = kur(temel('', null));
    assert.strictEqual(m.oku(), null, '2a');
    assert(/Komut Dosyası Özellikleri/.test(m.hata()), '2b: ' + m.hata());
    assert(/SUPABASE_SERVICE_KEY/.test(m.hata()), '2c: anahtar adı yazmıyor');
    console.log('✓ 2  anahtar yoksa nereye ekleneceği yazıyor');
}

// 3) ASIL DURUM: yarim JWT (imzasiz) — su an sunucuda olan bu
{
    const yarim = 'eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUifQ';   // tek parça
    const m = kur(temel(yarim, null));
    assert.strictEqual(m.oku(), null, '3a');
    assert(/üç parçalı/.test(m.hata()), '3b: ' + m.hata());
    assert(/1 parça/.test(m.hata()), '3c: kaç parça olduğu yazmıyor: ' + m.hata());
    console.log('✓ 3  yarım anahtar ağ isteği yapmadan yakalanıyor ve kaç parça olduğu yazıyor');
}

// 4) Supabase reddederse HTTP kodu ve cevabi gorunuyor
{
    const m = kur(temel(GECERLI, { getResponseCode: () => 401,
        getContentText: () => '{"message":"Invalid API key"}' }));
    assert.strictEqual(m.oku(), null, '4a');
    assert(/401/.test(m.hata()), '4b: ' + m.hata());
    assert(/Invalid API key/.test(m.hata()), '4c: sunucunun cevabı gizleniyor: ' + m.hata());
    console.log('✓ 4  Supabase reddederse HTTP kodu ve gerekçesi görünüyor');
}

// 5) Satir yoksa bu da ayirt ediliyor (anahtar suclanmiyor)
{
    const m = kur(temel(GECERLI, { getResponseCode: () => 200, getContentText: () => '[]' }));
    assert.strictEqual(m.oku(), null, '5a');
    assert(/bulunamadı/.test(m.hata()), '5b: ' + m.hata());
    assert(!/anahtar/i.test(m.hata()), '5c: satır yokken anahtar suçlanıyor: ' + m.hata());
    console.log('✓ 5  satır yoksa "anahtar bozuk" denmiyor, ayrı sebep yazıyor');
}

// 6) Her sey yolundaysa veri geliyor ve hata bos
{
    const veri = JSON.stringify([{ data: {
        instruments: JSON.stringify([{ id: 'A', name: 'X' }]),
        calibrationRecords: JSON.stringify([]),
        settings: JSON.stringify({ scheduleEnabled: true }) } }]);
    const m = kur(temel(GECERLI, { getResponseCode: () => 200, getContentText: () => veri }));
    const d = m.oku();
    assert(d, '6a: veri okunamadı');
    assert.strictEqual(d.instruments.length, 1, '6b: cihaz');
    assert.strictEqual(d.settings.scheduleEnabled, true, '6c: ayarlar');
    assert.strictEqual(m.hata(), '', '6d: başarılıyken hata dolu: ' + m.hata());
    console.log('✓ 6  doğru anahtarla veri okunuyor, hata alanı boş kalıyor');
}

// 7) Sebep uygulamaya kadar tasiniyor
{
    assert(/o\.veriHata = _sonVeriHatasi/.test(gs), '7a: durum sebebi taşımıyor');
    assert(/sunucuDurum\.veriHata/.test(src), '7b: uygulama sebebi göstermiyor');
    console.log('✓ 7  sebep "Durumu kontrol et" panelinde görünüyor');
}

console.log('\nTüm senaryolar geçti.');
