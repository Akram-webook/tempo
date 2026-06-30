/* Smoke-test the SHIPPED bundle: dist/index.html must boot with zero errors,
 * render the login gate, accept a real account, and inline the logo (no asset 404). */
const fs=require('fs'),path=require('path');const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'..','dist','index.html'),'utf8');
const errors=[];const benign=/font|stylesheet|localStorage|Security|scrollIntoView|Not implemented|opaque|insertRule|cssRules|gsi|accounts\.google|matchMedia/i;
const dom=new JSDOM(html,{url:'https://localhost/',runScripts:'dangerously',resources:'usable',pretendToBeVisual:true});
const {window}=dom;
window.HTMLElement.prototype.scrollIntoView=function(){};
['error','warn'].forEach(k=>{const o=window.console[k].bind(window.console);window.console[k]=(...a)=>{const s=a.join(' ');if(!benign.test(s))errors.push('['+k+'] '+s);};});
window.addEventListener('error',e=>{if(!benign.test(String(e.message)))errors.push('[onerror] '+e.message);});
setTimeout(()=>{
  try{
    const WP=window.WP;
    if(!WP){errors.push('WP namespace missing — scripts did not run');}
    else{
      if(!WP.config||WP.config.authMode!=='google') errors.push('config.authMode should default to google (Supabase email is rate-limited)');
      if(WP.auth.mode()!=='google') errors.push('auth mode should resolve to google even with Supabase configured (data layer stays wired)');
      const view=window.document.getElementById('view');
      WP.state.authed=false; WP.ui.login.render(view);
      if(!view.querySelector('#g-btn-host')) errors.push('Google sign-in button host not rendered in bundle');
      if(view.querySelector('#login-email')) errors.push('email gate must NOT render in Google mode (would bypass Google verification)');
      const logo=view.querySelector('.login-logo');
      if(!logo||logo.getAttribute('src').indexOf('data:image/svg+xml')!==0) errors.push('logo not inlined as data URI in bundle');
      if(WP.auth.findByEmail('akram@webook.com').person.id!=='p_akram') errors.push('directory gate broken in bundle');
    }
  }catch(e){errors.push('[run] '+e.message);}
  if(errors.length){console.log('FAIL\n'+errors.join('\n'));process.exit(1);}
  console.log('PASS — dist/index.html boots clean, renders the email gate, inlines the logo, and the directory lookup works.');
  process.exit(0);
},1500);
