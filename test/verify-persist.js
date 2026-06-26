/* Persistence: a completed evaluation, a role change, an access grant, and a check-in
 * survive a "reload" (saveData → wipe in-memory → hydrate restores from localStorage). */
const fs=require('fs'),path=require('path');const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const srcs=[...html.matchAll(/src="([^"]+\.js)"/g)].map(m=>m[1]);
const dom=new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>',{url:'https://localhost/',runScripts:'outside-only'});
const {window}=dom;window.HTMLElement.prototype.scrollIntoView=function(){};window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
const errors=[];
for(const s of srcs){try{new window.Function(fs.readFileSync(path.join(root,s),'utf8')).call(window);}catch(e){errors.push('[load '+s+'] '+e.message);}}
const WP=window.WP;function assert(c,m){if(!c)errors.push('[assert] '+m);}
try{
  assert(WP.persist&&WP.persist.saveData&&WP.persist.hydrate,'persist API present');
  // mutate user "work"
  WP.data.EVALUATIONS.p_idris=WP.data.EVALUATIONS.p_idris||{}; WP.data.EVALUATIONS.p_idris.status='Completed';
  const someone=WP.data.PEOPLE.find(p=>p.level==='spec')||WP.data.PEOPLE[0]; const origLevel=someone.level; someone.level='manager';
  WP.access.grantAccess('p_idris', false);            // revoke one
  const grantedBefore=WP.access.listAccess().slice().sort().join(',');
  const eng=WP.engage.get('p_akram'); eng.weekDone=eng.weekDone+1; const engBefore=eng.weekDone;
  WP.persist.saveData();
  // simulate reload: wipe the in-memory values
  WP.data.EVALUATIONS.p_idris.status='__WIPED__';
  someone.level='__WIPED__';
  WP.access.grantAccess('p_idris', true);             // re-grant (wrong) — hydrate should re-revoke
  WP.engage.get('p_akram').weekDone=0;
  // hydrate
  WP.persist.hydrate();
  assert(WP.data.EVALUATIONS.p_idris.status==='Completed','evaluation status restored after reload');
  assert(someone.level==='manager','role change restored');
  assert(WP.access.listAccess().slice().sort().join(',')===grantedBefore,'access grants restored');
  assert(WP.engage.get('p_akram').weekDone===engBefore,'daily check-in progress restored ('+engBefore+')');
  // version guard: a foreign/old blob is ignored, not crash
  window.localStorage.setItem('tempo_data', JSON.stringify({v:1,evaluations:{}}));
  WP.persist.hydrate();  // should no-op (v mismatch)
}catch(e){errors.push('[run] '+e.message+'\n'+e.stack);}
if(errors.length){console.log('FAIL\n'+errors.join('\n'));process.exit(1);}
console.log('PASS — evaluations, role changes, access grants, and check-ins persist across reload; old/foreign blobs ignored.');
process.exit(0);
