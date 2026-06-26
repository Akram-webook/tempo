/* Finder team rows ("Led by", lead avatar) + mandatory evaluation banner behavior. */
const fs=require('fs'),path=require('path');const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const srcs=[...html.matchAll(/src="([^"]+\.js)"/g)].map(m=>m[1]);
const shellBody=(html.match(/<body[^>]*>([\s\S]*?)<\/body>/)||[,''])[1].replace(/<script[\s\S]*?<\/script>/g,'');
const dom=new JSDOM('<!doctype html><html><body>'+shellBody+'</body></html>',{url:'https://localhost/',pretendToBeVisual:true,runScripts:'outside-only'});
const {window}=dom;window.HTMLElement.prototype.scrollIntoView=function(){};window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});window.setInterval=()=>0;window.confirm=()=>false;window.alert=()=>{};window.prompt=()=>null;
const errors=[];const benign=/font|stylesheet|localStorage|Security|scrollIntoView|Not implemented|opaque|insertRule|cssRules/i;
['error','warn'].forEach(k=>{const o=window.console[k].bind(window.console);window.console[k]=(...a)=>{const s=a.join(' ');if(!benign.test(s))errors.push('['+k+'] '+s);o(...a);};});
window.addEventListener('error',e=>{if(!benign.test(String(e.message)))errors.push('[onerror] '+e.message);});
for(const s of srcs){try{new window.Function(fs.readFileSync(path.join(root,s),'utf8')).call(window);}catch(e){errors.push('[load '+s+'] '+e.message);}}
const WP=window.WP;function assert(c,m){if(!c)errors.push('[assert] '+m);}
try{
  WP.state.authed=true;WP.state.lang='en';
  // a manager with reports → land on dashboard via full app render → mandatory banner shows
  const mgr=WP.data.PEOPLE.find(p=>WP.access.directReports(p.id).length>0 && WP.data.EVALUATIONS);
  WP.state.viewerId=mgr.id; WP.state.route='dashboard'; WP.render();
  const req=WP.evaluation.requiredFor(mgr.id);
  const banner=window.document.getElementById('eval-banner');
  if(req.pending>0){
    assert(banner && !banner.hidden && /Review now/.test(banner.textContent),'mandatory banner shows for a manager with pending reviews ('+mgr.name+')');
    assert(/reviews due/.test(banner.textContent),'banner names the cycle + reviews due');
  }
  // navigate to another page → banner persists (lives above #view)
  WP.state.route='daily'; WP.render();
  if(req.pending>0) assert(!window.document.getElementById('eval-banner').hidden,'banner persists after navigating to another page');
  // due info present + active cycle is the quarterly one
  const di=WP.evaluation.dueInfo(); assert(di && di.cycle && di.cycle.status==='Active','active cycle has a due date');
  // finder team rows: render map, focus finder, check team rows say "Led by" and use avatars
  WP.state.route='map'; WP.render();
  const input=window.document.querySelector('#map-search'); input.value=''; input.onfocus();
  const dd=window.document.querySelector('#map-suggest');
  const teamRow=dd.querySelector('.pr-team');
  assert(teamRow,'finder lists team rows');
  if(teamRow){ assert(/Led by/.test(teamRow.textContent),'team row shows "Led by <lead>"');
    assert(teamRow.querySelector('.avatar'),'team row uses the lead avatar (photo/initials), not a generic icon');
    assert(/View team/.test(teamRow.textContent),'team row has a View team action'); }
}catch(e){errors.push('[run] '+e.message+'\n'+e.stack);}
if(errors.length){console.log('FAIL\n'+errors.join('\n'));process.exit(1);}
console.log('PASS — finder team rows (Led by + avatar + View team) and the mandatory, persistent evaluation banner all work.');
process.exit(0);
