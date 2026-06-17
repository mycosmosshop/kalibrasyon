/***** KALİBRASYON E-POSTA BİLDİRİM BACKEND (Google Apps Script) *****
 * Ücretsiz, açık, çalışan yöntem — senin Gmail hesabından gönderir (GmailApp).
 * 2 yetenek:
 *   1) Manuel: uygulamadaki "Bildirim Maili Gönder" butonu buraya POST atar → mail gider.
 *   2) Otomatik: dailyCheck() günlük tetikleyici (cron) → Supabase'den kalibrasyon verisini
 *      okur, süresi yaklaşan/geçen cihazları bulur, mail atar (uygulama AÇIK olmasa bile).
 *
 * KURULUM:
 *   - script.google.com → Yeni proje → bu kodu yapıştır.
 *   - SERVICE_ROLE_KEY'i Supabase panelinden al (Settings → API → service_role secret) ve aşağıya yaz.
 *   - Dağıt → Web uygulaması → "Beni"; erişim "Herkes" → /exec URL'sini kopyala.
 *   - Uygulama Ayarlar → "Servis URL" alanına o /exec URL'sini yapıştır.
 *   - OTOMATİK için: Tetikleyiciler (saat ikonu) → Tetikleyici ekle → dailyCheck → Zaman güdümlü → Gün → istediğin saat.
 ********************************************************************************/

var SUPA_URL = 'https://chchaielttnimuuezazb.supabase.co';
var SERVICE_ROLE_KEY = 'BURAYA_SUPABASE_SERVICE_ROLE_KEY';   // Supabase → Settings → API → service_role (gizli)
var ROW_ID = 'kalibrasyon';
var DEFAULT_THRESHOLD = 30; // ayarlarda yoksa varsayılan "yaklaşıyor" eşiği (gün)

