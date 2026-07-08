/* Set-new-password recovery-return (wave/password-recovery-screen).
 * After a reset/"set password" link, Supabase fires PASSWORD_RECOVERY. Instead of
 * signing in, the app shows a set-new-password screen; on submit it validates
 * (length + match) then updateUser({password}) and signs in from the VERIFIED
 * session (identity = session email, never a typed value). Proves:
 *   • PASSWORD_RECOVERY routes to the set-password screen, NOT an auto sign-in,
 *   • new + confirm password fields render (EN+AR, both themes),
 *   • too-short and mismatched passwords are rejected WITHOUT calling updateUser,
 *   • a valid password calls updateUser then signs in as the SESSION identity
 *     (anti-impersonation preserved),
 *   • a failed update shows one generic message and does NOT sign in.
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
const tick=()=>new Promise(r=>setTimeout(r,0));

// A recovery stub: captures the onAuthStateChange handler so the test can fire
// PASSWORD_RECOVERY; getSession returns whatever `store.session` is set to;
// updateUser records the args and can be made to fail.
function recoveryStub(store){
  return {auth:{
    onAuthStateChange:function(cb){store.authCb=cb;return {data:{subscription:{unsubscribe(){}}}};},
    getSession:function(){return Promise.resolve({data:{session:store.session||null}});},
    updateUser:function(a){store.updateArgs=a;store.updateCalls=(store.updateCalls||0)+1;
      if(store.updateFail) return Promise.resolve({data:{user:null},error:{message:'x'}});
      return Promise.resolve({data:{user:{email:store.email}},error:null});},
    signInWithPassword:function(){return Promise.resolve({data:{session:null},error:{message:'n/a'}});},
    resetPasswordForEmail:function(){return Promise.resolve({data:{},error:null});},
    signOut:function(){return Promise.resolve({});}
  }};
}

(async function(){try{
  WP.config.authMode='password';
  const view=window.document.getElementById('view');
  assert(view,'#view exists for rerender');
  assert(typeof WP.auth.updateNewPassword==='function','updateNewPassword is exported');

  const EMAIL='motaa@webook.com';
  const X=WP.auth.findByEmail(EMAIL), Y=WP.auth.findByEmail('ayman@webook.com');
  assert(X.person && Y.person && X.person.id!==Y.person.id,'motaa and ayman are distinct accounts');

  // ── PASSWORD_RECOVERY routes to the set-password screen, NOT an auto sign-in ──
  const store={email:EMAIL, session:null};
  WP.state.authed=false;WP._login=null;WP._denied=null;WP._recovery=null;WP._sb=recoveryStub(store);
  WP.auth.initSession();
  await tick();
  assert(typeof store.authCb==='function','initSession registered an auth-state handler');
  store.authCb('PASSWORD_RECOVERY',{user:{email:EMAIL}});
  assert(WP.state.authed===false,'PASSWORD_RECOVERY does NOT auto sign-in');
  assert(WP._login && WP._login.step==='setpw','PASSWORD_RECOVERY routes to the set-password screen');
  assert(WP._recovery && WP._recovery.user.email===EMAIL,'recovery session is retained');

  WP.ui.login.render(view);
  assert(view.querySelector('#setpw-new') && view.querySelector('#setpw-new').type==='password','new-password field renders');
  assert(view.querySelector('#setpw-confirm') && view.querySelector('#setpw-confirm').type==='password','confirm-password field renders');
  assert(!view.querySelector('#login-password'),'the normal sign-in password field is NOT shown on the set-password screen');

  // ── mismatch → rejected WITHOUT calling updateUser ──
  store.updateCalls=0;
  view.querySelector('#setpw-new').value='abcdefgh1';
  view.querySelector('#setpw-confirm').value='different1';
  view.querySelector('#setpw-form').dispatchEvent(new window.Event('submit'));
  await tick();
  assert((store.updateCalls||0)===0,'mismatched passwords do NOT call updateUser');
  assert(WP._login && WP._login.err==='pwMismatch','mismatch → pwMismatch');

  // ── too short → rejected WITHOUT calling updateUser ──
  WP.ui.login.render(view);
  view.querySelector('#setpw-new').value='short';
  view.querySelector('#setpw-confirm').value='short';
  view.querySelector('#setpw-form').dispatchEvent(new window.Event('submit'));
  await tick();
  assert((store.updateCalls||0)===0,'too-short password does NOT call updateUser');
  assert(WP._login && WP._login.err==='pwTooShort','too short → pwTooShort');

  // ── valid → updateUser called, then signed in as the SESSION identity ──
  store.session={user:{email:EMAIL}};   // after update, the verified session is live
  WP.ui.login.render(view);
  view.querySelector('#setpw-new').value='goodpassw0rd';
  view.querySelector('#setpw-confirm').value='goodpassw0rd';
  view.querySelector('#setpw-form').dispatchEvent(new window.Event('submit'));
  await tick();await tick();
  assert(store.updateCalls===1,'valid password calls updateUser once');
  assert(store.updateArgs && store.updateArgs.password==='goodpassw0rd','updateUser receives the new password');
  assert(WP.state.authed===true,'after setting the password the person is signed in');
  assert(WP.state.viewerId===X.person.id,'ANTI-IMPERSONATION: signed in as the SESSION identity (motaa), from the verified session email');

  // ── failed update → one generic message, not signed in ──
  const store2={email:EMAIL, session:{user:{email:EMAIL}}, updateFail:true};
  WP.state.authed=false;WP._login={step:'setpw',email:EMAIL};WP._sb=recoveryStub(store2);
  WP.ui.login.render(view);
  view.querySelector('#setpw-new').value='goodpassw0rd';
  view.querySelector('#setpw-confirm').value='goodpassw0rd';
  view.querySelector('#setpw-form').dispatchEvent(new window.Event('submit'));
  await tick();await tick();
  assert(WP.state.authed===false,'a failed password update does NOT sign in');
  assert(WP._login && WP._login.err==='errSetPw','failed update → generic errSetPw');

  // ── EN+AR both themes render the set-password screen ──
  WP.state.authed=false;WP._login={step:'setpw',email:EMAIL};WP._denied=null;
  WP.state.lang='ar';WP.state.theme='dark';WP.ui.login.render(view);
  assert(view.querySelector('#setpw-new')&&view.querySelector('#setpw-confirm'),'set-password renders under AR/dark');
  WP.state.lang='en';WP.state.theme='light';WP.ui.login.render(view);
  assert(view.querySelector('#setpw-new')&&view.querySelector('#setpw-confirm'),'set-password renders under EN/light');

  if(errors.length){console.log('FAIL\n'+errors.join('\n'));process.exit(1);}
  console.log('PASS — set-new-password recovery-return: PASSWORD_RECOVERY routes to the set-password screen (no auto sign-in); too-short/mismatch rejected without updateUser; valid password → updateUser then sign-in as the VERIFIED session identity (anti-impersonation); failed update → one generic message; EN+AR both themes.');
  process.exit(0);
}catch(e){console.log('FAIL\n[run] '+e.message+'\n'+e.stack);process.exit(1);}})();
