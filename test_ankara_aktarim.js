// Ankara kontrol plani ice aktarilinca Cerkezkoy BOZULMAMALI ve
// dogrulamalar KENDI konumundaki celik cetvele baglanmali.
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync('C:/Users/User/Desktop/_erp_deploy/kalibrasyon-clone/index.html', 'utf8');

// Referans atama etkisinin GERCEK govdesini cek
const i = src.indexOf('// Doğrulama kayıtlarına referans cihaz ata');
assert(i > 0, 'referans atama bloğu yok');
const blok = src.slice(i, src.indexOf('}, [instruments]);', i) + 18);
const govde = blok.slice(blok.indexOf('useEffect(() => {') + 17, blok.lastIndexOf('}, [instruments]);'));

function referanslariAta(instruments, calibrationRecords) {
    let sonuc = calibrationRecords;
    const RecordType = { CALIBRATION: 'Kalibrasyon', VERIFICATION: 'Doğrulama' };
    const setCalibrationRecords = f => { sonuc = f(calibrationRecords); };
    new Function('instruments', 'calibrationRecords', 'setCalibrationRecords', 'RecordType',
        'Map', 'String', 'Number',
        govde)(instruments, calibrationRecords, setCalibrationRecords, RecordType, Map, String, Number);
    return sonuc;
}

// Cerkezkoy'de zaten olan
const CERKEZKOY = [
    { id: 'ÇC01', name: 'ÇELİK CETVEL/LABORATUVAR', serialNumber: '20244561', location: 'Çerkezköy' },
    { id: 'KUM02', name: "1000mm'lik MANUEL KUMPAS", serialNumber: '20244562', location: 'Çerkezköy' },
    { id: 'SM-C1', name: 'ŞERİT METRE', serialNumber: 'SMC-1', location: 'Çerkezköy' }
];
// Ankara'dan gelecek olanlar (Excel'deki gercek degerler)
const ANKARA = [
    { id: 'A-CC', name: 'ÇELİK CETVEL', serialNumber: 'ÇC01', location: 'Ankara' },
    { id: 'A-TER', name: 'HASSAS TERAZİ', serialNumber: '607134', location: 'Ankara' },
    { id: 'A-SM1', name: 'ŞERİTMETRE', serialNumber: 'SM-01', location: 'Ankara' },
    { id: 'A-SM2', name: 'ŞERİTMETRE', serialNumber: 'SM-02', location: 'Ankara' }
];

// 1) Ankara dogrulamalari ANKARA celik cetveline baglanir
{
    const kayitlar = [
        { id: 'r1', instrumentId: 'A-SM1', recordType: 'Doğrulama', referenceInstrumentId: null },
        { id: 'r2', instrumentId: 'A-SM2', recordType: 'Doğrulama', referenceInstrumentId: null }
    ];
    const r = referanslariAta([...CERKEZKOY, ...ANKARA], kayitlar);
    r.forEach(x => assert.strictEqual(x.referenceInstrumentId, 'A-CC',
        '1: Ankara doğrulaması ' + x.referenceInstrumentId + ' referansına bağlandı (A-CC olmalı)'));
    console.log('✓ 1  Ankara doğrulamaları ANKARA çelik cetveline bağlanıyor');
}

// 2) Cerkezkoy dogrulamalari ESKISI GIBI Cerkezkoy referansinda kalir
{
    const kayitlar = [{ id: 'r3', instrumentId: 'SM-C1', recordType: 'Doğrulama', referenceInstrumentId: null }];
    const r = referanslariAta([...CERKEZKOY, ...ANKARA], kayitlar);
    assert.strictEqual(r[0].referenceInstrumentId, 'ÇC01', '2: Çerkezköy referansı değişti');
    console.log('✓ 2  Çerkezköy doğrulamaları eskisi gibi Çerkezköy referansında');
}

