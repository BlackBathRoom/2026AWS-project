// Fullscreen and pane sizing are presentation state only. API/auth/job state
// remains owned by study-reader.js, and survives entering/exiting fullscreen.
const WIDTH_KEY='bittomo.reader.tutorWidth';
const MIN_TUTOR=280,MAX_TUTOR=720,MIN_BOOK=360,HANDLE=20,DEFAULT_TUTOR=340;

function installStyles(){
 if(document.getElementById('reader-layout-styles'))return;
 const link=document.createElement('link');link.id='reader-layout-styles';link.rel='stylesheet';link.href='/css/reader-layout.css';document.head.append(link);
}
function savedWidth(){
 try{const value=Number(localStorage.getItem(WIDTH_KEY));return Number.isFinite(value)&&value>=MIN_TUTOR&&value<=MAX_TUTOR?value:DEFAULT_TUTOR;}
 catch{return DEFAULT_TUTOR;}
}

export function bindReaderLayout(root,{onNotice=()=>{}}={}){
 installStyles();
 const $=selector=>root.querySelector(selector),grid=$('.reader-grid'),tutor=$('#reader-tutor'),splitter=$('#reader-splitter');
 const fullscreenButton=$('#reader-fullscreen'),toggle=$('#reader-toggle');
 const lifecycle=new AbortController(),options={signal:lifecycle.signal};
 let desiredWidth=savedWidth(),actualWidth=desiredWidth,drag=null,expanded=false,disposed=false;
 let previousOverflow='',savedScroll=null,restoreFocus=null;

 function limits(){
  const width=grid.clientWidth;
  return {width,max:Math.max(MIN_TUTOR,Math.min(MAX_TUTOR,width-HANDLE-MIN_BOOK))};
 }
 function persist(){try{localStorage.setItem(WIDTH_KEY,String(desiredWidth));}catch{}}
 function update(){
  if(disposed)return;
  const {width,max}=limits();
  const split=width>=MIN_BOOK+MIN_TUTOR+HANDLE+20&&!tutor.hidden;
  actualWidth=Math.round(Math.max(MIN_TUTOR,Math.min(max,desiredWidth)));
  root.style.setProperty('--reader-tutor-width',actualWidth+'px');
  root.dataset.readerSplit=String(split);
  splitter.hidden=!split;splitter.tabIndex=split?0:-1;
  // Values describe the position of the divider from the left, as do Arrow keys.
  const panes=Math.max(1,width-HANDLE),position=value=>Math.round((panes-value)/panes*100);
  splitter.setAttribute('aria-valuemin',String(position(max)));
  splitter.setAttribute('aria-valuemax',String(position(MIN_TUTOR)));
  splitter.setAttribute('aria-valuenow',String(position(actualWidth)));
  splitter.setAttribute('aria-valuetext',`教科書 ${position(actualWidth)}%、AI質問 ${100-position(actualWidth)}%`);
 }
 function resizeTo(value){
  desiredWidth=Math.round(Math.max(MIN_TUTOR,Math.min(limits().max,value)));update();
 }
 function finishDrag(){
  if(!drag)return;
  const id=drag.id;drag=null;root.classList.remove('reader-is-resizing');
  if(splitter.hasPointerCapture?.(id))splitter.releasePointerCapture(id);
  persist();
 }
 splitter.addEventListener('pointerdown',event=>{
  if(event.button!==0||event.isPrimary===false||splitter.hidden)return;
  event.preventDefault();finishDrag();
  drag={id:event.pointerId,x:event.clientX,width:actualWidth};
  splitter.focus({preventScroll:true});splitter.setPointerCapture(event.pointerId);root.classList.add('reader-is-resizing');
 },options);
 splitter.addEventListener('pointermove',event=>{
  if(drag&&event.pointerId===drag.id)resizeTo(drag.width-(event.clientX-drag.x));
 },options);
 splitter.addEventListener('pointerup',finishDrag,options);
 splitter.addEventListener('pointercancel',finishDrag,options);
 splitter.addEventListener('lostpointercapture',finishDrag,options);
 window.addEventListener('blur',finishDrag,options);
 splitter.addEventListener('dblclick',()=>{desiredWidth=DEFAULT_TUTOR;update();persist();},options);
 splitter.addEventListener('keydown',event=>{
  const step=event.shiftKey?50:20;
  if(event.key==='ArrowLeft')resizeTo(actualWidth+step);
  else if(event.key==='ArrowRight')resizeTo(actualWidth-step);
  else if(event.key==='Home')resizeTo(limits().max);
  else if(event.key==='End')resizeTo(MIN_TUTOR);
  else if(event.key==='Enter'){desiredWidth=DEFAULT_TUTOR;update();}
  else return;
  event.preventDefault();persist();
 },options);

 toggle.addEventListener('click',()=>{
  finishDrag();
  tutor.hidden=!tutor.hidden;root.classList.toggle('reader-ai-hidden',tutor.hidden);
  toggle.setAttribute('aria-expanded',String(!tutor.hidden));toggle.textContent=tutor.hidden?'AI相談を開く':'AI相談を閉じる';update();
 },options);

 function synchronizeFullscreen(){
  if(disposed)return;
  const next=document.fullscreenElement===root||root.classList.contains('reader-window-expanded');
  const exited=expanded&&!next;expanded=next;
  root.classList.toggle('reader-expanded',next);
  root.toggleAttribute('aria-modal',next);
  if(next){root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');}
  else{root.removeAttribute('role');root.removeAttribute('aria-modal');}
  fullscreenButton.setAttribute('aria-pressed',String(next));
  fullscreenButton.setAttribute('aria-label',next?'全画面を終了':'教科書とAI質問を全画面表示');
  fullscreenButton.title=next?'全画面を終了（Escでも戻れます）':'教科書とAI質問を全画面表示';
  fullscreenButton.querySelector('span').textContent=next?'全画面を終了':'全画面';
  update();
  if(exited){
   const scroll=savedScroll;const focus=restoreFocus;savedScroll=null;restoreFocus=null;
   requestAnimationFrame(()=>{if(disposed)return;if(focus?.isConnected)focus.focus({preventScroll:true});if(scroll)window.scrollTo(scroll.x,scroll.y);});
  }
 }
 function exitWindowFullscreen(){
  if(!root.classList.contains('reader-window-expanded'))return;
  root.classList.remove('reader-window-expanded');document.body.style.overflow=previousOverflow;synchronizeFullscreen();
 }
 fullscreenButton.addEventListener('click',async()=>{
  if(root.classList.contains('reader-window-expanded')){exitWindowFullscreen();return;}
  if(document.fullscreenElement===root){
   try{await document.exitFullscreen();}catch{onNotice('全画面を終了できませんでした。Escキーでも戻れます。');}return;
  }
  savedScroll={x:window.scrollX,y:window.scrollY};restoreFocus=document.activeElement;
  try{
   if(typeof root.requestFullscreen!=='function')throw new Error('Fullscreen unavailable');
   await root.requestFullscreen();synchronizeFullscreen();
  }catch{
   if(disposed)return;
   // iOS, embedded browsers, or denied native fullscreen: preserve all controls
   // in a viewport-filling workspace, with Escape and the same exit button.
   previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
   root.classList.add('reader-window-expanded');synchronizeFullscreen();
   onNotice('ブラウザー内で全画面表示しています。Escキーで戻れます。');
  }
 },options);
 document.addEventListener('fullscreenchange',synchronizeFullscreen,options);
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&root.classList.contains('reader-window-expanded')){event.preventDefault();exitWindowFullscreen();return;}
  if(!expanded||event.key!=='Tab')return;
  const focusable=[...root.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')]
   .filter(el=>!el.disabled&&el.tabIndex>=0&&el.getClientRects().length);
  if(!focusable.length)return;
  const first=focusable[0],last=focusable[focusable.length-1],active=document.activeElement;
  if(event.shiftKey&&(active===first||!root.contains(active))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(active===last||!root.contains(active))){event.preventDefault();first.focus();}
 },options);
 let observedWidth=grid.clientWidth;
 const observer=new ResizeObserver(()=>{const width=grid.clientWidth;if(drag&&Math.abs(width-observedWidth)>1)finishDrag();observedWidth=width;update();});observer.observe(grid);
 window.addEventListener('resize',update,options);
 update();
 return ()=>{
  finishDrag();disposed=true;observer.disconnect();lifecycle.abort();
  if(root.classList.contains('reader-window-expanded')){root.classList.remove('reader-window-expanded');document.body.style.overflow=previousOverflow;}
  root.classList.remove('reader-expanded','reader-is-resizing');
  if(document.fullscreenElement===root)void document.exitFullscreen().catch(()=>{});
 };
}
