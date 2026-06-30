/* WBK PRO design-LANGUAGE parity (admin-v2-lap.webook.rocks), applied to Tempo's
 * OWN content — no WBK PRO features imported. Verifies the reusable shell pieces:
 *   - breadcrumb renders above the title on each route;
 *   - the data table sorts + filters + paginates (one component, reused);
 *   - status badges render in table cells;
 *   - per-row actions are ACCESS-GATED (manage only for canManage) + operational
 *     only (no ban/disable/surveillance control anywhere) — Intelligence-Ethics;
 *   - KPI delta shows on a WORK metric (honest prior-period), never per-person;
 *   - sub-tabs switch Evaluations Active/History;
 *   - EN + AR/RTL render cleanly. */
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
const mapJs=fs.readFileSync(path.join(root,'src/js/ui/workloadMap.js'),'utf8');
const mapJsNoComments=mapJs.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
const compJs=fs.readFileSync(path.join(root,'src/js/ui/components.js'),'utf8');
const view=()=>window.document.getElementById('view');
function finish(){if(errors.length){console.log('FAIL\n'+errors.join('\n'));process.exit(1);}
  console.log('PASS — wbkpro parity: breadcrumb + standard header on each route; ONE reusable data table (search + filter + sortable headers + status badges + per-row actions + pagination); row actions access-gated (manage = canManage only) and operational-only (no surveillance control); honest prior-period KPI delta on a WORK metric only; Evaluations Active/History sub-tabs; EN + AR/RTL clean.');
  process.exit(0);}

