/* MVP FLAG — reversible "lean v1" gate (WP.config.mvp).
 * ONE flag flips the whole product between the proven core (v1) and the full
 * advanced layer — like the theme cutover. Nothing is deleted: every deferred
 * surface is HIDDEN and one line (mvp=false) from returning. We assert both states:
 *   - mvp=true  → deferred NAV entries absent, deferred ROUTES redirect home,
 *                 deferred in-screen PANELS not in the DOM, and the CORE renders fully;
 *   - mvp=false → every deferred surface returns (nav + routes + panels) — proof the
 *                 un-defer is total and reversible.
 * Both EN + AR, both themes. */
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
const configJs=fs.readFileSync(path.join(root,'src/js/core/config.js'),'utf8');
const distHtml=fs.existsSync(path.join(root,'dist/index.html'))?fs.readFileSync(path.join(root,'dist/index.html'),'utf8'):'';
const topbar=()=>window.document.getElementById('topbar');
const view=()=>window.document.getElementById('view');
const navIds=()=>[].slice.call(topbar().querySelectorAll('[data-go]')).map(b=>b.dataset.go);
const DEFERRED_ROUTES=['library','weekly','wellbeing','fairness','upward','org'];
const DEFERRED_NAV=['library','weekly','wellbeing','fairness','org'];
const CORE_NAV=['dashboard','map','daily','evaluations','me','permissions','settings'];
function finish(){if(errors.length){console.log('FAIL\n'+errors.join('\n'));process.exit(1);}
  console.log('PASS — mvp flag: ONE reversible flag (WP.config.mvp, default true, inlined into dist). mvp=true hides the deferred layer (nav entries removed, routes redirect home, in-screen panels — P6 dev panel, P1 timeline, P3 band/consistency/prep — absent) while the core renders fully; mvp=false restores every surface (nav + routes + panels). Nothing deleted; one line reverses it. EN + AR, both themes.');
  process.exit(0);}

