(function(){
const modal=document.querySelector('.fb-modal');if(!modal)return;const title=modal.querySelector('.fb-top h3'),dl=modal.querySelector('.fb-dl'),count=modal.querySelector('.fb-count');let book=null,flip=null,lib=null;
function loadScript(src){return new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=no;document.head.appendChild(s)})}
async function libs(){if(lib)return lib;await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');await loadScript('https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.browser.js');pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';return lib=true}
async function open(slug,t,pdfUrl,push){modal.classList.add('open');document.documentElement.style.overflow='hidden';title.textContent=t;dl.href=pdfUrl;count.textContent='Loading…';
const body=modal.querySelector('.fb-body');const old=body.querySelector('.fb-book');if(old)old.remove();if(flip){try{flip.destroy()}catch(_){}flip=null}
const el=document.createElement('div');el.className='fb-book';body.appendChild(el);const load=document.createElement('div');load.className='fb-loading';load.textContent='Opening the magazine…';body.appendChild(load);
if(push)history.pushState({a:slug},'','#'+slug);
try{await libs();const pdf=await pdfjsLib.getDocument(pdfUrl).promise;const p1=await pdf.getPage(1);const v1=p1.getViewport({scale:1});const pages=[];
for(let i=1;i<=pdf.numPages;i++){const d=document.createElement('div');d.className='fb-page';const c=document.createElement('canvas');d.appendChild(c);el.appendChild(d);pages.push(c)}
const dpr=Math.min(devicePixelRatio||1,2);const render=async i=>{const c=pages[i-1];if(!c||c.dataset.done)return;c.dataset.done=1;const p=await pdf.getPage(i);const v=p.getViewport({scale:(900/v1.width)*dpr});c.width=v.width;c.height=v.height;await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise};
for(let i=1;i<=Math.min(4,pdf.numPages);i++)await render(i);
flip=new St.PageFlip(el,{width:Math.round(v1.width),height:Math.round(v1.height),size:'stretch',minWidth:250,maxWidth:900,minHeight:300,maxHeight:1300,showCover:true,usePortrait:true,mobileScrollSupport:false,maxShadowOpacity:.45});
flip.loadFromHTML(el.querySelectorAll('.fb-page'));load.remove();const upd=()=>{const i=flip.getCurrentPageIndex();count.textContent=`Page ${i+1} of ${pdf.numPages}`;for(let k=i+1;k<=Math.min(i+6,pdf.numPages);k++)render(k)};flip.on('flip',upd);upd();
(async()=>{for(let i=1;i<=pdf.numPages;i++){if(!modal.classList.contains('open'))break;await render(i)}})()}catch(e){load.innerHTML='Could not open the viewer. <a href="'+pdfUrl+'" style="color:#d8bd87">Open the PDF</a>.'}}
function close(pop){modal.classList.remove('open');document.documentElement.style.overflow='';if(flip){try{flip.destroy()}catch(_){}flip=null}const b=modal.querySelector('.fb-book');if(b)b.remove();if(!pop&&location.hash)history.pushState(null,'',location.pathname)}
modal.querySelector('.fb-close').onclick=()=>close();modal.querySelector('.fb-prev').onclick=()=>flip&&flip.flipPrev();modal.querySelector('.fb-next').onclick=()=>flip&&flip.flipNext();
document.addEventListener('keydown',e=>{if(!modal.classList.contains('open'))return;if(e.key==='Escape')close();if(e.key==='ArrowRight')flip&&flip.flipNext();if(e.key==='ArrowLeft')flip&&flip.flipPrev()});
document.querySelectorAll('[data-article]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();open(a.dataset.article,a.dataset.title,a.dataset.pdf,true)}));
addEventListener('popstate',()=>{const s=location.hash.slice(1);const a=s&&document.querySelector(`[data-article="${s}"]`);if(a)open(s,a.dataset.title,a.dataset.pdf,false);else if(modal.classList.contains('open'))close(true)});
const s=location.hash.slice(1);const a=s&&document.querySelector(`[data-article="${s}"]`);if(a)open(s,a.dataset.title,a.dataset.pdf,false)})();