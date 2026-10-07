(async function(){
const W=await (await fetch('/assets/wines.json')).json();const grid=document.getElementById('wgrid'),cnt=document.getElementById('count'),q=document.getElementById('q'),sortSel=document.getElementById('sort');
W.forEach((w,i)=>w._i=i);
const st={country:'',color:'',mev:false,text:'',sort:''};const P=new URLSearchParams(location.search);['country','color','sort'].forEach(k=>{if(P.get(k))st[k]=P.get(k)});if(P.get('mevushal'))st.mev=true;if(P.get('q'))st.text=P.get('q');q.value=st.text;
const norm=s=>(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const coll=new Intl.Collator('en',{sensitivity:'base',numeric:true});
const nameKey=w=>norm(w.name);
const scoreNum=w=>{const m=String(w.score||'').match(/\d+/);return m?+m[0]:0};
const COLORS=['Red','White','Rosé','Sparkling'];const colorRank=w=>{const i=COLORS.indexOf(w.color);return i<0?COLORS.length:i};
const by=(...fs)=>(a,b)=>{for(const f of fs){const r=f(a,b);if(r)return r}return a._i-b._i};
const byName=(a,b)=>coll.compare(nameKey(a),nameKey(b));
const SORTS={
  name:byName,
  'name-desc':(a,b)=>byName(b,a),
  producer:by((a,b)=>coll.compare(a.producer||a.name,b.producer||b.name),byName),
  region:by((a,b)=>coll.compare(a.country||'',b.country||''),(a,b)=>coll.compare(a.region||'',b.region||''),byName),
  color:by((a,b)=>colorRank(a)-colorRank(b),byName),
  score:by((a,b)=>scoreNum(b)-scoreNum(a),byName),
  new:by((a,b)=>(b.new?1:0)-(a.new?1:0),byName),
  mev:by((a,b)=>(b.mevushal==='Yes'?1:0)-(a.mevushal==='Yes'?1:0),byName)
};
if(!SORTS[st.sort])st.sort='';sortSel.value=st.sort;
function sync(){document.querySelectorAll('[data-k]').forEach(b=>{const k=b.dataset.k,v=b.dataset.v;b.setAttribute('aria-pressed',k==='mev'?String(st.mev):String(st[k]===v))})}
function card(w){const b=[];if(w.new)b.push('<span class="badge new">New</span>');if(w.mevushal==='Yes')b.push('<span class="badge">Mevushal</span>');if(w.score)b.push(`<span class="badge score">${w.score}</span>`);
return `<a class="wcard" href="/wines/p/${w.slug}"><div class="badges">${b.join('')}</div><div class="bottle"><img src="${w.img||'/assets/logo-emblem.png'}" alt="${w.name.replace(/"/g,'')}" loading="lazy" onerror="this.src='/assets/logo-emblem.png';this.style.maxHeight='120px'"></div><h3>${w.name}</h3><div class="meta">${[w.region||w.country,w.color].filter(Boolean).join(' · ')}</div></a>`}
function render(){const t=norm(st.text);let r=W.filter(w=>(!st.country||w.country===st.country)&&(!st.color||w.color===st.color)&&(!st.mev||w.mevushal==='Yes')&&(!t||norm([w.name,w.producer,w.region,w.country,w.grapes,w.appellation].join(' ')).includes(t)));
if(st.sort)r=r.slice().sort(SORTS[st.sort]);
grid.innerHTML=r.map(card).join('')||'<div class="empty">No wines match. Try clearing a filter.</div>';cnt.textContent=`${r.length} wine${r.length===1?'':'s'}`;
const u=new URLSearchParams();if(st.country)u.set('country',st.country);if(st.color)u.set('color',st.color);if(st.mev)u.set('mevushal','1');if(st.text)u.set('q',st.text);if(st.sort)u.set('sort',st.sort);history.replaceState(null,'',location.pathname+(u.toString()?'?'+u:''));sync()}
document.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{const k=b.dataset.k,v=b.dataset.v;if(k==='mev')st.mev=!st.mev;else st[k]=st[k]===v?'':v;render()});
sortSel.onchange=()=>{st.sort=sortSel.value;render()};
q.oninput=()=>{st.text=q.value;render()};render()})();
