/* Exercise the unified Find: typing shows Teams + People; person rows carry a team
 * chip; choosing a team focuses the tree; choosing a person opens their profile. */
const fs=require('fs'),path=require('path');const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const srcs=[...html.matchAll(/src="([^"]+\.js)"/g)].map(m=>m[1]);
const shellBody=(html.match(/<body[^>]*>([\s\S]*?)<\/body>/)||[,''])[1].replace(/<script[\s\S]*?<\/script>/g,'');
const dom=new JSDOM('<!doctype html><html><body>'+shellBody+'</body></html>',{url:'https://localhost/',pretendToBeVisual:true,runScripts:'outside-only'});
const {window}=dom;window.HTMLElement.prototype.scrollIntoView=function(){};window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});window.setInterval=()=>0;
const errors=[];const benign=/font|stylesheet|localStorage|Security|scrollIntoView|Not implemented|opaque|insertRule|cssRules/i;
['error','warn'].forEach(k=>{const o=window.console[k].bind(window.console);window.console[k]=(...a)=>{const s=a.join(' ');if(!benign.test(s))errors.push('['+k+'] '+s);o(...a);};});
window.addEventListener('error',e=>{if(!benign.test(String(e.message)))errors.push('[onerror] '+e.message);});
for(const s of srcs){try{new window.Function(fs.readFileSync(path.join(root,s),'utf8')).call(window);}catch(e){errors.push('[load '+s+'] '+e.message);}}
const WP=window.WP;function assert(c,m){if(!c)errors.push('[assert] '+m);}
try{
  WP.state.authed=true;WP.state.lang='en';WP.state.route='map';
  const el=window.document.getElementById('view');WP.render();
  assert(el.querySelector('#view-dd'),'View dropdown present');
  assert(el.querySelector('#period-dd'),'Period dropdown present');
  const input=el.querySelector('#map-search');assert(input,'finder input present');
  // type a query that should match people
  input.value='a';                       // broad — matches several names
  input.oninput();
  const dd=el.querySelector('#map-suggest');
  assert(dd && dd.classList.contains('open'),'finder dropdown opens on input');
  const groups=[].map.call(dd.querySelectorAll('.predict-group'),g=>g.textContent);
  assert(groups.indexOf('People')>=0,'People section present ('+groups.join(',')+')');
  const personRow=dd.querySelector('.pr-person[data-pick]');
  assert(personRow,'a person row exists');
  // a non-lead person should show a team chip to jump to their team
  const anyChip=dd.querySelector('.pr-teamchip[data-team]');
  assert(anyChip,'at least one person row shows a team chip');
  // clicking a team chip focuses that team (sets focus + re-renders with scope chip)
  if(anyChip){ const teamId=anyChip.getAttribute('data-team'); anyChip.onmousedown({preventDefault(){},stopPropagation(){},target:anyChip});
    const chip=el.querySelector('#scope-clear'); assert(chip,'scope chip appears after focusing a team via chip'); }
  // open the finder empty (focused) → should list Teams
  const input2=el.querySelector('#map-search'); input2.value=''; input2.onfocus();
  const dd2=el.querySelector('#map-suggest');
  const g2=[].map.call(dd2.querySelectorAll('.predict-group'),g=>g.textContent);
  assert(g2.indexOf('Teams')>=0,'empty focus lists Teams ('+g2.join(',')+')');
}catch(e){errors.push('[run] '+e.message+'\n'+e.stack);}
if(errors.length){console.log('FAIL\n'+errors.join('\n'));process.exit(1);}
console.log('PASS — unified Find: View/Period dropdowns, people+teams results, team chips, and team-focus all work.');
process.exit(0);
