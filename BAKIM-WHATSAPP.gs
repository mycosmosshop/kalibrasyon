/**
 * BAKIM HATIRLATMA — WhatsApp (otomatik)
 * ======================================
 * Yaklasan ve gecikmis bakimlari saatlik tetikleyiciyle kontrol eder,
 * gunde bir kez teknisyene WhatsApp mesaji gonderir. Uygulama kapali olsa
 * da calisir: veri Drive'daki anlik kopyadan okunur.
 *
 * GONDERIM YOLU: CallMeBot (https://www.callmebot.com/blog/free-api-whatsapp-messages/)
 *   - WhatsApp Business hesabi GEREKMEZ, sunucu gerekmez, ucretsizdir.
 *   - ALICI bir kez izin verir ve karsiliginda bir APIKEY alir.
 *   - Mesaj, CallMeBot'un numarasindan gelir (sizin numaranizdan degil).
 *   - Ucretsiz servis: hiz siniri var (~dakikada 1) ve garantisi yoktur.
 *
 * KURULUM (bir kez):
 *  1) Alici, CallMeBot'un GUNCEL numarasini kendi telefonuna kaydeder.
 *     Bugun: +34 684 72 39 62
 *     (Onceki +34 644 51 95 23 doldu. Bot dolunca CallMeBot yenisini
 *      bildirir; numara degisir, asagidaki api adresi degismez.)
 *  2) O numaraya WhatsApp'tan TAM olarak sunu yazar:
 *       I allow callmebot to send me messages
 *     DIKKAT: "I allow callmebot to CALL me" farkli bir servistir
 *     (telefonla arama). Onun anahtariyla whatsapp.php calismaz.
 *  3) Gelen cevapta "your apikey is 123456" yazar.
 *  4) Apps Script > Proje Ayarlari > Komut Dosyasi Ozellikleri:
 *       BAKIM_WA_TEL  = +905xxxxxxxxx      (1. alici)
 *       BAKIM_WA_KEY  = 123456             (o aliciya gelen apikey)
 *     Ikinci alici icin (her alici KENDI telefonundan izin verir ve KENDI
 *     anahtarini alir — anahtar aliciya baglidir, ortak degildir):
 *       BAKIM_WA_TEL2 = +905xxxxxxxxx
 *       BAKIM_WA_KEY2 = 654321
 *     5 aliciya kadar (TEL3/KEY3 ...). Numaralar ve anahtarlar YALNIZCA
 *     burada durur — bu depo herkese acik, koda yazilmaz.
 *     Istege bagli:
 *       BAKIM_ESIK_GUN  = 7                (kac gun oncesinden haber versin)
 *       BAKIM_SAAT      = 8                (gunun hangi saatinden sonra)
 *       BAKIM_TEKNISYEN = Hasan Köse       (yalnizca onun bakimlari gitsin)
 *  5) Editorde bakimIzinVer() fonksiyonunu BIR KEZ calistir (izinler icin).
 *  6) Tetikleyiciler > bakimKontrol > Zaman esasli > Saatlik.
 *  7) bakimTestGonder() ile deneme yap. Kayitta CallMeBot'un kendi
 *     yaniti gorunur — anahtar yanlissa sebebini orada yazar.
 *
 * NOT: Anahtari koda YAZMA — bu depo herkese acik.
 */

var BAKIM_DOSYA = 'bakim-anlik.json';

/** Izinleri bir kerede almak icin: editorde bunu calistir. */
function bakimIzinVer() {
  DriveApp.getRootFolder();
  UrlFetchApp.fetch('https://www.google.com');
  PropertiesService.getScriptProperties().getProperty('BAKIM_WA_TEL');
  Logger.log('Izinler alindi.');
}

function _bakimAyar(ad, varsayilan) {
  var v = PropertiesService.getScriptProperties().getProperty(ad);
  return (v === null || v === '') ? varsayilan : v;
}

// ── Anlik kopya (Drive) ────────────────────────────────────────────
function bakimAnlikYaz(veri) {
  var icerik = JSON.stringify(veri);
  var it = DriveApp.getFilesByName(BAKIM_DOSYA);
  if (it.hasNext()) { it.next().setContent(icerik); }
  else { DriveApp.createFile(BAKIM_DOSYA, icerik, 'application/json'); }
  return true;
}

function bakimAnlikOku() {
  var it = DriveApp.getFilesByName(BAKIM_DOSYA);
  if (!it.hasNext()) return null;
  try { return JSON.parse(it.next().getBlob().getDataAsString()); }
  catch (e) { return null; }
}

// ── Gun hesabi: anlik kopya eski olsa da BUGUNE gore hesaplanir ────
function _bakimGunFarki(tarih) {
  if (!tarih) return null;
  var h = new Date(tarih + 'T00:00:00');
  if (isNaN(h.getTime())) return null;
  var b = new Date();
  b = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((h - b) / 86400000);
}

