// Konum secimi UC EKRANDA ORTAK olmali: gosterge panelinde Ankara
// secilince Cihazlar ve Tum Kayitlar da Ankara suzgeciyle gelmeli ve
// secim degistirilene kadar (sayfa yenilense de) korunmali.
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync('C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/index.html', 'utf8');

function imza(bilesen) {
    const i = src.indexOf('const ' + bilesen + ' = (');
    assert(i > 0, bilesen + ' yok');
    return src.slice(i, src.indexOf('}) =>', i) + 5);
}
function govde(bilesen) {
    const i = src.indexOf('const ' + bilesen + ' = (');
    let d = 0, b = false, k = src.indexOf('{', src.indexOf('}) =>', i));
    const bas = k;
    for (; k < src.length; k++) {
        if (src[k] === '{') { d++; b = true; }
        else if (src[k] === '}') { d--; if (b && d === 0) { k++; break; } }
    }
    return src.slice(bas, k);
}

// 1) Tek kaynak: uygulama duzeyinde ve KALICI
{
    assert(/const \[seciliKonum, setSeciliKonum\] = useLocalStorage\('seciliKonum', ''\)/.test(src),
        '1a: ortak konum durumu yok veya kalıcı değil');
    console.log('✓ 1  konum tek yerde tutuluyor ve localStorage\'da kalıcı');
}

// 2) Uc ekrana da geciriliyor
{
    ['Dashboard', 'InstrumentList', 'AllCalibrationsView'].forEach(b => {
        assert(/seciliKonum/.test(imza(b)), '2a: ' + b + ' ortak konumu almıyor');
        assert(/setSeciliKonum/.test(imza(b)), '2b: ' + b + ' ortak konumu değiştiremiyor');
    });
    const geciren = (src.match(/seciliKonum: seciliKonum, setSeciliKonum: setSeciliKonum/g) || []).length;
    assert.strictEqual(geciren, 3, '2c: ' + geciren + ' ekrana geçiriliyor (3 olmalı)');
    console.log('✓ 2  gösterge paneli, cihazlar ve tüm kayıtlar aynı değeri alıyor');
}

// 3) Gosterge paneli kendi ic durumunu KULLANMIYOR
{
    const g = govde('Dashboard');
    assert(!/useState\(''\)/.test(g.slice(0, 600)), '3a: hâlâ kendi iç durumu var');
    assert(/const konum = seciliKonum/.test(g), '3b: ortak değeri kullanmıyor');
    assert(/const setKonum = setSeciliKonum/.test(g), '3c: değişiklik ortak değere yazılmıyor');
    console.log('✓ 3  panel kendi iç durumunu bıraktı, ortak değeri kullanıyor');
}

// 4) Cihazlar: baslangic ve DEGISIKLIGE uyum
{
    const g = govde('InstrumentList');
    assert(/location: seciliKonum \|\| ''/.test(g), '4a: başlangıç değeri ortak konumdan gelmiyor');
    assert(/useEffect\(\(\) => \{[\s\S]{0,200}prev\.location === \(seciliKonum \|\| ''\)/.test(g),
        '4b: başka ekranda değişince uymuyor');
    assert(/setSeciliKonum\(ev\.target\.value\)/.test(g), '4c: buradaki seçim ortak değere yazılmıyor');
    console.log('✓ 4  cihazlar ekranı ortak konumla açılıyor ve değişimi yansıtıyor');
}

// 5) Tum Kayitlar: ayni sekilde
{
    const g = govde('AllCalibrationsView');
    assert(/location: seciliKonum \|\| ''/.test(g), '5a: başlangıç değeri');
    assert(/prev\.location === \(seciliKonum \|\| ''\)/.test(g), '5b: değişime uyum');
    assert(/setSeciliKonum\(ev\.target\.value\)/.test(g), '5c: geri yazma');
    console.log('✓ 5  tüm kayıtlar ekranı da ortak konumla çalışıyor');
}

// 6) Panel kartina tiklayip Cihazlar'a gecince konum KAYBOLMUYOR
{
    const g = govde('InstrumentList');
    // initialFilter ile gelen varsayilanlar konumu sifirlamamali
    const m = g.match(/const defaultFilters = \{[\s\S]*?\};/);
    assert(m, '6a: varsayılan süzgeçler bulunamadı');
    assert(/location: seciliKonum \|\| ''/.test(m[0]),
        '6b: ekran geçişinde konum sıfırlanıyor: ' + m[0].replace(/\s+/g, ' '));
    console.log('✓ 6  panelden cihazlara geçişte konum korunuyor');
}

// 7) "Filtreyi Temizle" ortak secimi de sifirliyor
{
    const g = govde('InstrumentList');
    assert(/setSeciliKonum\(''\); setFilters\(\{ searchTerm: ''/.test(g),
        '7: temizleme ortak konumu sıfırlamıyor');
    console.log('✓ 7  "Filtreyi Temizle" ortak seçimi de sıfırlıyor');
}

// 8) Kayitlar ekraninda initialFilter konumu EZMIYOR (varsa oncelik onda)
{
    const g = govde('AllCalibrationsView');
    assert(/location: initialFilter\?\.location \|\| seciliKonum \|\| ''/.test(g),
        '8: initialFilter ile ortak konum sırası yanlış');
    console.log('✓ 8  belirli bir süzgeçle gelindiyse o öncelikli, yoksa ortak konum');
}

console.log('\nTüm senaryolar geçti.');
