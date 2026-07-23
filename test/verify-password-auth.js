/* Password sign-in (wave/password-auth) — closes account impersonation.
 * With config.authMode='password' the login screen shows email + password +
 * "forgot/set password", sign-in goes through Supabase signInWithPassword, and
 * the identity acted on is ONLY the verified session email — never the typed
 * value. Proves:
 *   • authMode='password' resolves and is REVERSIBLE to the other modes,
 *   • the screen renders email + password + forgot control (EN+AR, both themes),
 *   • ANTI-IMPERSONATION: a session for email X can NEVER resolve to a person Y,
 *   • wrong creds → one generic "email or password is incorrect" (never reveals which),
 *   • an access-denied person is blocked and signed out,
 *   • Supabase stays wired for the WP.db DATA layer regardless.
 * jsdom; no network. */
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
// A stub Supabase client whose signInWithPassword returns a session with a
// SERVER-DECIDED email — independent of whatever email/password was typed.
function stubSb(sessionEmail, opts){
  opts=opts||{};let lastArgs=null;
  return {auth:{
    signInWithPassword:function(a){lastArgs=a;
      if(opts.fail) return Promise.resolve({data:{session:null},error:{message:'Invalid login credentials'}});
      return Promise.resolve({data:{session:{user:{email:sessionEmail}}},error:null});},
    resetPasswordForEmail:function(){opts.resetCalled&&opts.resetCalled();return Promise.resolve({data:{},error:null});},
    signOut:function(){opts.signOutCalled&&opts.signOutCalled();return Promise.resolve({});},
    getSession:function(){return Promise.resolve({data:{session:null}});},
    onAuthStateChange:function(){return {data:{subscription:{unsubscribe(){}}}};}
  },_lastArgs:function(){return lastArgs;}};
}
const tick=()=>new Promise(r=>setTimeout(r,0));
(async function(){try{
  WP.config.authMode='password';
  const view=window.document.getElementById('view');

  // ── mode resolves + Supabase still wired for DATA ──
  assert(WP.auth.mode()==='password','authMode=password resolves');
  assert(WP.config.supabaseUrl.indexOf('supabase.co')>0 && WP.config.supabaseAnonKey.indexOf('sb_publishable_')===0,'Supabase stays configured for WP.db data layer');

  // ── screen renders email + password + forgot; NO account picker / link copy ──
  WP.state.authed=false;WP._login=null;WP._denied=null;WP.ui.login.render(view);
  assert(view.querySelector('#login-email'),'email field renders');
  assert(view.querySelector('#login-password') && view.querySelector('#login-password').type==='password','password field renders (type=password)');
  assert(view.querySelector('#forgot-pw'),'forgot/set-password control renders');
  assert(!view.querySelector('.g-accts'),'no account picker');
  assert(!/Email me a sign-in link|linkSentTo/.test(view.innerHTML),'no verified-link copy in password mode');

  // ── ANTI-IMPERSONATION: type person Y, but the verified session is person X ──
  // Confirm the two are DIFFERENT registered people first.
  const X=WP.auth.findByEmail('marco.delgado@example.com'), Y=WP.auth.findByEmail('adrian.bell@example.com');
  assert(X.person && Y.person && X.person.id!==Y.person.id,'motaa and ayman are two distinct registered accounts');
  WP.state.authed=false;WP._sb=stubSb('marco.delgado@example.com');
  view.querySelector('#login-email').value='adrian.bell@example.com';   // attacker types someone ELSE's email
  view.querySelector('#login-password').value='whatever';
  view.querySelector('#login-form').dispatchEvent(new window.Event('submit'));
  await tick();
  assert(WP.state.authed===true,'password sign-in authenticates on a valid session');
  assert(WP.state.viewerId===X.person.id,'ANTI-IMPERSONATION: signed in as the SESSION identity (motaa), not the typed email (ayman)');
  assert(WP.state.viewerId!==Y.person.id,'ANTI-IMPERSONATION: a session for X can NEVER resolve to person Y');

  // ── wrong credentials → one generic message, not authed, never reveals which ──
  WP.state.authed=false;WP._login=null;WP._sb=stubSb('marco.delgado@example.com',{fail:true});
  WP.ui.login.render(view);
  view.querySelector('#login-email').value='marco.delgado@example.com';
  view.querySelector('#login-password').value='wrong';
  view.querySelector('#login-form').dispatchEvent(new window.Event('submit'));
  await tick();
  assert(WP.state.authed===false,'wrong credentials do NOT sign in');
  assert(WP._login && WP._login.err==='errBadCreds','wrong credentials → generic errBadCreds');
  assert(/incorrect/i.test(WP.i18n.t('errBadCreds')),'errBadCreds message is generic (does not reveal email-vs-password)');

  // ── access-denied person is blocked + signed out even with a valid session ──
  // Find a registered person WITHOUT access to exercise the deny path.
  const denyPerson=WP.data.PEOPLE.find(p=>p.email && !WP.access.hasAccess(p.id));
  if(denyPerson){
    let signedOut=false;WP.state.authed=false;WP._login=null;WP._denied=null;
    WP._sb=stubSb(denyPerson.email,{signOutCalled:()=>{signedOut=true;}});
    WP.ui.login.render(view);
    view.querySelector('#login-email').value=denyPerson.email;
    view.querySelector('#login-password').value='x';
    view.querySelector('#login-form').dispatchEvent(new window.Event('submit'));
    await tick();
    assert(WP.state.authed===false,'access-denied person is NOT signed in');
    assert(WP._denied && WP._denied.id===denyPerson.id,'access-denied person shown the denied screen');
    assert(signedOut===true,'access-denied session is signed out of Supabase');
  }

  // ── forgot/set password → resetPasswordForEmail invoked (anti-enumeration copy) ──
  let resetHit=false;WP.state.authed=false;WP._login=null;WP._denied=null;
  WP._sb=stubSb('marco.delgado@example.com',{resetCalled:()=>{resetHit=true;}});
  WP.ui.login.render(view);
  view.querySelector('#login-email').value='marco.delgado@example.com';
  view.querySelector('#forgot-pw').click();
  await tick();
  assert(resetHit===true,'forgot/set password calls resetPasswordForEmail');
  assert(WP._login && WP._login.resetSent===true,'reset shows the same neutral confirmation (no account enumeration)');

  // ── EN+AR, both themes render the gate ──
  WP.state.authed=false;WP._login=null;WP._denied=null;
  WP.state.lang='ar';WP.state.theme='dark';WP.ui.login.render(view);
  assert(view.querySelector('#login-email')&&view.querySelector('#login-password'),'password gate renders under AR/dark');
  WP.state.lang='en';WP.state.theme='light';WP.ui.login.render(view);
  assert(view.querySelector('#login-email')&&view.querySelector('#login-password'),'password gate renders under EN/light');

  // ── ANTI-IMPERSONATION #2: a leftover GOOGLE/OAuth session must NOT sign anyone
  //    in when the app is password-only. This is the "I can re-enter with Google" fix. ──
  function stubSbWithSession(sessionEmail, provider, opts){
    opts=opts||{};
    return {auth:{
      signOut:function(){opts.signOutCalled&&opts.signOutCalled();return Promise.resolve({});},
      getSession:function(){return Promise.resolve({data:{session:mkSession(sessionEmail,provider)}});},
      onAuthStateChange:function(){return {data:{subscription:{unsubscribe(){}}}};}
    }};
  }
  function mkSession(email, provider){ return {user:{email:email, app_metadata:{provider:provider}, identities:[{provider:provider}]}}; }

  // Google session for a fully-valid, access-having person → still rejected in password mode.
  let googOut=false; WP.state.authed=false; WP._login=null; WP._denied=null;
  WP._sb=stubSbWithSession('marco.delgado@example.com','google',{signOutCalled:()=>{googOut=true;}});
  WP.auth.handleSession(mkSession('marco.delgado@example.com','google'));
  assert(WP.state.authed===false,'password mode: a Google/OAuth session does NOT sign in (re-entry-with-Google fixed)');
  assert(googOut===true,'password mode: the rejected Google session is signed out of Supabase');

  // Control: an EMAIL/password-provider session for the same person IS accepted.
  WP.state.authed=false; WP._login=null; WP._denied=null; WP._sb=stubSbWithSession('marco.delgado@example.com','email');
  WP.auth.handleSession(mkSession('marco.delgado@example.com','email'));
  assert(WP.state.authed===true && WP.state.viewerId===X.person.id,'password mode: an email/password-provider session IS accepted');

  // ── reversible: flips cleanly back to the other providers ──
  WP.config.authMode='directory';assert(WP.auth.mode()==='directory','reversible → directory');
  WP.config.authMode='google';assert(WP.auth.mode()==='google','reversible → google');
  WP.config.authMode='verified-link';assert(WP.auth.mode()==='verified-link','reversible → verified-link');
  WP.config.authMode='password';

  if(errors.length){console.log('FAIL\n'+errors.join('\n'));process.exit(1);}
  console.log('PASS — password auth: email+password via Supabase signInWithPassword; identity is the VERIFIED SESSION email only (anti-impersonation: session X never resolves to person Y); wrong creds → one generic message; access-denied blocked+signed out; forgot/set password neutral; EN+AR both themes; reversible; Supabase stays wired for WP.db.');
  process.exit(0);
}catch(e){console.log('FAIL\n[run] '+e.message+'\n'+e.stack);process.exit(1);}})();