function _bakimTarihYaz(tarih) {
  var p = String(tarih).split('-');
  return p.length === 3 ? (p[2] + '.' + p[1] + '.' + p[0]) : String(tarih);
}

/**
 * Esige giren ve gecikmis bakimlar; en acilden siraya.
 * BAKIM_TEKNISYEN tanimliysa yalnizca o kisinin bakimlari alinir — yoksa
 * Ankara'daki teknisyene Cerkezkoy'un bakimlari da giderdi.
 */
function bakimYaklasanlar(veri, esikGun) {
  if (!veri || !veri.bakimlar) return [];
  var kisi = String(_bakimAyar('BAKIM_TEKNISYEN', '')).trim().toLowerCase();
  var out = [];
  for (var i = 0; i < veri.bakimlar.length; i++) {
    var b = veri.bakimlar[i];
    if (!b.tarih) continue;                       // saat bazli: gun hesabi yok
    if (kisi && String(b.tek || '').trim().toLowerCase() !== kisi) continue;
    var g = _bakimGunFarki(b.tarih);
    if (g === null || g > esikGun) continue;
    out.push({ makine: b.makine, tip: b.tip, tarih: b.tarih, tek: b.tek, gun: g });
  }
  out.sort(function (a, b) { return a.gun - b.gun; });
  return out;
}

function bakimMetni(liste, lokasyon) {
  var satir = [];
  for (var i = 0; i < liste.length && i < 15; i++) {
    var b = liste[i];
    var durum = b.gun < 0 ? (Math.abs(b.gun) + ' gun gecikmis')
              : (b.gun === 0 ? 'bugun' : (b.gun + ' gun'));
    satir.push((b.gun < 0 ? '(!) ' : '- ') + _bakimTarihYaz(b.tarih)
      + ' ' + b.makine + ' - ' + b.tip + ' (' + durum + ')');
  }
  if (liste.length > 15) satir.push('... ve ' + (liste.length - 15) + ' bakim daha');
  return 'Sanifoam Bakim' + (lokasyon ? ' - ' + lokasyon : '') + '\n'
       + 'Yaklasan / gecikmis bakimlar\n\n'
       + satir.join('\n')
       + '\n\nPlani kontrol edebilir misiniz?';
}

// ── Alicilar ───────────────────────────────────────────────────────
// CallMeBot'ta apikey ALICIYA baglidir; her alici kendi telefonundan izin
// verip kendi anahtarini alir. Bu yuzden (telefon, anahtar) cift halinde:
//   BAKIM_WA_TEL  / BAKIM_WA_KEY    (1. alici)
//   BAKIM_WA_TEL2 / BAKIM_WA_KEY2   (2. alici)  ... 5'e kadar
function bakimAlicilar() {
  var out = [];
  for (var i = 1; i <= 5; i++) {
    var ek = (i === 1) ? '' : String(i);
    var tel = _bakimAyar('BAKIM_WA_TEL' + ek, '');
    var key = _bakimAyar('BAKIM_WA_KEY' + ek, '');
    if (tel && key) out.push({ tel: tel, key: key });
  }
  return out;
}

// ── CallMeBot ile gonderim ─────────────────────────────────────────
function _waGonder(tel, metin, key) {
  key = key || _bakimAyar('BAKIM_WA_KEY', '');
  if (!key) return { ok: false, hata: 'BAKIM_WA_KEY tanimli degil' };
  if (!tel) return { ok: false, hata: 'BAKIM_WA_TEL tanimli degil' };
  var url = 'https://api.callmebot.com/whatsapp.php'
          + '?phone=' + encodeURIComponent(tel)
          + '&text=' + encodeURIComponent(metin)
          + '&apikey=' + encodeURIComponent(key);
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var kod = r.getResponseCode();
  var yanit = String(r.getContentText()).replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ').trim().slice(0, 200);
  // CallMeBot basarisizken de 200 donup hatayi GOVDEDE yazabiliyor
  // (yanlis apikey, yanlis servis, bot dolu...). Yalnizca HTTP koduna
  // bakmak basarisiz gonderimi "gonderildi" sayardi ve hatirlatma
  // sessizce hic gitmezdi — govde de kontrol edilir.
  // Kelime siniri sart: /full/ "successfully" icinde eslesir ve BASARILI
  // gonderimi hata sayardi — o aliciya her saat tekrar mesaj giderdi.
  // /fail/ de ayni sekilde tehlikeli.
  var kotu = /(invalid|unauthorized|error|failed|expired|denied)/i.test(yanit)
          || /not allowed|bot is full|apikey (is )?(invalid|missing|wrong)/i.test(yanit);
  return { ok: (kod === 200 && !kotu), kod: kod, yanit: yanit };
}

// ── Gunde bir kez, ayarli saatten sonra ────────────────────────────
function _bakimBugun() {
  return Utilities.formatDate(new Date(),
    Session.getScriptTimeZone() || 'Europe/Istanbul', 'yyyy-MM-dd');
}

