(async function(){
const W=await (await fetch('/assets/wines.json')).json();const grid=document.getElementById('wgrid'),cnt=document.getElementById('count'),q=document.getElementById('q');
const st={country:'',color:'',mev:false,text:''};const P=new URLSearchParams(location.search);['country','color'].forEach(k=>{if(P.get(k))st[k]=P.get(k)});if(P.get('mevushal'))st.mev=true;if(P.get('q'))st.text=P.get('q');q.value=st.text;
const norm=s=>(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function sync(){document.querySelectorAll('[data-k]').forEach(b=>{const k=b.dataset.k,v=b.dataset.v;b.setAttribute('aria-pressed',k==='mev'?String(st.mev):String(st[k]===v))})}
function card(w){const b=[];if(w.new)b.push('<span class="badge new">New</span>');if(w.mevushal==='Yes')b.push('<span class="badge">Mevushal</span>');if(w.score)b.push(`<span class="badge score">${w.score}</span>`);
return `<a class="wcard" href="/wines/p/${w.slug}"><div class="badges">${b.join('')}</div><div class="bottle"><img src="${w.img||'/assets/logo-emblem.png'}" alt="${w.name.replace(/"/g,'')}" loading="lazy" onerror="this.src='/assets/logo-emblem.png';this.style.maxHeight='120px'"></div><h3>${w.name}</h3><div class="meta">${[w.region||w.country,w.color].filter(Boolean).join(' · ')}</div></a>`}
function render(){const t=norm(st.text);const r=W.filter(w=>(!st.country||w.country===st.country)&&(!st.color||w.color===st.color)&&(!st.mev||w.mevushal==='Yes')&&(!t||norm([w.name,w.producer,w.region,w.country,w.grapes,w.appellation].join(' ')).includes(t)));
grid.innerHTML=r.map(card).join('')||'<div class="empty">No wines match. Try clearing a filter.</div>';cnt.textContent=`${r.length} wine${r.length===1?'':'s'}`;
const u=new URLSearchParams();if(st.country)u.set('country',st.country);if(st.color)u.set('color',st.color);if(st.mev)u.set('mevushal','1');if(st.text)u.set('q',st.text);history.replaceState(null,'',location.pathname+(u.toString()?'?'+u:''));sync()}
document.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{const k=b.dataset.k,v=b.dataset.v;if(k==='mev')st.mev=!st.mev;else st[k]=st[k]===v?'':v;render()});
q.oninput=()=>{st.text=q.value;render()};render()})();