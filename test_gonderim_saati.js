// Gonderim saati uygulamadan ayarlanabiliyor mu?
// Tetikleyici SAATLIK calisir; gonderim yalniz ayarlanan saatte olmali
// ve ayni gun ikinci kez gonderilmemeli.
const fs = require('fs'), assert = require('assert');
const K = 'C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/';
const gs = fs.readFileSync(K + 'KALIBRASYON-MAILER.gs', 'utf8');

function gsFn(ad) {
    const i = gs.indexOf('function ' + ad + '(');
    assert(i > 0, ad + ' yok');
    let d = 0, b = false, k = i;
    for (; k < gs.length; k++) {
        if (gs[k] === '{') { d++; b = true; }
        else if (gs[k] === '}') { d--; if (b && d === 0) { k++; break; } }
    }
    return gs.slice(i, k);
}

// Apps Script ortamini taklit et
function kur(saat, gun, sonGonderim) {
    const kayit = { sonGonderim: sonGonderim || null };
    const loglar = [];
    const ortam = {
        Session: { getScriptTimeZone: () => 'Europe/Istanbul' },
        Utilities: { formatDate: (d, tz, bic) => bic === 'H' ? String(saat) : gun },
        PropertiesService: { getScriptProperties: () => ({
            getProperty: k => kayit[k] || null,
            setProperty: (k, v) => { kayit[k] = v; }
        }) },
        Logger: { log: t => loglar.push(t) },
        Date, String, Number, parseInt, isNaN
    };
    const F = new Function(...Object.keys(ortam),
        gsFn('_gonderimZamaniMi') + '\n' + gsFn('_gonderimiIsaretle')
        + '\nreturn {_gonderimZamaniMi, _gonderimiIsaretle};')(...Object.values(ortam));
    return { ...F, kayit, loglar };
}

// 1) Ayarlanan saatte gonderir
{
    const t = kur(9, '2026-08-31');
    assert.strictEqual(t._gonderimZamaniMi({ scheduleTime: '09:00' }), true, '1');
    console.log('✓ 1  ayarlanan saat gelince gönderiyor');
}

// 2) Baska saatte gondermez (saatlik tetikleyicinin diger 23 calismasi)
{
    [0, 8, 10, 23].forEach(h => {
        const t = kur(h, '2026-08-31');
        assert.strictEqual(t._gonderimZamaniMi({ scheduleTime: '09:00' }), false,
            '2: saat ' + h + ' iken göndermeye kalktı');
    });
    console.log('✓ 2  diğer saatlerde göndermiyor (saatlik tetikleyici boşa çalışmıyor)');
}

// 3) SAAT UYGULAMADAN: 14:30 ayarlanınca 14'te gonderir, 9'da gondermez
{
    assert.strictEqual(kur(14, '2026-08-31')._gonderimZamaniMi({ scheduleTime: '14:30' }), true, '3a');
    assert.strictEqual(kur(9, '2026-08-31')._gonderimZamaniMi({ scheduleTime: '14:30' }), false, '3b');
    console.log('✓ 3  uygulamada 14:30 seçilince 14\'te gönderiyor, 09\'da göndermiyor');
}

// 4) Ayni gun IKINCI kez gondermez
{
    const t = kur(9, '2026-08-31');
    assert.strictEqual(t._gonderimZamaniMi({ scheduleTime: '09:00' }), true, '4a');
    t._gonderimiIsaretle();
    assert.strictEqual(t.kayit.sonGonderim, '2026-08-31', '4b: damga yazılmadı');
    assert.strictEqual(t._gonderimZamaniMi({ scheduleTime: '09:00' }), false,
        '4c: aynı gün ikinci kez gönderiyor');
    console.log('✓ 4  gönderdikten sonra aynı gün tekrar göndermiyor');
}

// 5) Ertesi gun yeniden gonderir
{
    const t = kur(9, '2026-09-01', '2026-08-31');
    assert.strictEqual(t._gonderimZamaniMi({ scheduleTime: '09:00' }), true, '5');
    console.log('✓ 5  ertesi gün yeniden gönderiyor');
}

// 6) Saat ayari bozuksa 09:00'a duser
{
    [undefined, '', 'abc', '99:00', '-1:00'].forEach(v => {
        assert.strictEqual(kur(9, '2026-08-31')._gonderimZamaniMi({ scheduleTime: v }), true,
            '6: geçersiz saat (' + v + ') 09:00\'a düşmedi');
    });
    console.log('✓ 6  geçersiz/boş saat ayarı 09:00\'a düşüyor');
}

// 7) dailyCheck: zamanlama kapaliysa hic calismaz, saat kontrolu var
{
    const dc = gsFn('dailyCheck');
    assert(/settings\.scheduleEnabled === false/.test(dc), '7a: scheduleEnabled yok sayılıyor');
    assert(/_gonderimZamaniMi\(settings\)/.test(dc), '7b: saat kontrolü yok');
    assert(/_gonderimiIsaretle\(\)/.test(dc), '7c: gönderim sonrası damga yok');
    // Sira: saat kontrolu, mail gonderiminden ONCE olmali
    assert(dc.indexOf('_gonderimZamaniMi') < dc.indexOf('GmailApp.sendEmail'), '7d: sıra yanlış');
    assert(dc.indexOf('GmailApp.sendEmail') < dc.indexOf('_gonderimiIsaretle'), '7e: damga önce konmuş');
    console.log('✓ 7  dailyCheck: kapalıysa durur, saat kontrolü gönderimden önce, damga sonra');
}

// 8) Kurulum saatlik tetikleyici kurar ve eskileri temizler
{
    const k = gsFn('kurulum');
    assert(/deleteTrigger/.test(k), '8a: eski tetikleyiciler silinmiyor');
    assert(/everyHours\(1\)/.test(k), '8b: saatlik değil');
    assert(/newTrigger\('dailyCheck'\)/.test(k), '8c');
    console.log('✓ 8  kurulum() eski tetikleyicileri silip saatlik olanı kuruyor');
}

console.log('\nTüm senaryolar geçti.');
