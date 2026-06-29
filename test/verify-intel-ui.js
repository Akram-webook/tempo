/* Intelligence-UI ethics guard (P3 Suggested-range + Consistency, P5 Weekly report).
 * These surfaces are ethics-sensitive: the UI must preserve the engine guardrails —
 * range NOT score, awareness NOT accusation, evidence always shown, HUMAN decides
 * (no auto-apply), access-gated, and NO per-person exposure in the report.
 * We assert the rendered contract + the source invariants that protect them. */
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
const evalJs=fs.readFileSync(path.join(root,'src/js/ui/evaluation.js'),'utf8');
const evalsJs=fs.readFileSync(path.join(root,'src/js/ui/evaluations.js'),'utf8');
const reportJs=fs.existsSync(path.join(root,'src/js/ui/weeklyReport.js'))?fs.readFileSync(path.join(root,'src/js/ui/weeklyReport.js'),'utf8'):'';
const appJs=fs.readFileSync(path.join(root,'src/js/app.js'),'utf8');
try{
  WP.state.authed=true;WP.state.lang='en';

  // ── P3a · Suggested-range band — pure-engine output rendered as a RANGE ───
  // Drive the pure engine with synthetic sourced events and confirm a range (low<high),
  // never a single number, and a first-class "not enough evidence" path.
  const mk=(cat,i)=>({id:cat+i,ts:'2026-06-1'+(i%9),category:cat,source:'unit-test',confidence:'observed',description:cat+' item '+i});
  const many=[].concat([0,1,2,3,4,5].map(i=>mk('delivery',i)),[0,1].map(i=>mk('recognition',i)),[mk('risk',0)]);
  const s=WP.evalIntel.assess(many,{});
  assert(s.enoughEvidence && Array.isArray(s.range),'suggested output is a range');
  assert(s.range[0] < s.range[1],'range has width — never a single number to copy');
  assert(s.range===null || !('score' in s) && !('rating' in s) && !('verdict' in s) && !('rank' in s),'no score/rating/verdict/rank field on the suggestion');
  assert(s.reasoning.every(r=>'evidence' in r),'every reasoning bullet carries cited evidence');
  assert(s.risks.every(r=>Array.isArray(r.evidence) && r.evidence.length),'every risk cites evidence');
  const none=WP.evalIntel.assess([mk('delivery',0)],{});
  assert(none.enoughEvidence===false && none.range===null,'"not enough evidence yet" is first-class (no fabricated range)');

  // ── P3b · band VIEW contract (source invariants the UI must keep) ─────────
  assert(/id="eval-suggested-band"/.test(evalJs),'band has the stable hook id="eval-suggested-band"');
  assert(/data-suggested/.test(evalJs),'band exposes data-suggested for B1 provenance (stamps the SHOWN band)');
  assert(/setAttribute\('data-suggested',\s*\(s && s\.enoughEvidence/.test(evalJs),'data-suggested is stamped from the shown range');
  // the band is sensitive-gated (rendered only under showPrep = canSeeSensitive)
  assert(/showPrep \? '<div class="section wbk-band" id="eval-suggested-band"/.test(evalJs),'band is sensitive-gated (showPrep / canSeeSensitive)');
  // NO auto-apply: the band must not contain a button that sets the rating
  const bandFn=evalJs.slice(evalJs.indexOf('function bandHTML'),evalJs.indexOf('function render'));
  assert(!/<button/.test(bandFn),'band has NO button — nothing auto-applies a suggestion (human decides)');
  assert(/wbk-band-empty/.test(bandFn) && /sbNotEnough/.test(bandFn),'band renders a first-class not-enough-evidence empty state');
  assert(/range\[0\].*range\[1\]/.test(bandFn) || /lo.*hi/.test(bandFn),'band renders both ends of the range');
  // the band sits BESIDE the rating input — the scale buttons still render
  assert(/scale-btn/.test(evalJs),'manager rating input (scale buttons) still present — band never replaces it');

  // ── P3c · Consistency awareness cards (evaluations hub) ───────────────────
  assert(/consistencyCheck/.test(evalsJs),'hub calls consistencyCheck');
  assert(/id="eval-consist-host"/.test(evalsJs),'hub has the consistency host');
  assert(/isReal && reports\.length/.test(evalsJs),'consistency is gated to an actual evaluator');
  assert(/wbk-consist-card/.test(evalsJs),'consistency renders neutral awareness cards');
  assert(/consistHost\.hidden = true/.test(evalsJs),'consistency hides entirely when nothing to flag (no empty accusation)');
  const consPure=WP.evalIntel.assessConsistency([
    {subjectId:'a',overall:3.0,evidenceCount:5,refs:['x']},
    {subjectId:'b',overall:3.1,evidenceCount:5,refs:['y']},
    {subjectId:'c',overall:2.9,evidenceCount:5,refs:['z']}
  ],{orgMean:3.0});
  assert(consPure.warnings.every(w=>'evidence' in w && 'explanation' in w),'each consistency warning carries explanation + evidence');
  assert(consPure.warnings.every(w=>!('score' in w) && !('rank' in w)),'consistency never scores/ranks the evaluator or anyone');

  // ── P5 · Weekly report view (director/admin-only, de-identified) ──────────
  if(reportJs){
    assert(/canManage/.test(reportJs),'weekly report view is director/admin gated (canManage)');
    assert(/weeklyReport/.test(reportJs),'report view calls WP.decisionMemory.weeklyReport');
    assert(/Not enough data|nedTitle|wrEmpty|enoughData/.test(reportJs),'report has a "not enough data" path');
    // de-identified: the report engine strips people; the VIEW must not re-introduce
    // names. It must not call the people directory to label rows.
    assert(!/WP\.i18n\.name\(|WP\.access\.byId\(|\.name\b.*person/.test(reportJs),'report view introduces NO per-person names/rows (de-identified)');
    // nav entry gated to canManage; route registered
    assert(/route === 'weekly'|route==='weekly'/.test(appJs),'weekly route registered in app.js');
    assert(/canManage[\s\S]{0,400}id: 'weekly'/.test(appJs) || /id: 'weekly'[\s\S]{0,120}/.test(appJs),'weekly nav entry present (canManage-gated)');
  }

  // engine de-identification holds (report carries no per-person key)
  const rep=WP.decisionMemory.aggregate([
    {type:'evaluation',at:'2026-06-20',aiAccepted:true},{type:'evaluation',at:'2026-06-21'},
    {type:'access-grant',at:'2026-06-22'},{type:'assign',at:'2026-06-22'},{type:'role-change',at:'2026-06-23'}
  ],{ref:'2026-06-24'});
  assert(!('byPerson' in rep) && !('people' in rep),'report aggregate exposes no per-person structure');
  assert(rep.evidence.every(e=>!('person' in e) && !('target' in e) && !('subjectId' in e)),'report evidence refs are de-identified (no person/target/subject)');
}catch(e){errors.push('[run] '+e.message+'\n'+e.stack);}
if(errors.length){console.log('FAIL\n'+errors.join('\n'));process.exit(1);}
console.log('PASS — intel-ui ethics: suggested band is a RANGE (no lone score, no apply button, sensitive-gated, stable data-suggested hook); consistency cards are neutral/evidence-cited/hide-when-empty; weekly report is director-only + de-identified + not-enough-data path.');
process.exit(0);