function _bakimGonderimZamaniMi() {
  var saat = parseInt(_bakimAyar('BAKIM_SAAT', '8'), 10);
  var simdi = parseInt(Utilities.formatDate(new Date(),
    Session.getScriptTimeZone() || 'Europe/Istanbul', 'H'), 10);
  if (simdi < saat) return false;
  return _bakimAyar('BAKIM_SON_GONDERIM', '') !== _bakimBugun();
}

function _bakimDamgala() {
  PropertiesService.getScriptProperties()
    .setProperty('BAKIM_SON_GONDERIM', _bakimBugun());
}

/** SAATLIK TETIKLEYICI bunu cagirir. */
function bakimKontrol() {
  if (!_bakimGonderimZamaniMi()) return;
  var veri = bakimAnlikOku();
  if (!veri) { Logger.log('anlik kopya yok — CMMS bir kez acilmali'); return; }
  var esik = parseInt(_bakimAyar('BAKIM_ESIK_GUN', '7'), 10);
  var liste = bakimYaklasanlar(veri, esik);
  if (!liste.length) { _bakimDamgala(); Logger.log('yaklasan bakim yok'); return; }

  var alicilar = bakimAlicilar();
  if (!alicilar.length) {
    PropertiesService.getScriptProperties()
      .setProperty('BAKIM_SON_SONUC', 'HATA: alici tanimli degil (BAKIM_WA_TEL / BAKIM_WA_KEY)');
    return;
  }
  var metin = bakimMetni(liste, veri.lokasyon);
  var basarili = 0, hatalar = [];
  for (var i = 0; i < alicilar.length; i++) {
    var son = _waGonder(alicilar[i].tel, metin, alicilar[i].key);
    Logger.log('WhatsApp ' + alicilar[i].tel + ': ' + JSON.stringify(son));
    if (son.ok) basarili++;
    else hatalar.push(alicilar[i].tel.slice(-4) + ': ' + (son.hata || son.kod + ' ' + son.yanit));
  }
  // HEPSI basarisizsa damgalama — bir sonraki saatte yeniden denesin.
  // En az biri gittiyse damgala; yoksa gidenlere her saat tekrar mesaj gider.
  if (basarili > 0) _bakimDamgala();
  PropertiesService.getScriptProperties().setProperty('BAKIM_SON_SONUC',
    basarili + '/' + alicilar.length + ' aliciya ' + liste.length + ' bakim'
    + (hatalar.length ? ' — HATA: ' + hatalar.join(' | ') : ''));
}

/** Elle deneme: saat/gunluk kisitlari atlar, damga yazmaz. */
function bakimTestGonder() {
  var veri = bakimAnlikOku();
  if (!veri) { Logger.log('anlik kopya yok — once CMMS acilmali'); return; }
  var esik = parseInt(_bakimAyar('BAKIM_ESIK_GUN', '7'), 10);
  var liste = bakimYaklasanlar(veri, esik);
  var metin = liste.length ? bakimMetni(liste, veri.lokasyon)
    : 'Sanifoam Bakim - deneme mesaji. Su an esige giren bakim yok.';
  Logger.log(metin);
  var alicilar = bakimAlicilar();
  if (!alicilar.length) { Logger.log('alici tanimli degil'); return; }
  for (var i = 0; i < alicilar.length; i++) {
    Logger.log(alicilar[i].tel + ' >> '
      + JSON.stringify(_waGonder(alicilar[i].tel, metin, alicilar[i].key)));
  }
}

/** CMMS "Durumu kontrol et" bunu okur. */
function bakimDurumu() {
  var veri = bakimAnlikOku();
  var esik = parseInt(_bakimAyar('BAKIM_ESIK_GUN', '7'), 10);
  var tetik = false, t = ScriptApp.getProjectTriggers();
  for (var i = 0; i < t.length; i++) {
    if (t[i].getHandlerFunction() === 'bakimKontrol') tetik = true;
  }
  var alicilar = bakimAlicilar();
  var maske = [];
  for (var a = 0; a < alicilar.length; a++) {
    maske.push(alicilar[a].tel.slice(0, 4) + '****' + alicilar[a].tel.slice(-2));
  }
  return {
    tetikleyici: tetik,
    anahtarVar: alicilar.length > 0,
    aliciSayisi: alicilar.length,
    telefon: maske.join(', '),
    esikGun: esik,
    saat: parseInt(_bakimAyar('BAKIM_SAAT', '8'), 10),
    teknisyen: _bakimAyar('BAKIM_TEKNISYEN', ''),
    anlikZaman: veri ? veri.zaman : '',
    bakimSayisi: veri && veri.bakimlar ? veri.bakimlar.length : 0,
    yaklasan: veri ? bakimYaklasanlar(veri, esik).length : 0,
    sonGonderim: _bakimAyar('BAKIM_SON_GONDERIM', ''),
    sonSonuc: _bakimAyar('BAKIM_SON_SONUC', '')
  };
}