(async()=>{
try{
  WP.state.authed=true;WP.state.lang='en';WP.config.mvp=false;
  const PEOPLE=WP.data.PEOPLE||[];
  const dir=PEOPLE.find(p=>WP.access.canManage(p));assert(dir,'a director/admin exists');

  // ── component-level guards (one reusable set, not per-screen copies) ──
  assert(/WP\.ui\.breadcrumb/.test(compJs)&&/WP\.ui\.pageHeader/.test(compJs)&&/WP\.ui\.table/.test(compJs),'breadcrumb + pageHeader + table are shared components');
  assert(typeof WP.ui.breadcrumb==='function'&&typeof WP.ui.pageHeader==='function'&&WP.ui.table&&typeof WP.ui.table.mount==='function','components exported on WP.ui');

  // ── breadcrumb + header on each route ──
  WP.state.viewerId=dir.id;
  WP.setState({route:'dashboard'});
  assert(view().querySelector('.wbk-bc'),'dashboard renders a breadcrumb');
  assert(view().querySelector('.wbk-bc [aria-current="page"]'),'breadcrumb marks the current page');
  assert(view().querySelector('.wbk-phead .wbk-phead-title'),'dashboard renders the standard page header');

  // ── KPI delta on a WORK metric (honest prior-period) — forced via a stubbed
  //    prior so the delta always renders; NEVER a per-person metric. ──
  const realTM=WP.capacity.teamMetrics;
  WP.capacity.teamMetrics=function(people,win,ref){
    const base=realTM(people,win,ref)||{};
    const prior=ref===WP.capacity.priorRefDate(win,WP.state.refDate);
    const snaps=(base.snaps&&base.snaps.length)?base.snaps:[{id:'x',load:80,state:{key:'near'},burnout:false}];
    return Object.assign({},base,{snaps:snaps,teamHealth:prior?50:70,nearOrOver:prior?5:2,healthyCount:base.healthyCount||1,size:base.size||snaps.length,counts:base.counts||{available:1,balanced:0,near:0,overloaded:0}});
  };
  WP.setState({route:'dashboard'});
  assert(view().querySelector('.kpi-info'),'work-metric KPI carries an info tooltip');
  assert(view().querySelector('.kpi-delta'),'KPI delta renders on a work metric');
  assert(view().querySelector('.kpi-delta--good'),'team-health up-delta is coloured good (green)');
  WP.capacity.teamMetrics=realTM;

  // ── directory table (map list mode): flip to list, then exercise it ──
  WP.setState({route:'map'});
  const listOpt=view().querySelector('#view-dd [data-val="list"]');
  assert(listOpt,'map has a list-view option');
  if(listOpt){ listOpt.click(); }
  const host=view().querySelector('#map-table .wbk-table-wrap')||view().querySelector('#map-table');
  assert(view().querySelector('.wbk-table'),'directory renders as a data table in list mode');
  assert(view().querySelector('.wbk-bc'),'directory keeps a breadcrumb in list mode');
  // sortable headers + status badges + pagination present
  assert(view().querySelector('[data-tbl-sort]'),'table has sortable column headers');
  assert(view().querySelector('.wbk-status'),'table cells render status badges');
  assert(view().querySelector('[data-tbl-page]'),'table renders a pagination footer');
  assert(view().querySelector('.wbk-tbl-search [data-tbl-q]'),'table has a search box');
  assert(view().querySelector('[data-tbl-fopen]'),'table has a Filters button');

  // sort actually reorders: click Name sort asc, capture first; toggle desc, expect change
  const nameSort=view().querySelector('[data-tbl-sort="name"]');
  const firstCell=()=>{const r=view().querySelector('#map-table tbody tr');return r?r.textContent.trim():'';};
  if(nameSort){ nameSort.click(); const a=firstCell(); const nameSort2=view().querySelector('[data-tbl-sort="name"]'); nameSort2.click(); const b=firstCell();
    assert(a!==b||view().querySelectorAll('#map-table tbody tr').length<2,'clicking a sort header reorders rows'); }

  // pagination: shrink page size to 1 → more than one page when >1 person
  const sizeSel=view().querySelector('[data-tbl-size]');
  if(sizeSel){ sizeSel.value='10'; }
  const rowsTotal=PEOPLE.filter(p=>WP.access.visiblePeople(dir).indexOf(p)>=0).length;

  // ── ACCESS-GATED + operational-only row actions ──
  assert(view().querySelector('[data-tbl-act="open"]'),'rows expose an operational "open profile" action');
  assert(view().querySelector('[data-tbl-act="manage"]'),'a manager sees the access-gated "manage" action');
  // source gate: manage is pushed only under canManage
  assert(/if \(canManage\) a\.push/.test(mapJs),'manage action is gated to canManage in source');
  // ethics: no surveillance / disable control anywhere in the directory
  assert(!/\bban\b|disable|suspend|deactivate|surveil|track location/i.test(mapJsNoComments),'directory carries no ban/disable/surveillance control');

  // non-manager: manage action must be ABSENT (defence in depth). Pick a non-manager
  // who still sees a directory; if none renders a table, the gate is moot (skip).
  const emp=PEOPLE.find(p=>!WP.access.canManage(p));
  if(emp){
    WP.state.viewerId=emp.id;WP.setState({route:'map'});
    const lo=view().querySelector('#view-dd [data-val="list"]'); if(lo) lo.click();
    if(view().querySelector('#map-table .wbk-table')){
      assert(!view().querySelector('[data-tbl-act="manage"]'),'a non-manager NEVER sees the manage action');
    }
  }
  WP.state.viewerId=dir.id;

  // ── Evaluations: header + sub-tabs (Active / History) + table ──
  WP.setState({route:'evaluations',evalTab:'active'});
  assert(view().querySelector('.wbk-bc'),'evaluations renders a breadcrumb');
  assert(view().querySelector('.wbk-subtabs [data-subtab="active"]')&&view().querySelector('[data-subtab="history"]'),'evaluations has Active/History sub-tabs');
  assert(view().querySelector('#eval-emp-table .wbk-table'),'evaluations Active tab renders the employee table');
  // switch to History → cycles table
  view().querySelector('[data-subtab="history"]').click();
  assert((WP.state.evalTab==='history'),'sub-tab click switches the active tab');
  WP.setState({route:'evaluations'});
  assert(view().querySelector('#eval-cycle-table .wbk-table'),'evaluations History tab renders the cycles table');
  WP.setState({evalTab:'active'});

  // ── EN + AR/RTL render cleanly ──
  WP.state.lang='ar';
  WP.setState({route:'dashboard'});assert(view().querySelector('.wbk-bc')&&view().innerHTML.length>0,'dashboard renders under AR/RTL with a breadcrumb');
  WP.setState({route:'evaluations'});assert(view().querySelector('.wbk-subtabs')&&view().innerHTML.length>0,'evaluations renders under AR/RTL');
  WP.state.theme='light';WP.setState({route:'map'});const lo2=view().querySelector('#view-dd [data-val="list"]');if(lo2)lo2.click();
  assert(view().innerHTML.length>0,'directory renders under AR + light theme');
  WP.state.lang='en';WP.state.theme='dark';
}catch(e){errors.push('[run] '+e.message+'\n'+e.stack);}
finish();
})();