// 3) ZATEN referansi olan kayda DOKUNULMAZ
{
    const kayitlar = [{ id: 'r4', instrumentId: 'SM-C1', recordType: 'Doğrulama', referenceInstrumentId: 'ELLE-SECILEN' }];
    const r = referanslariAta([...CERKEZKOY, ...ANKARA], kayitlar);
    assert.strictEqual(r[0].referenceInstrumentId, 'ELLE-SECILEN', '3: elle seçilen referans ezildi');
    console.log('✓ 3  elle seçilmiş referans ezilmiyor');
}

// 4) Kalibrasyon kayitlarina referans atanmaz
{
    const kayitlar = [{ id: 'r5', instrumentId: 'A-TER', recordType: 'Kalibrasyon', referenceInstrumentId: null }];
    const r = referanslariAta([...CERKEZKOY, ...ANKARA], kayitlar);
    assert.strictEqual(r[0].referenceInstrumentId, null, '4: kalibrasyona referans atandı');
    console.log('✓ 4  kalibrasyon kayıtlarına referans atanmıyor');
}

// 5) Konumunda celik cetvel YOKSA eski davranisa duser (kayip kalmaz)
{
    const kayitlar = [{ id: 'r6', instrumentId: 'B-SM', recordType: 'Doğrulama', referenceInstrumentId: null }];
    const cihazlar = [...CERKEZKOY, { id: 'B-SM', name: 'ŞERİTMETRE', serialNumber: 'X1', location: 'Bursa' }];
    const r = referanslariAta(cihazlar, kayitlar);
    assert.strictEqual(r[0].referenceInstrumentId, 'ÇC01',
        '5: çelik cetveli olmayan konumda referans boş kaldı');
    console.log('✓ 5  o konumda çelik cetvel yoksa varsayılana düşüyor, boş kalmıyor');
}

// 6) Turkce buyuk harf tuzagi: 'ÇELİK CETVEL' eslesiyor mu
{
    const kayitlar = [{ id: 'r7', instrumentId: 'A-SM1', recordType: 'Doğrulama', referenceInstrumentId: null }];
    // Ankara cetvelinin adi tamamen BUYUK harfli — eski toLowerCase yaklasimi
    // noktali i yuzunden burada eslesmezdi
    const r = referanslariAta([...CERKEZKOY, ...ANKARA], kayitlar);
    assert.strictEqual(r[0].referenceInstrumentId, 'A-CC', '6: ÇELİK CETVEL adı eşleşmedi');
    console.log('✓ 6  "ÇELİK CETVEL" (büyük harf) adı doğru eşleşiyor');
}

// 7) Ice aktarma BIRLESTIRIYOR mu (mevcut cihaz/kayit korunuyor mu)
{
    assert(/let finalInstruments = instruments\.map\(inst =>/.test(src),
        '7a: içe aktarma mevcut cihazlardan başlamıyor (ezme riski)');
    assert(/const allRecords = \[\.\.\.calibrationRecords, \.\.\.newRecords\]/.test(src),
        '7b: kayıtlar ekleme değil, değiştirme yapıyor');
    console.log('✓ 7  içe aktarma mevcut cihaz ve kayıtların üzerine EKLİYOR');
}

// 8) Eslesme SERI NO'ya gore: Ankara serileri Cerkezkoy ile cakismiyor
{
    const cerkezSeri = CERKEZKOY.map(c => c.serialNumber);
    const ankaraSeri = ['607134', '9102415255', '8059706', 'ÇC01', 'ADD01543I', '66655367',
        '37180517306', ...Array.from({ length: 20 }, (_, n) => 'SM-' + String(n + 1).padStart(2, '0'))];
    const cakisan = ankaraSeri.filter(s => cerkezSeri.includes(s));
    assert.strictEqual(cakisan.length, 0, '8: seri no çakışması — Çerkezköy ezilir: ' + cakisan);
    console.log('✓ 8  Ankara seri numaraları Çerkezköy ile çakışmıyor (' + ankaraSeri.length + ' kayıt)');
}

console.log('\nTüm senaryolar geçti.');
