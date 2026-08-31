// Otomatik mail artik Supabase anahtarina bagli degil.
//
// Olculen sorun: sunucu Supabase'e gidip
//   YANIT 401 >> {"message":"Invalid API key"}
// aliyordu. Anahtar sunucuya 219 karakter (dogru uzunluk) ulasiyor ama
// Supabase reddediyor; ayni anahtar disaridan HTTP 200 veriyor. Yani Apps
// Script'te saklanan degerin ICERIGI bozuk.
//
// Cozum: uygulama veriyi sunucuya kendisi gonderiyor (Drive'da tek JSON).
// dailyCheck once Supabase'i dener, olmazsa bu kopyayi kullanir.
const fs = require('fs'), assert = require('assert');
const KOK = 'C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/';
const gs = fs.readFileSync(KOK + 'KALIBRASYON-MAILER.gs', 'utf8');
const src = fs.readFileSync(KOK + 'index.html', 'utf8');

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
    const temel = {
        Boolean, String, Number, Date, Math, Array, Object, JSON, isNaN, parseInt, parseFloat,
        Logger: { log: () => {} },
        ANLIK_DOSYA: 'kalibrasyon-anlik.json',
        _parse: (v, d) => { try { return typeof v === 'string' ? JSON.parse(v) : (v || d); } catch (e) { return d; } }
    };
    return new Function('__k', 'with (__k) {\n' + govde(gs, 'function ' + ad + '(') + '\nreturn ' + ad + ';\n}')(
        new Proxy(Object.assign(temel, ortam || {}), { has: () => true, get: (t, p) => (p in t ? t[p] : undefined) }));
}

// Sahte Drive klasoru
function sahteKlasor(baslangic) {
    const dosyalar = new Map(Object.entries(baslangic || {}));
    return {
        _dosyalar: dosyalar,
        getFilesByName: (ad) => {
            const v = dosyalar.get(ad);
            let verildi = false;
            return { hasNext: () => !!v && !verildi, next: () => { verildi = true; return {
                setContent: (t) => dosyalar.set(ad, t), getId: () => 'id-' + ad,
                getBlob: () => ({ getDataAsString: () => v }) }; } };
        },
        createFile: (blob) => { dosyalar.set(blob.ad, blob.icerik); return { getId: () => 'yeni-' + blob.ad }; }
    };
}
const ORNEK = {
    instruments: JSON.stringify([{ id: 'A1', name: 'ŞERİTMETRE', serialNumber: 'SM-01',
        location: 'Ankara', department: 'KALİTE', lastCalibrationDate: '2025-01-05', calibrationInterval: 12 }]),
    calibrationRecords: JSON.stringify([]),
    settings: JSON.stringify({ scheduleEnabled: true, scheduleTime: '09:00',
        toList: 'a@x.com', thresholdDays: 15 })
};

// 1) Uygulamadan gelen kopya Drive'a yaziliyor
{
    const klasor = sahteKlasor();
    const yaz = gsFonk('anlikYaz', {
        _raporKlasoru: () => klasor,
        Utilities: { newBlob: (icerik, tur, ad) => ({ icerik, tur, ad }) }
    });
    const id = yaz(Object.assign({ zaman: '2026-08-31 14:40' }, ORNEK));
    assert.strictEqual(id, 'yeni-kalibrasyon-anlik.json', '1a: ' + id);
    assert(klasor._dosyalar.has('kalibrasyon-anlik.json'), '1b: dosya oluşmadı');
    console.log('✓ 1  uygulamadan gelen kopya Drive\'a yazılıyor');
}

// 2) Ikinci gonderim yeni dosya acmiyor, UZERINE yaziyor
{
    const klasor = sahteKlasor({ 'kalibrasyon-anlik.json': '{"eski":true}' });
    const yaz = gsFonk('anlikYaz', {
        _raporKlasoru: () => klasor,
        Utilities: { newBlob: (icerik, tur, ad) => ({ icerik, tur, ad }) }
    });
    const id = yaz(Object.assign({ zaman: 'x' }, ORNEK));
    assert.strictEqual(id, 'id-kalibrasyon-anlik.json', '2a: yeni dosya açıldı: ' + id);
    assert.strictEqual(klasor._dosyalar.size, 1, '2b: Drive\'da ' + klasor._dosyalar.size + ' dosya');
    assert(/ŞERİTMETRE/.test(klasor._dosyalar.get('kalibrasyon-anlik.json')), '2c: içerik güncellenmedi');
    console.log('✓ 2  her gönderimde aynı dosyanın üzerine yazılıyor (Drive dolmuyor)');
}

