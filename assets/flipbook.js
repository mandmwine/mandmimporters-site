(async function(){
const el=document.getElementById('book'); if(!el) return;
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const pdf=await pdfjsLib.getDocument(el.dataset.pdf).promise;
const first=await pdf.getPage(1); const vp1=first.getViewport({scale:1});
const W=Math.round(vp1.width), H=Math.round(vp1.height);
const pages=[];
for(let i=1;i<=pdf.numPages;i++){const d=document.createElement('div');d.className='fb-page';const c=document.createElement('canvas');d.appendChild(c);el.appendChild(d);pages.push(c);}
const dpr=Math.min(window.devicePixelRatio||1,2);
async function render(i){const c=pages[i-1]; if(c.dataset.done) return; c.dataset.done=1; const p=await pdf.getPage(i); const s=(900/W)*dpr; const v=p.getViewport({scale:s}); c.width=v.width;c.height=v.height; await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise;}
for(let i=1;i<=Math.min(4,pdf.numPages);i++) await render(i);
const flip=new St.PageFlip(el,{width:W,height:H,size:'stretch',minWidth:260,maxWidth:900,minHeight:300,maxHeight:1200,showCover:true,usePortrait:true,mobileScrollSupport:true,maxShadowOpacity:.4});
flip.loadFromHTML(document.querySelectorAll('.fb-page'));
document.querySelector('.fb-loading').remove();
const cnt=document.querySelector('.fb-count');
const upd=()=>{const i=flip.getCurrentPageIndex(); cnt.textContent=`Page ${i+1} of ${pdf.numPages}`; for(let k=i+1;k<=Math.min(i+6,pdf.numPages);k++) render(k);};
flip.on('flip',upd); upd();
document.querySelector('.fb-prev').onclick=()=>flip.flipPrev(); document.querySelector('.fb-next').onclick=()=>flip.flipNext();
document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')flip.flipNext(); if(e.key==='ArrowLeft')flip.flipPrev();});
(async()=>{for(let i=1;i<=pdf.numPages;i++){await render(i);}})();
})().catch(e=>{const l=document.querySelector('.fb-loading'); if(l) l.innerHTML='Could not load the viewer. <a href="'+document.getElementById('book').dataset.pdf+'">Open the PDF</a>.';});