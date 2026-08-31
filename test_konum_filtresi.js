// Konum filtresi: Gosterge Paneli, Cihazlar, Tum Kayitlar.
// Kaynaktan cekilen GERCEK ifadelerle calistirilir.
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync('C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/index.html', 'utf8');

const CIHAZ = [
    { id: 'A1', location: 'Çerkezköy', department: 'Kalite', status: 'Tamam', name: 'kumpas', serialNumber: '1' },
    { id: 'A2', location: 'Ankara', department: 'Kalite', status: 'Gecikmiş', name: 'mikrometre', serialNumber: '2' },
    { id: 'A3', location: 'Bursa', department: 'Üretim', status: 'Tamam', name: 'terazi', serialNumber: '3' },
    { id: 'A4', location: '', department: 'Üretim', status: 'Tamam', name: 'komparatör', serialNumber: '4' }
];
const KAYIT = [
    { instrumentId: 'A1', result: 'Uygun', recordType: 'Kalibrasyon' },
    { instrumentId: 'A2', result: 'Uygun Değil', recordType: 'Kalibrasyon' },
    { instrumentId: 'A3', result: 'Uygun', recordType: 'Doğrulama' },
    { instrumentId: 'A9', result: 'Uygun', recordType: 'Doğrulama' }   // silinmiş cihaz
];

// 1) Gosterge paneli: cihazlar VE kayitlar birlikte suzuluyor
{
    // Kaynaktaki gercek ifadeler
    const cihazIf = src.match(/konum \? _tumCihazlar\.filter\(i => i\.location === konum\) : _tumCihazlar/);
    const kayitIf = src.match(/konum \? _tumKayitlar\.filter\(r => _kimlikler\.has\(r\.instrumentId\)\) : _tumKayitlar/);
    assert(cihazIf, '1a: panelde cihaz süzgeci yok');
    assert(kayitIf, '1b: panelde kayıt süzgeci yok');

    const suz = (konum) => {
        const _tumCihazlar = CIHAZ, _tumKayitlar = KAYIT;
        const cihazlar = konum ? _tumCihazlar.filter(i => i.location === konum) : _tumCihazlar;
        const _kimlikler = new Set(cihazlar.map(i => i.id));
        const kayitlar = konum ? _tumKayitlar.filter(r => _kimlikler.has(r.instrumentId)) : _tumKayitlar;
        return { cihazlar, kayitlar };
    };
    const hepsi = suz('');
    assert.strictEqual(hepsi.cihazlar.length, 4, '1c');
    assert.strictEqual(hepsi.kayitlar.length, 4, '1d');
    const ank = suz('Ankara');
    assert.deepStrictEqual(ank.cihazlar.map(c => c.id), ['A2'], '1e: cihaz süzülmedi');
    assert.deepStrictEqual(ank.kayitlar.map(r => r.instrumentId), ['A2'],
        '1f: kayıtlar cihazla birlikte süzülmedi');
    console.log('✓ 1  panelde konum seçilince cihazlar VE kayıtlar birlikte süzülüyor');
}

// 2) Panelde secilen konumun kayitlari, silinmis cihaz kaydini getirmez
{
    const cihazlar = CIHAZ.filter(i => i.location === 'Bursa');
    const kimlikler = new Set(cihazlar.map(i => i.id));
    const kayitlar = KAYIT.filter(r => kimlikler.has(r.instrumentId));
    assert.deepStrictEqual(kayitlar.map(r => r.instrumentId), ['A3'], '2');
    console.log('✓ 2  cihazı silinmiş kayıt (A9) konum süzgecinde görünmüyor');
}

// 3) Cihaz listesi: konum kosulu departman/durumla BIRLIKTE calisir
{
    assert(/\(filters\.location === '' \|\| instrument\.location === filters\.location\)/.test(src),
        '3a: cihaz süzgecinde konum koşulu yok');
    const uygula = (f) => CIHAZ.filter(instrument =>
        (f.status === '' || instrument.status === f.status) &&
        (f.department === '' || instrument.department === f.department) &&
        (f.location === '' || instrument.location === f.location));
    assert.strictEqual(uygula({ status: '', department: '', location: '' }).length, 4, '3b');
    assert.deepStrictEqual(uygula({ status: '', department: '', location: 'Çerkezköy' })
        .map(c => c.id), ['A1'], '3c');
    assert.deepStrictEqual(uygula({ status: 'Tamam', department: 'Kalite', location: 'Çerkezköy' })
        .map(c => c.id), ['A1'], '3d: birlikte çalışmıyor');
    assert.strictEqual(uygula({ status: 'Gecikmiş', department: '', location: 'Bursa' }).length, 0,
        '3e: çelişen süzgeç sonuç döndürdü');
    console.log('✓ 3  cihazlarda konum, departman ve durum birlikte çalışıyor');
}

// 4) Konum listesi cihazlardan turetiliyor, bos deger atiliyor
{
    assert(/const locations = useMemo\(\(\) => \[\.\.\.new Set\(instruments\.map\(i => i\.location\)\.filter\(Boolean\)\)\]/
        .test(src), '4a: konum listesi türetilmiyor');
    const liste = [...new Set(CIHAZ.map(i => i.location).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'tr'));
    assert.deepStrictEqual(liste, ['Ankara', 'Bursa', 'Çerkezköy'], '4b: liste/sıra: ' + liste);
    assert(!liste.includes(''), '4c: boş konum listeye girmiş');
    console.log('✓ 4  konum listesi cihazlardan türetiliyor, Türkçe sıralı, boş atılıyor');
}

// 5) Kayitlar: kaydin kendi konumu yok, CIHAZIN konumuna gore suzuluyor
{
    assert(/instrumentLocation: instrument\.location \|\| ''/.test(src),
        '5a: kayda cihaz konumu eklenmiyor');
    assert(/filtered = filtered\.filter\(r => r\.instrumentLocation === filters\.location\)/.test(src),
        '5b: kayıt süzgecinde konum yok');
    const detayli = KAYIT.map(r => ({ ...r,
        instrumentLocation: (CIHAZ.find(i => i.id === r.instrumentId) || { location: '' }).location || '' }));
    const bursa = detayli.filter(r => r.instrumentLocation === 'Bursa');
    assert.deepStrictEqual(bursa.map(r => r.instrumentId), ['A3'], '5c');
    console.log('✓ 5  kayıtlar bağlı oldukları cihazın konumuna göre süzülüyor');
}

// 6) Silinmis cihazin kaydi COKMEZ (yedek nesnede location var)
{
    assert(/\{ name: 'Bilinmeyen Cihaz', serialNumber: 'N\/A', location: '' \}/.test(src),
        '6: yedek cihaz nesnesinde location yok — undefined okunur');
    console.log('✓ 6  cihazı bulunamayan kayıtta konum boş, çökme yok');
}

// 7) "Filtreyi Temizle" konumu da sifirliyor
{
    const m = src.match(/setFilters\(\{ searchTerm: '', status: '', department: '',[^}]*\}\)/);
    assert(m, '7a: temizleme bulunamadı');
    assert(/location: ''/.test(m[0]), '7b: temizleme konumu sıfırlamıyor');
    console.log('✓ 7  "Filtreyi Temizle" konum seçimini de sıfırlıyor');
}

console.log('\nTüm senaryolar geçti.');
