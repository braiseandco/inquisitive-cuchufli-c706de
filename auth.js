// Connexion partagée par toutes les apps de app.braiseandco.fr (sécurisation de la base)
//
// Aujourd'hui la base répond à quiconque a la clé publique, écrite dans les pages et dans
// le dépôt GitHub public. Après la bascule, seuls les appareils connectés y accèdent : un
// compte par appareil (2 tablettes, téléphone de l'entreprise, téléphone et PC du patron),
// qu'on peut couper seul si l'appareil est perdu.
//
// Une page se branche en chargeant ce fichier avant ses propres scripts. Il intercepte les appels
// à la base qui portent la clé publique : appareil connecté, il y met son jeton ; base qui refuse
// faute de connexion, il affiche l'écran de connexion puis rejoue l'appel. Les pages n'ont pas à
// toucher leurs dizaines d'appels. Appareil non connecté et accès libre encore ouvert : l'appel
// part tel quel, rien ne change.
(function(){
  var SB = 'https://ugyrrnqpapeagpuocwob.supabase.co';
  var KEY = 'sb_publishable_42K8PYF3PRqxWGXiUmhC5g_2hHhlH8X';
  // Identifiants des comptes d'appareil : « tablette-1 » se connecte comme tablette-1@app.braiseandco.fr
  var DOMAINE = '@app.braiseandco.fr';
  var APPAREILS = ['tablette-1', 'tablette-2', 'tel-entreprise', 'tel-perso', 'pc-patron'];
  var STORE = 'braise_auth';
  var enCours = null, attente = null;
  var natif = window.fetch.bind(window);

  function lire(){ try { return JSON.parse(localStorage.getItem(STORE)) || null; } catch(e){ return null; } }
  function ecrire(s){ try { s ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE); } catch(e){} }
  function garder(d){
    var s = { access_token: d.access_token, refresh_token: d.refresh_token,
      expires_at: Date.now() + (d.expires_in || 3600) * 1000, appareil: (d.user && d.user.email || '').replace(DOMAINE, '') };
    ecrire(s); return s;
  }

  async function auth(type, body){
    var r = await natif(SB + '/auth/v1/token?grant_type=' + type, {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    var d = await r.json().catch(function(){ return {}; });
    if(!r.ok) throw new Error(d.error_description || d.msg || d.error || ('HTTP ' + r.status));
    return garder(d);
  }

  // Jeton valide, renouvelé une minute avant expiration ; un seul renouvellement à la fois,
  // sinon deux appels simultanés useraient le même jeton de renouvellement et le second échouerait
  async function jeton(){
    var s = lire(); if(!s) return null;
    if(s.expires_at - Date.now() > 60000) return s.access_token;
    if(!enCours) enCours = auth('refresh_token', { refresh_token: s.refresh_token })
      .catch(function(e){ if(!navigator.onLine) throw e; ecrire(null); return null; })
      .finally(function(){ enCours = null; });
    var n = await enCours; return n ? n.access_token : null;
  }

  async function headers(){
    var t = await jeton();
    return { apikey: KEY, Authorization: 'Bearer ' + (t || KEY) };
  }

  function ecran(message){
    if(attente) return attente;
    attente = new Promise(function(ok){
      var d = document.createElement('div');
      d.id = 'braise-auth';
      d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;padding:16px;font-family:-apple-system,system-ui,sans-serif';
      d.innerHTML = '<form style="background:#1c1c1e;color:#fff;border-radius:16px;padding:22px;width:100%;max-width:340px;box-shadow:0 10px 40px rgba(0,0,0,.5)">'
        + '<div style="font-size:18px;font-weight:700;margin-bottom:4px">🔒 Connexion de l\'appareil</div>'
        + '<div id="braise-auth-msg" style="font-size:13px;color:#aaa;margin-bottom:14px">' + (message || 'Une seule fois par appareil : il reste connecté ensuite.') + '</div>'
        + '<label style="font-size:12px;color:#aaa">Appareil</label>'
        + '<select name="a" style="width:100%;margin:4px 0 12px;padding:11px;border-radius:10px;border:1px solid #3a3a3c;background:#2c2c2e;color:#fff;font-size:16px">'
        + APPAREILS.map(function(a){ return '<option>' + a + '</option>'; }).join('') + '</select>'
        + '<label style="font-size:12px;color:#aaa">Mot de passe</label>'
        + '<input name="p" type="password" autocomplete="current-password" required style="width:100%;box-sizing:border-box;margin:4px 0 16px;padding:11px;border-radius:10px;border:1px solid #3a3a3c;background:#2c2c2e;color:#fff;font-size:16px">'
        + '<button style="width:100%;padding:13px;border:0;border-radius:10px;background:#ff6b35;color:#fff;font-size:16px;font-weight:700">Se connecter</button></form>';
      var s = lire(); if(s && s.appareil) d.querySelector('select').value = s.appareil;
      d.querySelector('form').onsubmit = async function(e){
        e.preventDefault();
        var f = e.target, msg = d.querySelector('#braise-auth-msg'), b = f.querySelector('button');
        b.disabled = true; msg.textContent = 'Connexion…'; msg.style.color = '#aaa';
        try {
          await auth('password', { email: f.a.value + DOMAINE, password: f.p.value });
          d.remove(); attente = null; ok();
        } catch(err){
          msg.textContent = /invalid/i.test(err.message) ? 'Mot de passe incorrect.' : 'Connexion impossible : ' + err.message;
          msg.style.color = '#ff6b6b'; b.disabled = false;
        }
      };
      document.body.appendChild(d);
      setTimeout(function(){ d.querySelector('input').focus(); }, 50);
    });
    return attente;
  }

  // Clé publique de la page (nouvelle « sb_publishable_ » ou ancienne clé anon) : à remplacer par le jeton
  function estCle(b){
    if(!b || b === KEY || b.indexOf('sb_publishable_') === 0) return true;
    try { return JSON.parse(atob(b.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; }
    catch(e){ return false; }
  }

  // Seules les données et les fichiers passent par ici ; l'écran ne s'affiche que pour eux
  function aProteger(url){
    return typeof url === 'string' && (url.indexOf(SB + '/rest/v1/') === 0 || url.indexOf(SB + '/storage/v1/') === 0);
  }

  window.fetch = async function(input, init){
    if(!aProteger(input)) return natif(input, init);
    var o = Object.assign({}, init || {}), h = new Headers(o.headers || {});
    if(!estCle((h.get('Authorization') || '').replace(/^Bearer\s+/i, ''))) return natif(input, init);
    for(var essai = 0; ; essai++){
      var t = await jeton();
      if(t) h.set('Authorization', 'Bearer ' + t);
      o.headers = h;
      var r = await natif(input, o);
      if(essai || (r.status !== 401 && r.status !== 403)) return r;
      var txt = await r.clone().text().catch(function(){ return ''; });
      if(r.status === 403 && !/permission denied|row-level security|42501|JWT/i.test(txt)) return r;
      if(t) ecrire(null);
      if(!document.body) await new Promise(function(ok){ document.addEventListener('DOMContentLoaded', ok, { once: true }); });
      await ecran('Cet appareil doit se connecter pour accéder aux données.');
    }
  };

  window.braiseAuth = {
    headers: headers,
    connecte: function(){ return !!lire(); },
    appareil: function(){ var s = lire(); return s && s.appareil; },
    // À appeler au chargement d'une page branchée, une fois l'accès libre fermé
    exiger: async function(){ if(!(await jeton())) await ecran(); },
    deconnecter: function(){ ecrire(null); }
  };
})();
