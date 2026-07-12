/* WP.can() role + capability engine (wave/roles-can-engine).
 * Four roles derive from level+superAdmin; WP.can(cap,target) gates the UI and
 * delegates to the same relationship rules the DB RLS enforces. Proves the matrix:
 *   admin=all, director=org sensitive + manage access, manager=direct reports only,
 *   member=self only; resetPassword/manageRoles are ADMIN-ONLY. */
const fs=require('fs'),path=require('path');const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const srcs=[...html.matchAll(/src="([^"]+\.js)"/g)].map(m=>m[1]);
const dom=new JSDOM('<!doctype html><body></body>',{url:'https://x/',runScripts:'outside-only'});
const {window}=dom;window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});window.setInterval=()=>0;
for(const s of srcs){try{new window.Function(fs.readFileSync(path.join(root,s),'utf8')).call(window);}catch(e){}}
const WP=window.WP;const errors=[];const A=WP.access;const byId=A.byId;
function assert(c,m){if(!c)errors.push('[assert] '+m);}

const akram=byId('p_akram');
const dir=WP.data.PEOPLE.find(p=>p.level==='director');
const mgr=WP.data.PEOPLE.find(p=>p.level==='manager'||p.level==='sr_manager');
const mem=WP.data.PEOPLE.find(p=>p.level==='spec'||p.level==='sr_spec');
assert(akram&&dir&&mgr&&mem,'found one of each role in the data');

// roleOf
assert(A.roleOf(akram)==='admin','akram → admin (superAdmin)');
assert(A.roleOf(dir)==='director','a director → director');
assert(A.roleOf(mgr)==='manager','a manager → manager');
assert(A.roleOf(mem)==='member','a specialist → member');

// Admin-only caps
['resetPassword','manageRoles','editSettings'].forEach(c=>{
  assert(A.can(c,akram)===true,'admin can '+c);
  assert(A.can(c,dir)===false,'director CANNOT '+c);
  assert(A.can(c,mgr)===false,'manager CANNOT '+c);
  assert(A.can(c,mem)===false,'member CANNOT '+c);
});

// manageAccess = admin + director only
assert(A.can('manageAccess',akram)&&A.can('manageAccess',dir),'admin+director manage access');
assert(!A.can('manageAccess',mgr)&&!A.can('manageAccess',mem),'manager/member cannot manage access');

// viewSensitive is relationship-scoped
assert(A.can('viewSensitive',mem,mem.id)===true,'member sees OWN sensitive (self)');
assert(A.can('viewSensitive',mem,dir.id)===false,'member CANNOT see a director\'s sensitive');
const report=WP.data.PEOPLE.find(p=>p.managerId===mgr.id);
if(report){ assert(A.can('viewSensitive',mgr,report.id)===true,'manager sees a DIRECT report\'s sensitive'); }
const skip=report&&WP.data.PEOPLE.find(p=>p.managerId===report.id);
if(skip){ assert(A.can('viewSensitive',mgr,skip.id)===false,'manager CANNOT see a SKIP-level report\'s sensitive (least privilege)'); }
assert(A.can('viewSensitive',dir,mem.id)===true||A.roleOf(dir)!=='director','director sees org-wide sensitive');

// global convenience gates read the current viewer
WP.state=WP.state||{}; WP.state.viewerId='p_akram';
assert(WP.can('resetPassword')===true,'WP.can() (bound to viewer) works for admin');
WP.state.viewerId=mem.id;
assert(WP.can('resetPassword')===false && WP.roleOf()==='member','WP.can()/WP.roleOf() reflect the current member viewer');

if(errors.length){console.log('FAIL\n'+errors.join('\n'));process.exit(1);}
console.log('PASS — WP.can() engine: 4 roles from level+superAdmin; admin-only reset/roles/settings; manageAccess admin+director; viewSensitive scoped self/direct-report/director (skip-level denied); bound WP.can()/WP.roleOf() read the current viewer.');
process.exit(0);
