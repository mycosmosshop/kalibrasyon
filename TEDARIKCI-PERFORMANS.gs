/***** TEDARİKÇİ PERFORMANS MAİLİ (Google Apps Script) *****
 * Senin KURUMSAL (Sanifoam) adresinden gönderir. Apps Script SMTP
 * konuşamaz; Gmail'in "Farklı gönder" (alias) özelliği kullanılır —
 * bkz. GONDEREN_ADRES bölümü. Alias hazır değilse HİÇBİR mail gitmez.
 *
 * AKIŞ — onaysız hiçbir mail dışarı çıkmaz:
 *   1) ERP'de "📧 Performans Bildirimi → Listeyi hazırla ve onayla"
 *      dersin ve GÖNDERİM TARİHİNİ sen seçersin. Liste Drive'a
 *      PERFORMANS_KUYRUK.json olarak yazılır (durum: 'onaylandi').
 *   2) Saatlik tetikleyici kuyruğa bakar. Seçtiğin tarih gelmediyse
 *      BEKLER; geldiğinde mailleri GÖNDERİR, her birini "gonderildi"
 *      işaretler ve sana gönderim raporu atar.
 *
 * Takvim çeyreği dayatması yoktur: tarihi kullanıcı belirler.
 *
 * Tedarikçi verisi Supabase'de değil Drive'da durur (kural: Supabase
 * şişirilmeyecek). Bu yüzden hesabı ERP yapar, bu betik yalnızca hazır
 * kuyruğu okuyup gönderir — kendi başına performans hesaplamaz.
 *
 * KURULUM:
 *   - script.google.com → Drive betiğinin OLDUĞU projeye bu dosyayı ekle
 *     (Drive klasörüne erişimi zaten var).
 *   - Proje Ayarları → Komut Dosyası Özellikleri → GONDEREN_ADRES = kurumsal adresin.
 *   - Bir kez kurulum() fonksiyonunu çalıştır → saatlik tetikleyici kurar.
 *   - Test için: kuyrukDurumu() çalıştır, Yürütme günlüğüne bak.
 ********************************************************************************/

var PERF_DOSYA   = 'PERFORMANS_KUYRUK.json';
var PERF_KLASOR  = '';   // bos = Drive kokunde ara; Drive betigindeki klasor ID'si varsa yaz

// ── Kurulum: saatlik tetikleyici ───────────────────────────────────
function kurulum() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'gonderimKontrol') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('gonderimKontrol').timeBased().everyHours(1).create();
  Logger.log('Saatlik tetikleyici kuruldu.');
}

// ── Yardimcilar ────────────────────────────────────────────────────
function _benimAdresim() {
  return Session.getEffectiveUser().getEmail();
}

// ── GONDEREN ADRES (kurumsal) ──────────────────────────────────────
// Tedarikci maili SANIFOAM adresinden gitmeli: kisisel Gmail'den gitmesi
// hem kurumsal gorunmez hem de yanitlar yanlis kutuya duser.
//
// Apps Script SMTP konusamaz; tek yol Gmail'in "Farkli gonder" (alias)
// ozelligi. Kurulum (bir kez):
//   Gmail → ⚙ Ayarlar → Hesaplar ve Ice Aktarma → "Farkli bir adresten
//   posta gonder" → Sanifoam adresini ekle → dogrulama kodunu gir.
//   (Sanifoam Google Workspace'te ise bu betigi dogrudan o hesapta
//   calistirmak yeterli, alias gerekmez.)
// Sonra: Apps Script → ⚙ Proje Ayarlari → Komut Dosyasi Ozellikleri →
//   GONDEREN_ADRES = <kurumsal adresin>            (ornek: kalite@firma.com)
var PERF_GONDEREN_ANAHTAR = 'GONDEREN_ADRES';

function _gonderenAdres() {
  return String(PropertiesService.getScriptProperties()
    .getProperty(PERF_GONDEREN_ANAHTAR) || '').trim();
}

