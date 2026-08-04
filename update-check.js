// Mise à jour partagée par toutes les apps de app.braiseandco.fr
// Chaque app définit window.APP_VERSION avant de charger ce script.
//
// Les apps sont des pages distinctes du même domaine : purger les caches depuis
// l'une purge donc déjà les autres, mais leurs onglets restés ouverts continuent
// d'exécuter l'ancien JS chargé en mémoire. D'où le BroadcastChannel, qui leur dit
// de se recharger, et la vérification auto au retour sur l'app.
(function(){
  var CH = ('BroadcastChannel' in window) ? new BroadcastChannel('braise-update') : null;

  // Ne jamais recharger pendant une saisie : modal ouvert = travail en cours
  function busy(){
    return !!document.querySelector('.overlay.open,.modal.open,.modal-overlay.open,.caisse-modal.open,.edit-table-modal.open,.table-panel.open');
  }

  function reload(){
    window.location.href = window.location.pathname + '?_v=' + Date.now();
  }

  async function purge(){
    if('serviceWorker' in navigator){
      var regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(function(r){ return r.unregister(); }));
    }
    if('caches' in window){
      var keys = await caches.keys();
      await Promise.all(keys.map(function(k){ return caches.delete(k); }));
    }
  }

  // Purge complète + rechargement de cette page, et signal aux autres apps ouvertes
  window.braiseForceUpdate = async function(){
    await purge();
    if(CH) CH.postMessage({ type:'reload' });
    reload();
  };

  if(CH){
    CH.onmessage = function(e){
      if(!e.data || e.data.type !== 'reload') return;
      if(busy()) return;
      reload();
    };
  }

  // Renvoie la version distante si elle diffère, null si déjà à jour.
  window.braiseRemoteVersion = async function(){
    var res = await fetch('/version.json?_v=' + Date.now(), { cache:'no-store' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    var remote = data && data.version;
    if(!remote || remote === window.APP_VERSION) return null;
    return remote;
  };

  async function auto(){
    try{
      // Si l'app n'a pas declare sa version (script casse, page partielle), ne rien
      // purger : on ne veut pas boucler sur une comparaison qui echouera toujours.
      if(!window.APP_VERSION) return;
      var remote = await window.braiseRemoteVersion();
      if(!remote || busy()) return;
      // version.json est commun aux apps : si l'une d'elles n'a pas été rebuildée,
      // l'écart ne se résorbera jamais. Un seul rechargement auto par version.
      if(sessionStorage.getItem('braiseUpdateTried') === remote) return;
      sessionStorage.setItem('braiseUpdateTried', remote);
      await window.braiseForceUpdate();
    }catch(e){}
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
  else auto();
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'visible') auto();
  });
})();