// ---- Web app: warm-up (GET) ve manuel gönderim (POST) ----
function doGet(e) {
  // ?bridge=1 → Drive yükleme köprüsü (iframe olarak embed edilir)
  if (e && e.parameter && e.parameter.bridge === '1') {
    return HtmlService.createHtmlOutput(_bridgeHtml())
      .setTitle('Drive Bridge')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'kalibrasyon-mailer' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---- Drive PDF Yükleme ----
var DRIVE_FOLDER_NAME = 'Kalibrasyon Raporları';

function uploadFileToDrive(base64Data, fileName, mimeType) {
  try {
    var folder, folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
    folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER_NAME);
    var bytes = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(bytes, mimeType || 'application/pdf', fileName);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var id = file.getId();
    return { success: true, fileId: id,
      driveUrl: 'https://drive.google.com/file/d/' + id + '/view?usp=sharing',
      previewUrl: 'https://drive.google.com/file/d/' + id + '/preview' };
  } catch (err) { return { success: false, error: String(err) }; }
}

function deleteFileFromDrive(fileId) {
  try { DriveApp.getFileById(fileId).setTrashed(true); return { success: true }; }
  catch (err) { return { success: false, error: String(err) }; }
}

function _bridgeHtml() {
  return '<!DOCTYPE html><html><head><script>' +
    'window.addEventListener("message",function(ev){' +
      'var d=ev.data;if(!d||!d.type)return;' +
      'if(d.type==="UPLOAD"){' +
        'google.script.run' +
          '.withSuccessHandler(function(r){ev.source.postMessage({type:"UPLOAD_DONE",id:d.id,result:r},"*");})' +
          '.withFailureHandler(function(e){ev.source.postMessage({type:"UPLOAD_DONE",id:d.id,result:{success:false,error:e.message}},"*");})' +
          '.uploadFileToDrive(d.base64,d.filename,d.mimeType);' +
      '}' +
      'if(d.type==="DELETE"){' +
        'google.script.run' +
          '.withSuccessHandler(function(r){ev.source.postMessage({type:"DELETE_DONE",id:d.id,result:r},"*");})' +
          '.deleteFileFromDrive(d.fileId);' +
      '}' +
      'if(d.type==="PING"){ev.source.postMessage({type:"PONG"},"*");}' +
    '});' +
    'window.onload=function(){if(window.parent!==window)window.parent.postMessage({type:"BRIDGE_READY"},"*");};' +
    '<\/script><\/head><body><\/body><\/html>';
}

function doPost(e) {
  var out = { success: false };
  try {
    var body = JSON.parse(e.postData.contents);
    var toList = body.toList || body.to || [];
    if (typeof toList === 'string') toList = toList.split(',');
    toList = toList.map(function (s) { return String(s).trim(); }).filter(Boolean);
    if (!toList.length) { out.error = 'Alıcı yok'; return _json(out); }
    var subject = body.subject || 'Kalibrasyon Hatırlatması';
    var devices = body.devices || [];
    var html = buildHtml(devices, body.thresholdDays || DEFAULT_THRESHOLD);
    GmailApp.sendEmail(toList.join(','), subject, _strip(html), { htmlBody: html, name: 'Kalibrasyon Takip' });
    out = { success: true, sent: toList, count: devices.length };
  } catch (err) { out.error = String(err); }
  return _json(out);
}

// ---- OTOMATİK günlük kontrol (tetikleyiciye bağla) ----
function dailyCheck() {
  var data = readSupabase();
  if (!data) { Logger.log('Veri okunamadı'); return; }
  var instruments = data.instruments || [];
  var records = data.calibrationRecords || [];
  var settings = data.settings || {};
  if (settings.emailNotificationsEnabled === false) { Logger.log('Bildirim kapalı'); return; }
  var toList = String(settings.toList || settings.notificationEmail || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (!toList.length) { Logger.log('Alıcı yok'); return; }
  var thr = Number(settings.thresholdDays || settings.reminderDays || DEFAULT_THRESHOLD);

  var today = new Date(); today.setHours(0, 0, 0, 0);
  var due = [];
  instruments.forEach(function (inst) {
    var next = nextCalibrationDate(inst, records);
    if (!next) return;
    var diffDays = Math.round((next - today) / 86400000);
    if (diffDays <= thr) { // geçmiş veya eşik içinde
      due.push({
        name: inst.name || '', serialNumber: inst.serialNumber || '', department: inst.department || '',
        location: inst.location || '', nextCalibrationDate: _fmt(next), daysLeft: diffDays
      });
    }
  });
  if (!due.length) { Logger.log('Süresi yaklaşan cihaz yok'); return; }
  due.sort(function (a, b) { return a.daysLeft - b.daysLeft; });
  var subject = 'Kalibrasyon — ' + due.length + ' cihaz: geciken/yaklaşan (' + _fmt(today) + ')';
  var html = buildHtml(due, thr);
  GmailApp.sendEmail(toList.join(','), subject, _strip(html), { htmlBody: html, name: 'Kalibrasyon Takip' });
  Logger.log('Gönderildi: ' + toList.join(',') + ' (' + due.length + ' cihaz)');
}

// ---- Supabase'den (service_role ile, RLS bypass) veriyi oku ----
function readSupabase() {
  try {
    var url = SUPA_URL + '/rest/v1/supplier_sync?id=eq.' + ROW_ID + '&select=data';
    var res = UrlFetchApp.fetch(url, {
      method: 'get', muteHttpExceptions: true,
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY }
    });
    var arr = JSON.parse(res.getContentText());
    if (arr && arr[0] && arr[0].data) {
      var d = arr[0].data;
      // data içindeki değerler JSON string olarak tutulur (uygulama localStorage formatı)
      return {
        instruments: _parse(d.instruments, []),
        calibrationRecords: _parse(d.calibrationRecords, []),
        settings: _parse(d.settings, {})
      };
    }
  } catch (err) { Logger.log('readSupabase: ' + err); }
  return null;
}

// ---- Sıradaki kalibrasyon tarihi: en güncel kayıt (veya son kalibrasyon) + aralık (ay) ----
function nextCalibrationDate(inst, records) {
  var interval = Number(inst.calibrationInterval || 12);
  var base = null;
  var recs = records.filter(function (r) { return r.instrumentId === inst.id; });
  recs.forEach(function (r) { var d = _date(r.date); if (d && (!base || d > base)) base = d; });
  if (!base) base = _date(inst.lastCalibrationDate);
  if (!base) return null;
  var n = new Date(base.getTime()); n.setMonth(n.getMonth() + interval); n.setHours(0, 0, 0, 0);
  return n;
}

function buildHtml(devices, thr) {
  var rows = devices.map(function (d) {
    var dl = d.daysLeft;
    var durum = (dl == null) ? '' : (dl < 0 ? ('GECİKTİ (' + (-dl) + ' gün)') : (dl + ' gün kaldı'));
    var renk = (dl == null) ? '#fff' : (dl < 0 ? '#f8d7da' : (dl <= 7 ? '#fff3cd' : '#d4edda'));
    return '<tr style="background:' + renk + '">' +
      '<td style="border:1px solid #ccc;padding:6px">' + (d.name || '') + '</td>' +
      '<td style="border:1px solid #ccc;padding:6px">' + (d.serialNumber || '') + '</td>' +
      '<td style="border:1px solid #ccc;padding:6px">' + (d.department || '') + '</td>' +
      '<td style="border:1px solid #ccc;padding:6px">' + (d.nextCalibrationDate || '') + '</td>' +
      '<td style="border:1px solid #ccc;padding:6px;font-weight:bold">' + durum + '</td></tr>';
  }).join('');
  return '<div style="font-family:Arial,sans-serif">' +
    '<h2 style="color:#1e3c72">Kalibrasyon Hatırlatması</h2>' +
    '<p>Aşağıdaki cihazların kalibrasyonu <b>gecikmiş</b> veya <b>' + thr + ' gün</b> içinde dolacak:</p>' +
    '<table style="border-collapse:collapse;width:100%"><thead><tr style="background:#1e3c72;color:#fff">' +
    '<th style="border:1px solid #ccc;padding:6px">Cihaz</th><th style="border:1px solid #ccc;padding:6px">Seri No</th>' +
    '<th style="border:1px solid #ccc;padding:6px">Departman</th><th style="border:1px solid #ccc;padding:6px">Sıradaki Kalibrasyon</th>' +
    '<th style="border:1px solid #ccc;padding:6px">Durum</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<p style="color:#888;font-size:12px;margin-top:16px">Bu e-posta Kalibrasyon Takip Sistemi tarafından otomatik gönderilmiştir.</p></div>';
}

// ---- yardımcılar ----
function _json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function _strip(h) { return String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function _parse(v, dflt) { try { return (typeof v === 'string') ? JSON.parse(v) : (v || dflt); } catch (e) { return dflt; } }
function _date(s) { if (!s) return null; var d = new Date(s); return isNaN(d.getTime()) ? null : d; }
function _fmt(d) { if (!d) return ''; var x = (typeof d === 'string') ? new Date(d) : d; return ('0' + x.getDate()).slice(-2) + '.' + ('0' + (x.getMonth() + 1)).slice(-2) + '.' + x.getFullYear(); }