(async()=>{
try{
  // ── THE FLAG itself ──
  assert(WP.config.mvp===true,'WP.config.mvp defaults to true (lean v1)');
  assert(typeof WP.deferred==='function','WP.deferred() guard helper exists');
  assert(/WP\.config\.mvp\s*=\s*true/.test(configJs),'flag is declared in config.js (default true)');
  assert(/flip to false to un-defer/i.test(configJs),'config.js documents the one-line reversal (like DEFAULT_THEME)');
  assert(/WP\.config\.mvp/.test(distHtml),'the flag is inlined into the built dist (ships in the bundle)');
  DEFERRED_ROUTES.forEach(id=>assert(WP.deferred(id)===true,'mvp=true defers "'+id+'"'));
  CORE_NAV.forEach(id=>assert(WP.deferred(id)===false,'core surface "'+id+'" is never deferred'));

  const PEOPLE=WP.data.PEOPLE||[];
  const dir=PEOPLE.find(p=>WP.access.canManage(p));assert(dir,'a director/admin exists');
  const starget=PEOPLE.find(p=>WP.access.canSeeSensitive(dir,p.id)&&p.id!==dir.id)||dir;
  WP.state.authed=true;WP.state.lang='en';WP.state.viewerId=dir.id;

  // ============================================================
  //  mvp = TRUE  →  LEAN v1
  // ============================================================
  WP.config.mvp=true;
  WP.setState({route:'dashboard'});

  // NAV — deferred entries absent, core present
  const navT=navIds();
  DEFERRED_NAV.forEach(id=>assert(navT.indexOf(id)<0,'mvp=true: nav hides "'+id+'"'));
  ['dashboard','map','evaluations','daily','me'].forEach(id=>assert(navT.indexOf(id)>=0,'mvp=true: core nav keeps "'+id+'"'));
  assert(navT.indexOf('permissions')>=0 && navT.indexOf('settings')>=0,'mvp=true: permissions + settings kept for managers');

  // ROUTES — every deferred route redirects to home (defence in depth)
  DEFERRED_ROUTES.forEach(id=>{
    WP.setState({route:id});
    assert(WP.state.route==='dashboard','mvp=true: route "'+id+'" redirects home');
  });
  // and the deferred bodies never paint (org/weekly/library content absent)
  WP.setState({route:'org'});assert(!/Capability distribution/.test(view().textContent),'mvp=true: org body never paints');
  WP.setState({route:'library'});assert(!/WBK Component Library/.test(view().innerHTML),'mvp=true: component library never paints');

  // CORE renders fully
  WP.setState({route:'dashboard'});assert(view().innerHTML.length>200,'mvp=true: dashboard renders');
  WP.setState({route:'daily'});assert(view().innerHTML.length>100,'mvp=true: daily check-in renders');
  WP.setState({route:'permissions'});assert(view().innerHTML.length>100,'mvp=true: permissions renders');

  // PROFILE — core works, P6 dev panel + P1 timeline hidden (even with data present)
  const populated={enoughEvidence:true,strengths:[{area:'delivery',text:'x',evidence:[]}],growthAreas:[],evidenceCoverage:{byCategory:{},byQuarter:{},sourcedCount:0},gaps:[],subjectId:starget.id};
  WP._devCache={id:starget.id,prof:populated};
  WP.readiness.developmentProfile=function(){return Promise.resolve(populated);};
  WP.setState({route:'profile',selectedId:starget.id});
  for(let i=0;i<6;i++) await Promise.resolve();
  assert(/pressure|Pressure|الضغط/.test(view().textContent)||view().innerHTML.length>200,'mvp=true: core profile renders');
  assert(!/Development & growth/.test(view().textContent),'mvp=true: P6 "Development & growth" panel is hidden');
  assert(!view().querySelector('.rd-block'),'mvp=true: no dev-panel block in the DOM');

  // EVALUATION — core review works, P3 suggested band + P2 prep hidden
  WP.setState({route:'evaluation',selectedId:starget.id,evalOrigin:'evaluations'});
  for(let i=0;i<4;i++) await Promise.resolve();
  assert(view().querySelector('#approve'),'mvp=true: core evaluation (criteria + approve) renders');
  assert(!view().querySelector('#eval-suggested-band'),'mvp=true: P3 suggested-range band is hidden');
  assert(!view().querySelector('#eval-prep-host'),'mvp=true: P2 evidence-prep summary is hidden');

  // EVALUATIONS hub — P3 consistency cards hidden
  WP.setState({route:'evaluations'});
  for(let i=0;i<4;i++) await Promise.resolve();
  assert(!view().querySelector('#eval-consist-host'),'mvp=true: P3 consistency host is hidden');

  // ============================================================
  //  mvp = FALSE  →  EVERYTHING RETURNS (reversibility proof)
  // ============================================================
  WP.config.mvp=false;
  WP.setState({route:'dashboard'});
  const navF=navIds();
  DEFERRED_NAV.forEach(id=>assert(navF.indexOf(id)>=0,'mvp=false: nav restores "'+id+'"'));
  // routes no longer redirect
  WP.setState({route:'weekly'});assert(WP.state.route==='weekly','mvp=false: deferred route "weekly" is reachable again');
  WP.setState({route:'org'});assert(WP.state.route==='org','mvp=false: deferred route "org" is reachable again');
  // panels return
  WP.setState({route:'profile',selectedId:starget.id});
  for(let i=0;i<6;i++) await Promise.resolve();
  assert(/Development & growth/.test(view().textContent),'mvp=false: P6 dev panel returns');
  WP.setState({route:'evaluation',selectedId:starget.id,evalOrigin:'evaluations'});
  for(let i=0;i<4;i++) await Promise.resolve();
  assert(view().querySelector('#eval-suggested-band'),'mvp=false: P3 suggested band returns');
  assert(view().querySelector('#eval-prep-host'),'mvp=false: P2 prep summary returns');
  WP.setState({route:'evaluations'});
  for(let i=0;i<4;i++) await Promise.resolve();
  assert(view().querySelector('#eval-consist-host'),'mvp=false: P3 consistency host returns');

  // ── EN + AR, both themes — render cleanly in each state ──
  WP.config.mvp=true;
  WP.state.lang='ar';WP.state.theme='light';WP.setState({route:'dashboard'});
  assert(navIds().indexOf('weekly')<0,'mvp=true under AR/light: deferred nav still hidden');
  assert(view().innerHTML.length>0,'mvp=true renders under AR + light theme');
  WP.state.theme='dark';WP.setState({route:'dashboard'});assert(view().innerHTML.length>0,'mvp=true renders under AR + dark theme');
  WP.config.mvp=false;WP.setState({route:'dashboard'});
  assert(navIds().indexOf('weekly')>=0,'mvp=false under AR: deferred nav returns');
  WP.state.lang='en';
}catch(e){errors.push('[run] '+e.message+'\n'+e.stack);}
finish();
})();
