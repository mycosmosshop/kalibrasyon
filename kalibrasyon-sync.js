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
  // _hazir: buluttaki veri bu sayfaya uygulanmadan (ya da okunamazken) buluta YAZILMAZ.
  // 20.11.2026: okuma hatası "uzak boş" sayılıp tarayıcıdaki ESKİ veri buluta yazılıyordu;
  // ayrıca _uid okumadan önce atandığı için 1,5 sn'lik bekleyen push eski veriyi gönderebiliyordu.
  var _applying=false, _lastEdit=0, _uid=null, _pushTimer=null, _hazir=false;

  // localStorage'ı sarmala (uygulama koduna dokunmadan)
  var _origSet=localStorage.setItem.bind(localStorage);
  var _origGet=localStorage.getItem.bind(localStorage);
  var _origRem=localStorage.removeItem.bind(localStorage);
  // Tarayıcı hafızası dolu (QuotaExceeded; ERP modülleri aynı origin'in 5 MB'ını paylaşır — 20.11.2026 Edge):
  // önce eski kopya silinip yeniden yazılır, yine sığmazsa değer SEKME hafızasında (sessionStorage, ayrı kota) tutulur.
  // Başka modüllerin anahtarlarına dokunulmaz.
  var TASAN='_kalibTasan_';
  function oku(k){ try{ var t=sessionStorage.getItem(TASAN+k); if(t!==null) return t; }catch(e){} return _origGet(k); }
  function yaz(k,v){
    try{ _origSet(k,v); try{ sessionStorage.removeItem(TASAN+k); }catch(_){} return; }
    catch(e){ if(!/quota/i.test(String(e && (e.name+' '+e.message)))) throw e; }
    try{ _origRem(k); _origSet(k,v); try{ sessionStorage.removeItem(TASAN+k); }catch(_){} return; }catch(e2){}
    sessionStorage.setItem(TASAN+k, v);
    console.warn('[kalib-sync] tarayıcı hafızası dolu: "'+k+'" bu sekmenin hafızasında tutuluyor');
  }
  localStorage.getItem=function(k){ return isSynced(k) ? oku(k) : _origGet(k); };
  localStorage.setItem=function(k,v){ if(isSynced(k)) yaz(k,String(v)); else _origSet(k,v); try{ if(isSynced(k)) schedulePush(); }catch(e){} };
  localStorage.removeItem=function(k){ _origRem(k); try{ if(isSynced(k)){ sessionStorage.removeItem(TASAN+k); schedulePush(); } }catch(e){} };

  // snapshot anahtar listesinden okunur (sekme hafızasına taşan değer de dahil) — eksik anahtarla buluta yazılmaz
  function snapshot(){ var o={}; KEYS.forEach(function(k){ var v=oku(k); if(v!==null) o[k]=v; }); return o; }
  function applyRemote(data){ if(!data) return false; _applying=true; var ch=false;
    try{ Object.keys(data).forEach(function(k){ if(isSynced(k) && oku(k)!==data[k]){ yaz(k, data[k]); ch=true; } }); }
    finally{ _applying=false; } return ch; }
  function pushNow(){ if(_applying||!_uid||!_hazir) return;
    sb.from('supplier_sync').upsert({ id:ROW_ID, data:snapshot(), updated_at:new Date().toISOString(), updated_by:_uid })
      .then(function(r){ if(r.error) console.warn('[kalib-sync] push', r.error.message); else console.log('[kalib-sync] kaydedildi'); }); }
  function schedulePush(){ if(_applying) return; _lastEdit=Date.now(); clearTimeout(_pushTimer); _pushTimer=setTimeout(pushNow, 1500); }

  function subscribe(){
    sb.channel('kalib_sync_rt')
      .on('postgres_changes', {event:'*', schema:'public', table:'supplier_sync', filter:'id=eq.'+ROW_ID}, function(p){
        var row=p.new; if(!row||!row.data||row.updated_by===_uid) return;
        clearTimeout(_pushTimer);                // bekleyen (eski) push iptal
        if(applyRemote(row.data)){ _hazir=false; location.reload(); }   // React bellekteki eski veriyi yazmasın
      }).subscribe();
  }

  async function init(){
    try{
      var ses=(await sb.auth.getSession()).data.session;
      if(!ses){ console.log('[kalib-sync] ERP oturumu yok — yerel mod'); return; }
      var uid=ses.user.id;
      var r=await sb.from('supplier_sync').select('data').eq('id',ROW_ID).maybeSingle();
      for(var dene=0; r.error && dene<3; dene++){   // süresi dolmuş oturum: tazele ve yeniden oku (20.11.2026)
        console.warn('[kalib-sync] bulut okunamadı, oturum tazelenip yeniden deneniyor:', r.error.message);
        try{ var t=await sb.auth.refreshSession(); if(t.data && t.data.session) uid=t.data.session.user.id; }catch(_){}
        await new Promise(function(res){ setTimeout(res, 1500*(dene+1)); });
        r=await sb.from('supplier_sync').select('data').eq('id',ROW_ID).maybeSingle();
      }
      if(r.error){ console.warn('[kalib-sync] bulut okunamadı, yerel mod (buluta yazılmaz):', r.error.message); return; }
      clearTimeout(_pushTimer);             // okuma bitene kadar biriken (eski) push gönderilmez
      var remote=(r.data && r.data.data) ? r.data.data : null;
      if(remote && Object.keys(remote).length){
        if(applyRemote(remote)){            // yerelden farklıysa uygula + bir kez yenile (React taze okusun)
          if(!sessionStorage.getItem('_kalibSyncReloaded')){ sessionStorage.setItem('_kalibSyncReloaded','1'); location.reload(); return; }
          console.warn('[kalib-sync] yenilemeye rağmen veri farklı — yerel mod (buluta yazılmaz)'); return;
        }
        _uid=uid; _hazir=true;
      } else if(r.data===null){
        _uid=uid; _hazir=true; pushNow();   // satır gerçekten yok → mevcut yerel veriyi ilk kez yükle (migration)
      } else { console.warn('[kalib-sync] bulut satırı boş veri taşıyor — yerel mod'); return; }
      sessionStorage.removeItem('_kalibSyncReloaded');
      subscribe();
      console.log('[kalib-sync] Kalibrasyon canlı senkron aktif.');
    }catch(e){ console.warn('[kalib-sync] init', e); }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
