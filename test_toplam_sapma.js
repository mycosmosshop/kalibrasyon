// Toplam Sapma = |sapma| + |belirsizlik|
//
// Bulunan hata: belirsizlik ISARETIYLE toplaniyordu. Kaynak PL12 formunda
// belirsizlik '-0,27' gibi negatif yazildiginda sapmadan DUSULUYOR ve
// toplam kucuk cikiyordu. Kabul karari (Uygun / Uygun Degil) bu degere
// gore verildigi icin uygun OLMAYAN bir cihaz 'Uygun' gorunebilirdi.
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync('C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/index.html', 'utf8');
const CR = { COMPLIANT: 'Uygun', MARGINAL: 'Sınırda Uygun', NON_COMPLIANT: 'Uygun Değil' };
function gercek(ad) {
    let j = src.indexOf('const ' + ad + ' = ');
    assert(j > 0, ad + ' yok');
    let d = 0, b = false, m = j;
    for (; m < src.length; m++) {
        if (src[m] === '{') { d++; b = true; }
        else if (src[m] === '}') { d--; if (b && d === 0) { m++; break; } }
    }
    return new Function('CalibrationResult', src.slice(j, m) + '\nreturn ' + ad + ';')(CR);
}
const topla = gercek('calculateEffectiveDeviation');
const karar = gercek('getCalibrationResult');

// Kaynak PL12 formundaki GERCEK satirlar (Ankara 2025) — son sutun
// dosyanin kendi yazdigi TOPLAM SAPMA degeri
const SATIRLAR = [
    { ad: 'DİGİTAL KUMPAS',      sapma: 0,    belirsizlik: 0,       dosya: 0 },
    { ad: 'DİGİTAL MİKROMETRE',  sapma: 0,    belirsizlik: 0.001,   dosya: 0.001 },
    { ad: 'ÇELİK CETVEL',        sapma: -1.7, belirsizlik: -0.27,   dosya: 1.97 },
    { ad: 'TERAZİ-DEPO',         sapma: -0.3, belirsizlik: -0.0514, dosya: 0.3514 },
    { ad: 'HASSAS TERAZİ',       sapma: 0,    belirsizlik: 0.0056,  dosya: 0.0056 },
    { ad: 'KALINLIK KOMPARATÖRÜ',sapma: 0,    belirsizlik: 0.01,    dosya: 0.01 },
    { ad: 'MANUEL KUMPAS',       sapma: -0.2, belirsizlik: -0.2,    dosya: 0.4 }
];

// 1) Her satir kaynak dosyanin yazdigi toplamla ayni cikmali
{
    const yanlis = SATIRLAR.filter(r => topla(r.sapma, r.belirsizlik) !== r.dosya)
        .map(r => r.ad + ': ' + topla(r.sapma, r.belirsizlik) + ' (dosya: ' + r.dosya + ')');
    assert.strictEqual(yanlis.length, 0, '1: ' + yanlis.join(' | '));
    console.log('✓ 1  yedi satırın hepsi kaynak dosyadaki TOPLAM SAPMA ile birebir aynı');
}

// 2) Kullanicinin isaret ettigi satir: -0,2 / -0,2 -> 0,4 (0 DEGIL)
{
    assert.strictEqual(topla(-0.2, -0.2), 0.4, '2a: ' + topla(-0.2, -0.2));
    assert.notStrictEqual(topla(-0.2, -0.2), 0, '2b: hâlâ sıfır çıkıyor');
    console.log('✓ 2  -0,2 / -0,2 → 0,4 (eskiden 0 çıkıyordu)');
}

// 3) Belirsizligin ISARETI sonucu degistirmemeli
{
    SATIRLAR.forEach(r => assert.strictEqual(
        topla(r.sapma, r.belirsizlik), topla(r.sapma, -r.belirsizlik),
        '3: ' + r.ad + ' belirsizliğin işareti sonucu değiştiriyor'));
    console.log('✓ 3  belirsizlik pozitif de negatif de yazılsa sonuç aynı');
}

// 4) Sapmanin isareti de degistirmemeli (buyukluk toplanir)
{
    assert.strictEqual(topla(1.7, 0.27), topla(-1.7, 0.27), '4');
    console.log('✓ 4  sapmanın işareti toplamı değiştirmiyor');
}

// 5) KABUL KARARI: eksik hesap uygun olmayani 'Uygun' gosterebiliyordu
{
    // sapma -0,2 · belirsizlik -0,2 · izin verilen 0,25
    const dogru = topla(-0.2, -0.2);              // 0.4
    const eskiHesap = Math.abs(-0.2) + (-0.2);     // 0 (eski formul)
    assert.strictEqual(karar(dogru, 0.25), 'Uygun Değil', '5a: doğru hesapla karar');
    assert.strictEqual(karar(eskiHesap, 0.25), 'Uygun', '5b: eski hesap');
    console.log('✓ 5  eski formül uygun OLMAYAN cihazı "Uygun" gösteriyordu — artık düzeldi');
}

// 6) Ondalik gurultusu temizleniyor
{
    assert.strictEqual(topla(0.1, 0.2), 0.3, '6: ' + topla(0.1, 0.2));
    console.log('✓ 6  kayan nokta gürültüsü temizleniyor (0,1 + 0,2 = 0,3)');
}

// 7) Bos / gecersiz deger sifir sayilir
{
    assert.strictEqual(topla(null, undefined), 0, '7a');
    assert.strictEqual(topla('abc', ''), 0, '7b');
    assert.strictEqual(topla(-0.5, null), 0.5, '7c');
    console.log('✓ 7  boş veya geçersiz değerler sıfır sayılıyor');
}

console.log('\nTüm senaryolar geçti.');
