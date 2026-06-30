/* Google sign-in provider — DECOUPLED from the Supabase DATA layer.
 * Proves: with config.authMode='google' the app signs people in via Google EVEN
 * THOUGH Supabase is configured, and the Supabase DATA client (WP.db / WP._sb) is
 * still created (the data layer is NOT disabled). Also: the login screen shows the
 * Google button and NO email gate (an email gate in Google mode would let anyone in
 * without Google proving the identity), the @webook.com domain is enforced, and a
 * resolved address maps to its directory person. jsdom; no network. */
const fs=require('fs'),path=require('path');const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const srcs=[...html.matchAll(/src="([^"]+\.js)"/g)].map(m=>m[1]);
const shellBody=(html.match(/<body[^>]*>([\s\S]*?)<\/body>/)||[,''])[1].replace(/<script[\s\S]*?<\/script>/g,'');
const dom=new JSDOM('<!doctype html><html><body>'+shellBody+'</body></html>',{url:'https://akram-webook.github.io/tempo/',runScripts:'outside-only'});
const {window}=dom;window.HTMLElement.prototype.scrollIntoView=function(){};window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});window.setInterval=()=>0;
const errors=[];const benign=/font|stylesheet|localStorage|Security|scrollIntoView|Not implemented|opaque|insertRule|cssRules|gsi|accounts\.google|cdn\.jsdelivr|supabase/i;
['error','warn'].forEach(k=>{const o=window.console[k].bind(window.console);window.console[k]=(...a)=>{const s=a.join(' ');if(!benign.test(s))errors.push('['+k+'] '+s);o(...a);};});
window.addEventListener('error',e=>{if(!benign.test(String(e.message)))errors.push('[onerror] '+e.message);});
for(const s of srcs){try{new window.Function(fs.readFileSync(path.join(root,s),'utf8')).call(window);}catch(e){errors.push('[load '+s+'] '+e.message);}}
const WP=window.WP;function assert(c,m){if(!c)errors.push('[assert] '+m);}
try{
  // ── 1) Google is the provider, EVEN THOUGH Supabase is configured (decoupled) ──
  assert(WP.config.authMode==='google','config default authMode = google');
  assert(WP.config.supabaseUrl && WP.config.supabaseUrl.indexOf('supabase.co')>0,'Supabase URL still configured (data layer)');
  assert(WP.config.supabaseAnonKey && WP.config.supabaseAnonKey.indexOf('sb_publishable_')===0,'Supabase publishable key still configured (data layer)');
  assert(WP.auth.mode()==='google','auth mode resolves to GOOGLE even with Supabase keys present');

  // ── 2) The DATA layer is NOT disabled: the Supabase client is still created in
  //       Google mode, so WP.db keeps reaching the backend. (Mock the SDK; no network.) ──
  let createdWith=null;
  window.supabase={createClient:function(url,key){createdWith={url:url,key:key};
    return {from:function(){return {};},auth:{onAuthStateChange:function(){return {data:{subscription:{unsubscribe(){}}}};},getSession:function(){return Promise.resolve({data:{session:null}});},signOut:function(){return Promise.resolve({});}}};}};
  WP._sb=null;
  WP.auth.initSession();   // must build the client for WP.db despite Google being the auth provider
  assert(!!WP._sb && typeof WP._sb.from==='function','Supabase DATA client IS created in Google mode (WP.db not disabled)');
  assert(createdWith && createdWith.url===WP.config.supabaseUrl,'client built with the configured Supabase project');
  assert(!!WP.db,'WP.db data layer present');
  assert(WP.db.usingBackend ? WP.db.usingBackend()===true : true,'WP.db sees a usable backend client');

  // ── 3) Login screen: Google button only, NO email gate, no "link sent" copy ──
  WP.state.authed=false;const view=window.document.getElementById('view');WP.ui.login.render(view);
  assert(view.querySelector('#g-btn-host'),'renders the Google button host (#g-btn-host)');
  assert(!view.querySelector('#login-form') && !view.querySelector('#login-email'),'NO email gate in Google mode (cannot bypass Google)');
  assert(!/sign-in link|linkSentTo|Email me a sign-in link/.test(view.innerHTML),'no leftover email-link / code-sent copy');

  // ── 4) Domain enforced + a resolved @webook.com maps to its person ──
  const f=WP.auth.findByEmail;
  assert(f('akram@gmail.com').error==='errBadDomain','non-@webook.com Google account rejected');
  assert(f('nobody@webook.com').error==='errNoAccount','unknown @webook.com rejected (not in directory)');
  assert(f('motaa@webook.com').person && f('motaa@webook.com').person.id==='p_motaa','resolved @webook.com maps to the directory person (needs #47/#48 merged)');
  assert(f('akram@webook.com').person.id==='p_akram','super admin resolves');

  // ── 5) Both themes + EN/AR still render the Google screen ──
  WP.state.lang='en';WP.state.theme='light';WP.ui.login.render(view);assert(view.querySelector('#g-btn-host'),'Google screen renders under light/EN');
  WP.state.theme='dark';WP.ui.login.render(view);assert(view.querySelector('#g-btn-host'),'Google screen renders under dark');
  WP.state.lang='ar';WP.ui.login.render(view);assert(view.querySelector('#g-btn-host'),'Google screen renders under AR/RTL');

  // ── 6) Selecting another provider still works (decoupling is reversible) ──
  WP.config.authMode='verified-link';assert(WP.auth.mode()==='verified-link','authMode flips back to verified-link cleanly');
  WP.config.authMode='directory';assert(WP.auth.mode()==='directory','authMode flips to directory cleanly');
  WP.config.authMode='google';
}catch(e){errors.push('[run] '+e.message+'\n'+e.stack);}
if(errors.length){console.log('FAIL\n'+errors.join('\n'));process.exit(1);}
console.log('PASS — Google sign-in is the active provider while Supabase stays wired for DATA: the Supabase client is still created (WP.db live), the login screen shows the Google button with no email-gate bypass, the @webook.com domain is enforced and resolves to the directory person, and the provider switch is reversible (verified-link / directory).');
process.exit(0);