// 3) Okuma: uygulama bicimini (JSON string alanlar) cozuyor
{
    const klasor = sahteKlasor({ 'kalibrasyon-anlik.json':
        JSON.stringify(Object.assign({ zaman: '2026-08-31 14:40' }, ORNEK)) });
    const oku = gsFonk('anlikOku', { _raporKlasoru: () => klasor });
    const d = oku();
    assert(d, '3a: okunamadı');
    assert.strictEqual(d.instruments.length, 1, '3b: cihaz');
    assert.strictEqual(d.instruments[0].serialNumber, 'SM-01', '3c: seri no');
    assert.strictEqual(d.settings.toList, 'a@x.com', '3d: ayarlar');
    assert.strictEqual(d.zaman, '2026-08-31 14:40', '3e: zaman damgası');
    console.log('✓ 3  kopya okunup uygulama biçiminden çözülüyor');
}

// 4) Kopya yoksa veya bozuksa patlamiyor
{
    assert.strictEqual(gsFonk('anlikOku', { _raporKlasoru: () => sahteKlasor() })(), null, '4a: dosya yok');
    assert.strictEqual(gsFonk('anlikOku', { _raporKlasoru: () => sahteKlasor({ 'kalibrasyon-anlik.json': 'bozuk{' }) })(),
        null, '4b: bozuk içerik');
    assert.strictEqual(gsFonk('anlikOku', { _raporKlasoru: () => { throw new Error('Drive yok'); } })(),
        null, '4c: Drive hatası');
    console.log('✓ 4  kopya yoksa/bozuksa sessizce null dönüyor');
}

// 5) ASIL DAVRANIS: Supabase okunamayinca dailyCheck kopyaya duser
{
    const dc = govde(gs, 'function dailyCheck()');
    assert(/data = readSupabase\(\)/.test(dc), '5a: Supabase önce denenmiyor');
    assert(/data = anlikOku\(\)/.test(dc), '5b: kopyaya düşmüyor — anahtar bozulunca mail durur');
    const i = dc.indexOf('readSupabase()'), j = dc.indexOf('anlikOku()');
    assert(i < j, '5c: sıra yanlış, önce Supabase denenmeli');
    console.log('✓ 5  Supabase okunamazsa mail anlık kopyadan üretiliyor');
}

// 6) Sunucu hangi kaynagi kullandigini bildiriyor
{
    const d = govde(gs, 'function durumOzeti()');
    assert(/o\.kaynak/.test(d), '6a: kaynak bildirilmiyor');
    assert(/supabaseHata/.test(d), '6b: Supabase hatası gizleniyor');
    assert(/sunucuDurum\.kaynak/.test(src), '6c: uygulama kaynağı göstermiyor');
    console.log('✓ 6  durum panelinde hangi kaynağın kullanıldığı yazıyor');
}

// 7) Uygulama tarafi: veri degisince gonderiyor + elle dugme var
{
    assert(/action: 'anlik'/.test(src), '7a: gönderim yok');
    assert(/localStorage\.getItem\('instruments'\)/.test(src), '7b: cihazlar gönderilmiyor');
    assert(/localStorage\.getItem\('settings'\)/.test(src), '7c: ayarlar gönderilmiyor');
    assert(/\}, \[instruments, calibrationRecords, settings\]\)/.test(src), '7d: değişimde tetiklenmiyor');
    assert(/"Veriyi sunucuya gönder"/.test(src), '7e: elle gönderme düğmesi yok');
    console.log('✓ 7  uygulama veri değişince (ve elle) sunucuya gönderiyor');
}

// 8) Gonderim hatasi uygulamayi etkilemiyor
{
    const f = govde(src, 'async function anlikGonder()');
    assert(/catch/.test(f), '8a: hata yakalanmıyor');
    assert(!/toastService\.error/.test(f), '8b: kullanıcıya hata basıyor — sessiz olmalı');
    assert(/if \(!gasUrl\) return false/.test(f), '8c: Servis URL yokken istek atıyor');
    console.log('✓ 8  gönderim başarısız olsa da uygulama etkilenmiyor');
}

console.log('\nTüm senaryolar geçti.');