// Gonderim ONCESI dogrula. Alias tanimli degilse GONDERME:
// sessizce Gmail'e dusmek, kullanicinin istemedigi adresten tedarikciye
// mail gitmesi demek ve geri alinamaz.
function _gonderenDogrula() {
  var istenen = _gonderenAdres();
  var hesap = _benimAdresim();
  if (!istenen) {
    return { ok: false, sebep: PERF_GONDEREN_ANAHTAR + ' tanımlı değil. '
      + 'Apps Script → Proje Ayarları → Komut Dosyası Özellikleri → '
      + PERF_GONDEREN_ANAHTAR + ' = kurumsal adresin.' };
  }
  if (istenen.toLowerCase() === String(hesap).toLowerCase()) {
    return { ok: true, from: null, adres: hesap };   // zaten o hesaptayiz
  }
  var aliaslar = GmailApp.getAliases() || [];
  var bulundu = aliaslar.filter(function (a) {
    return String(a).toLowerCase() === istenen.toLowerCase();
  }).length > 0;
  if (!bulundu) {
    return { ok: false, sebep: istenen + ' bu Gmail hesabında "Farklı gönder" adresi '
      + 'olarak tanımlı değil. Gmail → Ayarlar → Hesaplar ve İçe Aktarma → '
      + '"Farklı bir adresten posta gönder" ile ekleyip doğrulaman gerekiyor. '
      + 'Tanımlı adresler: ' + (aliaslar.join(', ') || '(yok)') };
  }
  return { ok: true, from: istenen, adres: istenen };
}

// Bugunun YEREL takvim gunu, YYYY-AA-GG. toISOString UTC'ye cevirir ve
// gece yarisi civari bir onceki gunu verir; erken gonderim olmasin.
function _bugunStr() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function _dosyaBul() {
  var it = PERF_KLASOR
    ? DriveApp.getFolderById(PERF_KLASOR).getFilesByName(PERF_DOSYA)
    : DriveApp.getFilesByName(PERF_DOSYA);
  return it.hasNext() ? it.next() : null;
}

function _kuyrukOku() {
  var f = _dosyaBul();
  if (!f) return null;
  try { return JSON.parse(f.getBlob().getDataAsString('UTF-8')); }
  catch (e) { return null; }
}

function _kuyrukYaz(k) {
  var f = _dosyaBul();
  var icerik = JSON.stringify(k);
  if (f) f.setContent(icerik);
  else DriveApp.createFile(PERF_DOSYA, icerik, MimeType.PLAIN_TEXT);
}

function _damga(anahtar) {
  return PropertiesService.getScriptProperties().getProperty(anahtar) || '';
}
function _damgala(anahtar, deger) {
  PropertiesService.getScriptProperties().setProperty(anahtar, deger);
}

