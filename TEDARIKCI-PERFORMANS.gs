/***** ÇEYREKLİK TEDARİKÇİ PERFORMANS MAİLİ (Google Apps Script) *****
 * Senin KURUMSAL (Sanifoam) adresinden gönderir. Apps Script SMTP
 * konuşamaz; Gmail'in "Farklı gönder" (alias) özelliği kullanılır —
 * bkz. GONDEREN_ADRES bölümü. Alias hazır değilse HİÇBİR mail gitmez.
 *
 * AKIŞ — onaysız hiçbir mail dışarı çıkmaz:
 *   1) Çeyrek başında (1 Ocak / 1 Nisan / 1 Temmuz / 1 Ekim) saatlik
 *      tetikleyici SANA hatırlatma atar: "Q3 geldi, ERP'den onayla".
 *   2) ERP'de "📧 Çeyreklik Performans Bildirimi → Listeyi hazırla ve
 *      onayla" dersin. Liste Drive'a PERFORMANS_KUYRUK.json olarak yazılır
 *      (durum: 'onaylandi').
 *   3) Bir sonraki saatlik çalışmada bu betik kuyruğu görür, mailleri
 *      GÖNDERİR, her birini "gonderildi" işaretler ve sana gönderim
 *      raporu atar.
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
    if (t.getHandlerFunction() === 'ceyrekKontrol') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('ceyrekKontrol').timeBased().everyHours(1).create();
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

function _ceyrek(d) {
  d = d || new Date();
  return d.getFullYear() + '-Q' + (Math.floor(d.getMonth() / 3) + 1);
}

// Ceyregin ILK gunu mu? Hatirlatma yalnizca o gun atilir.
function _ceyrekBasi(d) {
  d = d || new Date();
  return d.getDate() === 1 && (d.getMonth() % 3) === 0;
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

// ── Mail govdesi ───────────────────────────────────────────────────
// Yorum: hedefe ulasilip ulasilmadigini SAYIYLA soyler, "basarili/
// basarisiz" gibi yoruma acik ifade kullanmaz.
function _durumMetni(gercek, hedef) {
  if (!hedef) return '<span style="color:#777">Hedef tanımlı değil</span>';
  if (gercek <= hedef) return '<span style="color:#2e7d32;font-weight:600">Hedef içinde</span>';
  return '<span style="color:#c62828;font-weight:600">Hedef aşıldı</span>';
}

function _govde(r, ceyrek) {
  var satir = function (baslik, gercek, hedef, sonraki, birim) {
    return '<tr>'
      + '<td style="padding:8px 10px;border:1px solid #e0e0e0;font-weight:600">' + baslik + '</td>'
      + '<td style="padding:8px 10px;border:1px solid #e0e0e0;text-align:right">' + gercek + birim + '</td>'
      + '<td style="padding:8px 10px;border:1px solid #e0e0e0;text-align:right">' + hedef + birim + '</td>'
      + '<td style="padding:8px 10px;border:1px solid #e0e0e0;text-align:center">' + _durumMetni(gercek, hedef) + '</td>'
      + '<td style="padding:8px 10px;border:1px solid #e0e0e0;text-align:right">' + sonraki + birim + '</td>'
      + '</tr>';
  };
  return ''
    + '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#222;max-width:680px">'
    + '<p>Sayın Yetkili,</p>'
    + '<p><b>' + r.ad + '</b> firmasının ' + r.yil + ' yılı (yıl başından bugüne) '
    + 'tedarikçi performans değerlendirmesi aşağıdadır.</p>'
    + '<table style="border-collapse:collapse;width:100%;font-size:13px;margin:14px 0">'
    + '<thead><tr style="background:#f5f5f5">'
    + '<th style="padding:8px 10px;border:1px solid #e0e0e0;text-align:left">Kriter</th>'
    + '<th style="padding:8px 10px;border:1px solid #e0e0e0;text-align:right">Gerçekleşme</th>'
    + '<th style="padding:8px 10px;border:1px solid #e0e0e0;text-align:right">Hedef</th>'
    + '<th style="padding:8px 10px;border:1px solid #e0e0e0">Durum</th>'
    + '<th style="padding:8px 10px;border:1px solid #e0e0e0;text-align:right">Sonraki Hedef</th>'
    + '</tr></thead><tbody>'
    + satir('PPM (Parça Per Million)', r.ppm, r.ppmHedef, r.ppmSonraki, '')
    + satir('Hata Tekrarı', r.hata, r.hataHedef, r.hataSonraki, ' adet')
    + '</tbody></table>'
    + '<p style="font-size:12px;color:#666">Sonraki hedef kuralı: gerçekleşme hedefin altındaysa '
    + 'hedef %10 düşürülür; hedef ile hedefin 1,2 katı arasındaysa aynı kalır; '
    + '1,2 katını aşarsa gerçekleşmenin %90&#39;ı yeni hedef olur.</p>'
    + '<p>Değerlendirme ile ilgili sorularınız için bize dönebilirsiniz.</p>'
    + '<p>İyi çalışmalar,<br><b>Sanifoam Kalite Yönetimi</b></p>'
    + '<p style="font-size:11px;color:#999;border-top:1px solid #eee;padding-top:8px">'
    + 'Bu bilgilendirme ' + ceyrek + ' dönemi için gönderilmiştir.</p>'
    + '</div>';
}

// ── Saatlik tetikleyici ────────────────────────────────────────────
function ceyrekKontrol() {
  var k = _kuyrukOku();
  var simdiCeyrek = _ceyrek();

  // 1) Onayli ve gonderilmemis kayit varsa GONDER
  if (k && k.durum === 'onaylandi' && (k.kayitlar || []).some(function (r) { return !r.gonderildi; })) {
    gonder(k);
    return;
  }

  // 2) Ceyrek basiysa ve bu ceyrek icin onay yoksa HATIRLAT (gunde bir kez)
  if (_ceyrekBasi() && (!k || k.ceyrek !== simdiCeyrek || k.durum !== 'onaylandi')) {
    if (_damga('hatirlatma') === simdiCeyrek) return;   // bu ceyrek zaten hatirlatildi
    GmailApp.sendEmail(_benimAdresim(),
      '[ERP] ' + simdiCeyrek + " tedarikçi performans bildirimi onay bekliyor",
      '',
      { htmlBody:
          '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px">'
        + '<p><b>' + simdiCeyrek + '</b> dönemi geldi. Ankara ve Çerkezköy tedarikçilerine '
        + 'performans maili gönderilmesi için onayın bekleniyor.</p>'
        + '<p>ERP → Onaylı Tedarikçiler → <b>📧 Çeyreklik Performans Bildirimi → '
        + 'Listeyi hazırla ve onayla</b></p>'
        + '<p style="color:#666;font-size:12px">Onaylamazsan hiçbir mail gitmez. '
        + 'Bu hatırlatma çeyrek başına bir kez gönderilir.</p></div>' });
    _damgala('hatirlatma', simdiCeyrek);
  }
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
        'Tedarikçi Performans Değerlendirmesi — ' + r.yil + ' (' + k.ceyrek + ')',
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
