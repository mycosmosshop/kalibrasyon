// Bildirim maili: uygulamanin GONDERDIGI alanlar ile sunucudaki mail
// SABLONUNUN okudugu alanlar ayni mi?
//
// Gercek olay: uygulama serial / nextCalibration yolluyordu, sablon
// serialNumber / nextCalibrationDate okuyordu. Mail gidiyordu ama Seri
// No, Departman, Siradaki Kalibrasyon ve Durum sutunlari BOS geliyordu;
// daysLeft hic gonderilmedigi icin satir rengi de calismiyordu.
const fs = require('fs'), assert = require('assert');
const K = 'C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/';
const uygulama = fs.readFileSync(K + 'index.html', 'utf8');
const sunucu = fs.readFileSync(K + 'KALIBRASYON-MAILER.gs', 'utf8');

// Sunucudaki GERCEK sablonu cek ve calistir
function gsFn(ad) {
    const i = sunucu.indexOf('function ' + ad + '(');
    assert(i > 0, ad + ' yok');
    let d = 0, b = false, k = i;
    for (; k < sunucu.length; k++) {
        if (sunucu[k] === '{') { d++; b = true; }
        else if (sunucu[k] === '}') { d--; if (b && d === 0) { k++; break; } }
    }
    return sunucu.slice(i, k);
}
const buildHtml = new Function(gsFn('buildHtml') + '\nreturn buildHtml;')();

// Uygulamanin gonderdigi bicimi kaynaktan cikar
const blok = uygulama.slice(
    uygulama.indexOf('const devicesToScrapeFormat = instrumentsToNotify.map'),
    uygulama.indexOf('}));', uygulama.indexOf('const devicesToScrapeFormat')) + 4);
const gonderilenAlanlar = [...blok.matchAll(/^\s{12}([A-Za-z]+):/gm)].map(m => m[1]);

// Sablonun okudugu alanlar
const okunanAlanlar = [...new Set([...gsFn('buildHtml').matchAll(/\bd\.([A-Za-z]+)/g)].map(m => m[1]))];

// 1) Sablonun okudugu HER alan gonderiliyor mu?
{
    const eksik = okunanAlanlar.filter(a => !gonderilenAlanlar.includes(a));
    assert.strictEqual(eksik.length, 0,
        '1: şablon okuyor ama uygulama göndermiyor: ' + eksik.join(', '));
    console.log('✓ 1  şablonun okuduğu her alan gönderiliyor (' + okunanAlanlar.join(', ') + ')');
}

// 2) Eski YANLIS adlar kalmadi
{
    ['serial:', 'nextCalibration:', 'lastCalibration:'].forEach(y =>
        assert(!new RegExp('^\\s+' + y.replace(':', ':')).test(blok) || !blok.includes('\n            ' + y),
            '2: eski alan adı duruyor: ' + y));
    assert(blok.includes('serialNumber:'), '2b: serialNumber gönderilmiyor');
    assert(blok.includes('nextCalibrationDate:'), '2c: nextCalibrationDate gönderilmiyor');
    console.log('✓ 2  eski yanlış alan adları kalmadı');
}

// 3) Mail govdesi GERCEKTEN doluyor
{
    const cihazlar = [{
        name: 'KALINLIK KOMPARATÖRÜ - LABORATUVAR', serialNumber: 'AEX70730N',
        department: 'KALINLIK ÖLÇÜMÜ', location: 'Çerkezköy',
        nextCalibrationDate: '10.07.2026', daysLeft: -52, status: 'Gecikmiş'
    }];
    const html = buildHtml(cihazlar, 30);
    ['KALINLIK KOMPARATÖRÜ', 'AEX70730N', 'KALINLIK ÖLÇÜMÜ', '10.07.2026']
        .forEach(x => assert(html.includes(x), '3a: mailde yok: ' + x));
    assert(/GEC\u0130KT\u0130 \(52 g\u00fcn\)/.test(html), '3b: durum sütunu boş');
    assert(/background:#f8d7da/.test(html), '3c: gecikmiş satır kırmızı değil');
    // Bos hucre kalmamali
    const bosHucre = (html.match(/padding:6px"><\/td>/g) || []).length;
    assert.strictEqual(bosHucre, 0, '3d: ' + bosHucre + ' boş hücre var');
    console.log('✓ 3  mail gövdesi tüm sütunlarla doluyor, gecikmiş satır kırmızı');
}

// 4) Yaklasan cihaz: sari, "N gün kaldı"
{
    const html = buildHtml([{ name: 'X', serialNumber: 'S1', department: 'D',
        nextCalibrationDate: '05.09.2026', daysLeft: 5, status: 'Yaklaşıyor' }], 30);
    assert(/5 g\u00fcn kald\u0131/.test(html), '4a');
    assert(/background:#fff3cd/.test(html), '4b: yaklaşan satır sarı değil');
    console.log('✓ 4  yaklaşan cihaz "5 gün kaldı" ve sarı satır');
}

// 5) Tarihi olmayan cihaz cokmez
{
    const html = buildHtml([{ name: 'Y', serialNumber: '', department: '',
        nextCalibrationDate: '', daysLeft: null, status: 'Beklemede' }], 30);
    assert(html.includes('<td'), '5: satır üretilmedi');
    assert(!/undefined|null/.test(html), '5b: mailde undefined/null görünüyor');
    console.log('✓ 5  tarihi olmayan cihazda undefined/null sızmıyor');
}

// 6) Gun hesabi dogru isaretli (gecmis negatif, gelecek pozitif)
{
    const m = uygulama.match(/const kalanGun = \(t\) => \{[\s\S]*?\n        \};/);
    assert(m, '6a: gün hesabı bulunamadı');
    const kalanGun = new Function('return (bugun => { ' + m[0] + ' return kalanGun; })')()(
        (() => { const d = new Date('2026-08-31'); d.setHours(0, 0, 0, 0); return d; })());
    assert.strictEqual(kalanGun('2026-07-10'), -52, '6b: geçmiş tarih: ' + kalanGun('2026-07-10'));
    assert.strictEqual(kalanGun('2026-09-05'), 5, '6c: gelecek tarih');
    assert.strictEqual(kalanGun(''), null, '6d: boş tarih');
    assert.strictEqual(kalanGun('abc'), null, '6e: geçersiz tarih');
    console.log('✓ 6  gün hesabı: geçmiş negatif, gelecek pozitif, geçersiz null');
}

// Goz kontrolu icin ornek
fs.writeFileSync('ornek_kalibrasyon_maili.html', buildHtml([
    { name: 'KALINLIK KOMPARATÖRÜ - LABORATUVAR', serialNumber: 'AEX70730N',
      department: 'KALINLIK ÖLÇÜMÜ', nextCalibrationDate: '10.07.2026', daysLeft: -52 },
    { name: '1000mm MANUEL KUMPAS', serialNumber: '20244562',
      department: 'MESAFE ÖLÇÜMÜ', nextCalibrationDate: '05.09.2026', daysLeft: 5 },
    { name: 'ÇEKME-KOPMA TEST CİHAZI', serialNumber: '346-55900-01',
      department: 'BASMA KUVVETİ', nextCalibrationDate: '11.06.2027', daysLeft: 284 }
], 30), 'utf8');

console.log('\nTüm senaryolar geçti.');