// ── Mail govdesi (gonder.py ile AYNI icerik) ──────────────────────
function _sayi(n) {
  var x = Number(n);
  if (isNaN(x)) return String(n);
  return Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function _durumMetni(gercek, hedef) {
  if (!hedef) return '<span style="color:#6b7280">Hedef tanımlı değil</span>';
  if (gercek <= hedef) return '<span style="color:#1e7e34;font-weight:600">Hedef içinde</span>';
  return '<span style="color:#c0392b;font-weight:600">Hedef aşıldı</span>';
}

function _govde(r, donem) {
  var H = 'padding:7px 10px;border:1px solid #dfe3e8';
  var S = H + ';text-align:right';
  var aylar = r.aylar || [];

  var satirlar = '';
  var ts = 0, ti = 0;
  aylar.forEach(function (a) {
    ts += Number(a.sevk) || 0;
    ti += Number(a.iade) || 0;
    satirlar += '<tr><td style="' + H + '">' + (a.ad || '') + '</td>'
      + '<td style="' + S + '">' + _sayi(a.sevk) + '</td>'
      + '<td style="' + S + '">' + _sayi(a.iade) + '</td>'
      + '<td style="' + S + '">' + _sayi(a.ppm) + '</td>'
      + '<td style="' + S + '">' + _sayi(a.hata) + '</td></tr>';
  });

  var ayTablo = '';
  if (satirlar) {
    ayTablo = '<p style="margin:18px 0 6px;font-weight:600">Aylık döküm</p>'
      + '<table style="border-collapse:collapse;width:100%;font-size:13px">'
      + '<thead><tr style="background:#f4f6f8">'
      + '<th style="' + H + ';text-align:left">Ay</th>'
      + '<th style="' + S + '">Sevkiyat</th><th style="' + S + '">İade</th>'
      + '<th style="' + S + '">PPM</th><th style="' + S + '">Hata</th>'
      + '</tr></thead><tbody>' + satirlar
      + '<tr style="background:#fafbfc;font-weight:600">'
      + '<td style="' + H + '">Toplam</td>'
      + '<td style="' + S + '">' + _sayi(ts) + '</td>'
      + '<td style="' + S + '">' + _sayi(ti) + '</td>'
      + '<td style="' + S + '">' + _sayi(r.ppm) + '</td>'
      + '<td style="' + S + '">' + _sayi(r.hata) + '</td></tr>'
      + '</tbody></table>';
  }

  function hsat(baslik, gercek, hedef, birim) {
    return '<tr><td style="' + H + '">' + baslik + '</td>'
      + '<td style="' + S + '">' + _sayi(gercek) + birim + '</td>'
      + '<td style="' + S + '">' + _sayi(hedef) + birim + '</td>'
      + '<td style="' + H + ';text-align:center">' + _durumMetni(gercek, hedef) + '</td></tr>';
  }

  return '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2937;max-width:720px">'
    + '<p>Sayın Yetkili,</p>'
    + '<p><b>' + (r.ad || '') + '</b> firmasının <b>' + (r.yil || '') + ' '
    + (r.donemAdi || '') + '</b> dönemi tedarikçi performans değerlendirmesi aşağıdadır.</p>'
    + ayTablo
    + '<p style="margin:18px 0 6px;font-weight:600">Hedef karşılaştırması</p>'
    + '<table style="border-collapse:collapse;width:100%;font-size:13px">'
    + '<thead><tr style="background:#f4f6f8">'
    + '<th style="' + H + ';text-align:left">Kriter</th>'
    + '<th style="' + S + '">Gerçekleşme</th><th style="' + S + '">Hedef</th>'
    + '<th style="' + H + '">Durum</th></tr></thead><tbody>'
    + hsat('PPM (Parça Per Million)', r.ppm, r.ppmHedef, '')
    + hsat('Hata Tekrarı', r.hata, r.hataHedef, ' adet')
    + '</tbody></table>'
    + '<p>Değerlendirme ile ilgili sorularınız için bize dönebilirsiniz.</p>'
    + '<p>İyi çalışmalar,<br><b>Sanifoam Kalite Yönetimi</b></p>'
    + '</div>';
}

// ── Saatlik tetikleyici ────────────────────────────────────────────
function gonderimKontrol() {
  var k = _kuyrukOku();
  if (!k) return;
  if (k.durum !== 'onaylandi') return;
  if (!(k.kayitlar || []).some(function (r) { return !r.gonderildi; })) return;

  // Kullanicinin sectigi GONDERIM TARIHI gelmediyse bekle. Takvim
  // ceyregi dayatmasi kaldirildi: tarihi kullanici belirler.
  var gt = String(k.gonderimTarihi || '');
  if (gt && gt > _bugunStr()) return;

  gonder(k);
}

// ── Gonderim ───────────────────────────────────────────────────────
function gonder(k) {
  var ben = _benimAdresim();

  // Kurumsal adres hazir degilse HICBIR sey gonderme, sebebi bildir.
  var g = _gonderenDogrula();
  if (!g.ok) {
    GmailApp.sendEmail(ben, '[ERP] ' + k.ceyrek + ' performans maili GÖNDERİLMEDİ', '',
      { htmlBody: '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px">'
        + '<p><b>Gönderen adres hazır değil, hiçbir mail gönderilmedi.</b></p>'
        + '<p>' + g.sebep + '</p>'
        + '<p style="color:#666;font-size:12px">Kuyruk olduğu gibi duruyor; '
        + 'düzeltince bir sonraki saatlik çalışmada gönderilir.</p></div>' });
    return;
  }

  var gonderilen = [], hatali = [];

  (k.kayitlar || []).forEach(function (r) {
    if (r.gonderildi) return;
    try {
      GmailApp.sendEmail(r.to,
        'Tedarikçi Performans Değerlendirmesi — ' + k.ceyrek,
        '',
        {
          htmlBody: _govde(r, k.ceyrek),
          cc: (r.cc || []).join(','),
          bcc: ben,                       // arsiv/kanit kopyasi
          name: 'Sanifoam Kalite Yönetimi',
          replyTo: g.adres,               // yanitlar kurumsal adrese gelsin
          from: g.from || undefined       // null ise zaten o hesaptan gidiyor
        });
      r.gonderildi = true;
      r.gonderimZamani = new Date().toISOString();
      gonderilen.push(r.ad + ' → ' + r.to);
    } catch (e) {
      // Tek bir hata butun kuyrugu durdurmasin; hangi tedarikciye
      // gidemedigi raporda gorunsun.
      r.hata = String(e);
      hatali.push(r.ad + ' → ' + r.to + ' (' + e + ')');
    }
    // Her kayittan sonra yaz: betik kotasi/zaman asimi olursa ayni mail
    // ikinci kez GITMESIN.
    _kuyrukYaz(k);
  });

  if (gonderilen.length === (k.kayitlar || []).length) k.durum = 'tamamlandi';
  _kuyrukYaz(k);

  GmailApp.sendEmail(ben, '[ERP] ' + k.ceyrek + ' performans maili raporu — '
    + gonderilen.length + ' gönderildi'
    + (hatali.length ? ', ' + hatali.length + ' HATA' : ''), '',
    { htmlBody:
        '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px">'
      + '<p><b>Gönderilen (' + gonderilen.length + ')</b></p><ul><li>'
      + (gonderilen.join('</li><li>') || '—') + '</li></ul>'
      + (hatali.length
          ? '<p style="color:#c62828"><b>Gönderilemeyen (' + hatali.length + ')</b></p><ul><li>'
            + hatali.join('</li><li>') + '</li></ul>'
            + '<p style="font-size:12px;color:#666">Bunlar kuyrukta kaldı; sorun giderilince '
            + 'bir sonraki saatlik çalışmada yeniden denenir.</p>'
          : '')
      + '</div>' });
}

// ── Elle kontrol: kuyrukta ne var? (mail gondermez) ────────────────
function kuyrukDurumu() {
  var g = _gonderenDogrula();
  Logger.log('Gönderen: %s', g.ok ? g.adres : 'HAZIR DEĞİL — ' + g.sebep);
  var k = _kuyrukOku();
  if (!k) { Logger.log('Kuyruk dosyası yok: ' + PERF_DOSYA); return; }
  var bekleyen = (k.kayitlar || []).filter(function (r) { return !r.gonderildi; });
  Logger.log('Çeyrek: %s · durum: %s · toplam: %s · bekleyen: %s',
    k.ceyrek, k.durum, (k.kayitlar || []).length, bekleyen.length);
  bekleyen.slice(0, 20).forEach(function (r) { Logger.log('  → %s (%s)', r.ad, r.to); });
}

// ── Elle tetikleme: onayli kuyrugu SIMDI gonder ────────────────────
function simdiGonder() {
  var k = _kuyrukOku();
  if (!k) { Logger.log('Kuyruk yok.'); return; }
  if (k.durum !== 'onaylandi') { Logger.log('Kuyruk onaylı değil (durum: %s).', k.durum); return; }
  gonder(k);
}
