/* Kalibrasyon CANLI SENKRON (additive) — localStorage'ı Supabase'e yansıtır + Realtime.
   - Uygulamanın kendi koduna DOKUNMAZ (localStorage API'sini sarmalar).
   - Anahtarlar: instruments, calibrationRecords, settings → supplier_sync tablosu (id='kalibrasyon').
   - Yalnızca onaylı ERP oturumu varsa çalışır (yoksa uygulama yerel modda çalışır).
*/
(function(){
  var SUPA_URL='https://chchaielttnimuuezazb.supabase.co';
  var SUPA_KEY='sb_publishable_S2ywbq7TkgcZKiVif3td-A_oAuQL3QT';
  var ROW_ID='kalibrasyon';
  var KEYS=['instruments','calibrationRecords','settings'];
  function isSynced(k){ return !!k && KEYS.indexOf(k)>=0; }

  if(!(window.supabase && window.supabase.createClient)){ console.warn('[kalib-sync] supabase-js yok'); return; }
  var sb=window.supabase.createClient(SUPA_URL, SUPA_KEY, {auth:{persistSession:true, autoRefreshToken:true}});
  var _applying=false, _lastEdit=0, _uid=null, _pushTimer=null;

  // localStorage'ı sarmala (uygulama koduna dokunmadan)
  var _origSet=localStorage.setItem.bind(localStorage);
  var _origRem=localStorage.removeItem.bind(localStorage);
  localStorage.setItem=function(k,v){ _origSet(k,v); try{ if(isSynced(k)) schedulePush(); }catch(e){} };
  localStorage.removeItem=function(k){ _origRem(k); try{ if(isSynced(k)) schedulePush(); }catch(e){} };

  function snapshot(){ var o={}; for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(isSynced(k)) o[k]=localStorage.getItem(k); } return o; }
  function applyRemote(data){ if(!data) return false; _applying=true; var ch=false;
    try{ Object.keys(data).forEach(function(k){ if(isSynced(k) && localStorage.getItem(k)!==data[k]){ _origSet(k, data[k]); ch=true; } }); }
    finally{ _applying=false; } return ch; }
  function pushNow(){ if(_applying||!_uid) return;
    sb.from('supplier_sync').upsert({ id:ROW_ID, data:snapshot(), updated_at:new Date().toISOString(), updated_by:_uid })
      .then(function(r){ if(r.error) console.warn('[kalib-sync] push', r.error.message); else console.log('[kalib-sync] kaydedildi'); }); }
  function schedulePush(){ if(_applying) return; _lastEdit=Date.now(); clearTimeout(_pushTimer); _pushTimer=setTimeout(pushNow, 1500); }

  function banner(){ if(document.getElementById('kalibSyncBanner')) return;
    var b=document.createElement('div'); b.id='kalibSyncBanner';
    b.style.cssText='position:fixed;bottom:16px;right:16px;z-index:2147483647;background:#0288d1;color:#fff;padding:10px 14px;border-radius:10px;font:600 14px sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35);cursor:pointer';
    b.textContent='🔄 Yeni kalibrasyon verisi geldi — görmek için tıkla';
    b.onclick=function(){ location.reload(); };
    (document.body||document.documentElement).appendChild(b);
  }

  function subscribe(){
    sb.channel('kalib_sync_rt')
      .on('postgres_changes', {event:'*', schema:'public', table:'supplier_sync', filter:'id=eq.'+ROW_ID}, function(p){
        var row=p.new; if(!row||!row.data||row.updated_by===_uid) return;
        applyRemote(row.data);
        if(Date.now()-_lastEdit > 8000){ location.reload(); } else { banner(); }
      }).subscribe();
  }

  async function init(){
    try{
      var ses=(await sb.auth.getSession()).data.session;
      if(!ses){ console.log('[kalib-sync] ERP oturumu yok — yerel mod'); return; }
      _uid=ses.user.id;
      var r=await sb.from('supplier_sync').select('data').eq('id',ROW_ID).maybeSingle();
      var remote=(r.data && r.data.data) ? r.data.data : null;
      if(remote && Object.keys(remote).length){
        if(applyRemote(remote)){            // yerelden farklıysa uygula + bir kez yenile (React taze okusun)
          if(!sessionStorage.getItem('_kalibSyncReloaded')){ sessionStorage.setItem('_kalibSyncReloaded','1'); location.reload(); return; }
        }
      } else {
        pushNow();                          // uzak boş → mevcut yerel veriyi ilk kez yükle (migration)
      }
      sessionStorage.removeItem('_kalibSyncReloaded');
      subscribe();
      console.log('[kalib-sync] Kalibrasyon canlı senkron aktif.');
    }catch(e){ console.warn('[kalib-sync] init', e); }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
