// Kalibrasyon: Sanifoam lokasyonlarinin mevcut ayarlara eklenmesi.
// Onemli olan: var olan konumlar KORUNMALI ve goc BIR KEZ calismali
// (yoksa kullanicinin sildigi konum her acilista geri gelir).
const fs = require('fs'), assert = require('assert');
const P = 'C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/index.html';
const src = fs.readFileSync(P, 'utf8');

// Gocun govdesini dosyadan cek ve calistirilabilir hale getir
const i = src.indexOf('// Sanifoam lokasyonlarını mevcut ayarlara BİR KEZ ekle.');
assert(i > 0, 'göç bloğu yok');
const blok = src.slice(i, src.indexOf('}, []);', i) + 7);
const govde = blok.slice(blok.indexOf('useEffect(() => {') + 'useEffect(() => {'.length,
    blok.lastIndexOf('}, []);')).replace(/\}\s*$/, '');

function goc(settings) {
    let yazilan = null;
    const setSettings = f => { yazilan = f(settings); };
    new Function('settings', 'setSettings', govde)(settings, setSettings);
    return yazilan;
}

const STANDART = ['Çerkezköy', 'Ankara', 'Eskişehir', 'Sakarya', 'Adana', 'Bursa'];

// 1) Kullanicinin mevcut konumlari KORUNUR, eksikler eklenir
{
    const r = goc({ locations: ['Çerkezköy', 'Laboratuvar'], baskaAyar: 'x' });
    assert(r, '1a: göç çalışmadı');
    ['Çerkezköy', 'Laboratuvar'].forEach(l =>
        assert(r.locations.includes(l), '1b: mevcut konum silindi: ' + l));
    STANDART.forEach(l => assert(r.locations.includes(l), '1c: eklenmedi: ' + l));
    assert.strictEqual(r.baskaAyar, 'x', '1d: diğer ayarlar bozuldu');
    console.log('✓ 1  mevcut konumlar korunuyor, eksik şehirler ekleniyor');
}

// 2) Zaten var olan tekrar EKLENMEZ
{
    const r = goc({ locations: ['Çerkezköy', 'Ankara'] });
    const cerkez = r.locations.filter(l => l === 'Çerkezköy').length;
    const ankara = r.locations.filter(l => l === 'Ankara').length;
    assert.strictEqual(cerkez, 1, '2a: Çerkezköy ' + cerkez + ' kez');
    assert.strictEqual(ankara, 1, '2b: Ankara ' + ankara + ' kez');
    console.log('✓ 2  zaten var olan konum tekrarlanmıyor');
}

// 3) Goc BIR KEZ calisir: ikinci acilista dokunmaz
{
    const ilk = goc({ locations: ['Çerkezköy'] });
    assert.strictEqual(ilk.konumSurum, 2, '3a: sürüm damgası konmadı');
    const ikinci = goc(ilk);
    assert.strictEqual(ikinci, null, '3b: göç ikinci kez çalıştı');
    console.log('✓ 3  göç bir kez çalışıyor, sonraki açılışlarda dokunmuyor');
}

// 4) Kullanici bir konumu SILERSE geri gelmez (asil fark bu)
{
    const ilk = goc({ locations: ['Çerkezköy'] });
    const silinmis = { ...ilk, locations: ilk.locations.filter(l => l !== 'Adana') };
    const sonra = goc(silinmis);
    assert.strictEqual(sonra, null, '4a: silme sonrası göç yine çalıştı');
    assert(!silinmis.locations.includes('Adana'), '4b: silinen konum geri geldi');
    console.log('✓ 4  silinen konum geri gelmiyor (departman göçünden farkı)');
}

// 5) Konum listesi hic yoksa cokmez
{
    const r = goc({});
    STANDART.forEach(l => assert(r.locations.includes(l), '5: ' + l));
    console.log('✓ 5  ayarda konum listesi yokken de çalışıyor');
}

// 6) Yeni kurulumun varsayilaninda da sehirler var
{
    const m = src.match(/locations: \[([^\]]*)\]/);
    assert(m, '6a: varsayılan liste bulunamadı');
    STANDART.forEach(l => assert(m[1].includes(l), '6b: varsayılanda yok: ' + l));
    ['Laboratuvar', 'Atölye', 'Saha'].forEach(l =>
        assert(m[1].includes(l), '6c: eski varsayılan silinmiş: ' + l));
    console.log('✓ 6  yeni kurulum varsayılanında şehirler var, eskiler duruyor');
}

console.log('\nTüm senaryolar geçti.');
