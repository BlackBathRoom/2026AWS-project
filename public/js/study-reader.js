import {api} from './api.js';
import {auth} from './auth.js';
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const vendor='/vendor/pdfjs/';
let pdfLibrary;
async function library(){
 if(!pdfLibrary)pdfLibrary=import(vendor+'build/pdf.mjs').then(lib=>{lib.GlobalWorkerOptions.workerSrc=vendor+'build/pdf.worker.mjs';return lib;}).catch(e=>{pdfLibrary=null;throw e;});
 return pdfLibrary;
}
function pause(ms,signal){return new Promise((resolve,reject)=>{
 const abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};
 const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
 signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
});}
// The chapter/page are question context, never authorization or an approved citation.
export function contextualQuestion({title,filename,page,text,question}){
 const prefix=`閲覧中の教材：${title}\nファイル：${filename}\nPDFページ：${page}\n質問：${question.trim()}\n以下は表示ページから抽出した参考テキストです。承認済み教材の検索結果で確認してください。\n`;
 return prefix+text.slice(0,Math.max(0,2000-prefix.length));
}
export async function pollTutor(job,signal){
 if(!job?.jobId)throw new Error('AI受付番号を取得できませんでした。');
 const until=Date.now()+60000;
 while(Date.now()<until){
  await pause(1500,signal);
  const result=await api('/tutor/jobs/'+encodeURIComponent(job.jobId),{signal});
  if(result.status==='COMPLETED'){
   const r=result.result;
   if(!r||typeof r.message!=='string'||!['SUPPORTED','INSUFFICIENT','OUT_OF_SCOPE','ERROR','UNAVAILABLE'].includes(r.status))throw new Error('AI回答の形式を確認できませんでした。');
   if(r.status==='SUPPORTED'&&(!Array.isArray(r.citations)||!r.citations.length||r.citations.some(c=>typeof c!=='string'||!c.trim())))throw new Error('教材の出典がない回答のため表示できません。');
   return r;
  }
  if(['FAILED','UNAVAILABLE'].includes(result.status))throw new Error('AI回答を取得できませんでした。接続状態を確認してください。');
  if(!['QUEUED','RUNNING'].includes(result.status))throw new Error('未対応のAI処理状態です。');
 }
 throw new Error('回答の待機時間を超えました。処理が継続している場合があります。');
}
export function createStudyView({catalog,initialUnit,onUnitChange}){
 const chapters=[{unit_id:'ii-0',title:'表紙・目次'},...catalog.units.filter(u=>u.course_level==='II')];
 return {html:`<section class="reader" aria-labelledby="page-title">
 <div class="reader-heading"><div><p class="reader-eyebrow">LEARNING ROOM</p><h1 id="page-title" tabindex="-1">教材を学ぶ</h1></div><button id="reader-toggle" aria-expanded="true" aria-controls="reader-tutor">AI相談を閉じる</button></div>
 <nav class="reader-chapters" aria-label="教材の章">${chapters.map((u,i)=>`<button data-chapter="${escapeHTML(u.unit_id)}" aria-pressed="false" title="${escapeHTML(u.title)}">${i===0?'表紙・目次':'第'+i+'章'}</button>`).join('')}</nav>
 <div class="reader-grid"><article class="reader-book" aria-label="教科書">
 <div class="reader-book-header"><h2 id="reader-title"></h2><div class="reader-toolbar" role="group" aria-label="教材の表示操作"><div class="reader-pages"><button id="reader-prev" aria-label="前のページ" disabled>‹</button><label class="reader-sr" for="reader-page">ページ</label><input id="reader-page" type="number" min="1" value="1" disabled><span id="reader-total">/ —</span><button id="reader-next" aria-label="次のページ" disabled>›</button></div>
 <div class="reader-tools"><label class="reader-sr" for="reader-zoom">教材の拡大率</label><select id="reader-zoom"><option value="fit">幅に合わせる</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option></select><button id="reader-fullscreen"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg><span>全画面</span></button></div></div></div>
 <div id="reader-parts" class="reader-parts" aria-label="分冊の選択"></div>
 <p id="reader-status" class="reader-status" role="status" aria-live="polite">教材を読み込んでいます…</p>
 <div id="reader-canvas-area" tabindex="0" aria-label="教材表示。スペースで下にスクロール"><canvas id="reader-canvas" aria-label="教科書のページ"></canvas></div>
 <div class="reader-bottom"><button id="reader-reload">再読み込み</button><a id="reader-external" target="_blank" rel="noopener noreferrer" hidden>PDFを別タブで開く ↗</a></div>
 <details class="reader-transcript"><summary>このページのテキストを読む</summary><p id="reader-text">ページを読み込むと表示します。</p></details>
 </article><aside id="reader-tutor" aria-labelledby="reader-ai-title"><h2 id="reader-ai-title">このページについて質問</h2><p id="reader-context" class="reader-context">教材を選択してください</p>
 <p class="reader-help">教材を根拠に回答します。図の画像そのものは送信せず、章・ページ番号と抽出できた本文を質問に添えます。</p>
 <div id="reader-chat" role="log" aria-live="polite" aria-label="AIとの相談履歴"><div class="reader-welcome"><b>疑問を、その場で。</b><p>分からない言葉や、授業での説明の仕方を質問できます。</p></div></div>
 <p id="reader-ai-status" role="status" class="reader-help"></p><div class="reader-suggestions"><button data-prompt="このページの要点をまとめてください。">要点をまとめる</button><button data-prompt="このページの重要な用語を、身近な例で説明してください。">言葉を解説</button></div>
 <form id="reader-question-form"><label for="reader-question">このページの疑問</label><textarea id="reader-question" maxlength="800" placeholder="どの部分が気になりましたか？" required></textarea><div class="reader-send-row"><small>回答には教材の出典を表示</small><button id="reader-send" class="primary" disabled>質問を送る ↑</button></div></form>
 <button id="reader-stop" hidden>回答の待機をやめる</button>
 </aside></div></section>`,bind(){
 const root=document.querySelector('.reader'),$=s=>root.querySelector(s);
 const lifecycle=new AbortController();let loadController,aiController,pdfTask,pdf,renderTask;
 let selected=initialUnit,part=0,page=1,text='',filename='',title='',documents=[],generation=0,renderGeneration=0,busy=false,ready=false,disposed=false;
 const canvas=$('#reader-canvas'),area=$('#reader-canvas-area'),status=$('#reader-status');
 const enabled=window.RUNTIME_CONFIG.tutor_enabled===true;
 $('#reader-ai-status').textContent=enabled?'質問には、送信時に表示しているページが添付されます。':'AI回答は未接続です。教材の閲覧と質問の入力ができます。';
 function sync(){
  $('#reader-page').value=page;$('#reader-page').max=pdf?.numPages||1;$('#reader-page').disabled=!pdf;
  $('#reader-total').textContent='/ '+(pdf?.numPages||'—');
  $('#reader-prev').disabled=!pdf||page<=1;$('#reader-next').disabled=!pdf||page>=pdf.numPages;
  $('#reader-send').disabled=!enabled||!ready||busy;
  $('#reader-context').textContent=filename?`${title} · ${documents.length>1?'分冊'+(part+1)+' · ':''}PDF ${page}ページ`:'教材を読み込んでいます';
 }
 function message(kind,body,context,citations=[]){
  const item=document.createElement('div');item.className='reader-message '+kind;
  const label=document.createElement('small');label.textContent=context;const content=document.createElement('p');content.textContent=body;item.append(label,content);
  for(const citation of citations){const cite=document.createElement('small');cite.className='reader-citation';cite.textContent='出典：'+citation;item.append(cite);}
  $('#reader-chat').append(item);item.scrollIntoView({block:'nearest'});
 }
 async function draw(){
  if(!pdf||disposed)return;
  const version=++renderGeneration,currentPdf=pdf;ready=false;text='';sync();renderTask?.cancel();
  try{
   const sheet=await currentPdf.getPage(page);if(version!==renderGeneration||disposed)return;
   const base=sheet.getViewport({scale:1}),fit=Math.max(160,area.clientWidth-32)/base.width;
   const scale=$('#reader-zoom').value==='fit'?fit:Number($('#reader-zoom').value);
   const viewport=sheet.getViewport({scale}),ratio=Math.min(window.devicePixelRatio||1,2);
   // A fresh canvas avoids overlapping render operations during rapid navigation.
   const staging=document.createElement('canvas');staging.width=Math.ceil(viewport.width*ratio);staging.height=Math.ceil(viewport.height*ratio);
   renderTask=sheet.render({canvasContext:staging.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0]});await renderTask.promise;
   if(version!==renderGeneration||disposed)return;
   canvas.width=staging.width;canvas.height=staging.height;canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';canvas.getContext('2d').drawImage(staging,0,0);
   const content=await sheet.getTextContent();if(version!==renderGeneration||disposed)return;
   text=content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join('').trim();
   $('#reader-text').textContent=text||'このページには抽出可能な文字がありません。図や画像については質問に説明を添えてください。';
   canvas.setAttribute('aria-label',`${title} PDF ${page}ページ。本文は下の「このページのテキストを読む」から確認できます。`);
   ready=true;status.textContent=`${filename} · PDF ${page} / ${pdf.numPages}ページ`;sync();
  }catch(e){if(version!==renderGeneration||disposed||e.name==='RenderingCancelledException')return;status.textContent='ページを表示できません。再読み込み、または別タブ表示をお試しください。';}
 }
 async function openPart(index){
  const version=++generation;renderGeneration++;ready=false;loadController?.abort();loadController=new AbortController();renderTask?.cancel();
  const oldTask=pdfTask;pdfTask=null;pdf=null;void oldTask?.destroy();part=index;page=1;text='';filename=documents[index]?.filename||'';
  canvas.width=0;canvas.height=0;$('#reader-text').textContent='読み込み中…';sync();
  $('#reader-parts').querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===part)));
  const doc=documents[index];if(!doc)return;
  const link=$('#reader-external');link.hidden=false;link.href=doc.url;
  status.textContent='教科書を読み込んでいます…';
  try{
   const [lib,token]=await Promise.all([library(),auth.getAccessToken()]);if(version!==generation||disposed)return;
   const response=await fetch(window.RUNTIME_CONFIG.api_base+'/materials/'+encodeURIComponent(selected)+'/pdf?part='+index,{headers:{Authorization:'Bearer '+token},signal:loadController.signal,credentials:'omit'});
   if(!response.ok){let body;try{body=await response.json();}catch{}throw new Error(body?.message||'教材を取得できませんでした。');}
   const data=new Uint8Array(await response.arrayBuffer());if(version!==generation||disposed)return;
   const task=lib.getDocument({data,cMapUrl:vendor+'cmaps/',cMapPacked:true,standardFontDataUrl:vendor+'standard_fonts/',wasmUrl:vendor+'wasm/',isEvalSupported:false});pdfTask=task;
   const result=await task.promise;if(version!==generation||disposed){void task.destroy();return;}pdf=result;await draw();
  }catch(e){if(version===generation&&!disposed&&e.name!=='AbortError'){status.textContent=e.message+' 別タブ表示も利用できます。';sync();}}
 }
 async function load(id){
  selected=id;ready=false;filename='';documents=[];const version=++generation;renderGeneration++;loadController?.abort();renderTask?.cancel();void pdfTask?.destroy();pdfTask=null;pdf=null;
  canvas.width=0;canvas.height=0;$('#reader-external').hidden=true;$('#reader-parts').replaceChildren();$('#reader-text').textContent='読み込み中…';sync();
  title=chapters.find(u=>u.unit_id===id)?.title||'教材未登録';$('#reader-title').textContent=title;
  root.querySelectorAll('[data-chapter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.chapter===id)));
  onUnitChange(id);status.textContent='教材を取得しています…';
  try{
   const result=await api('/materials/'+encodeURIComponent(id)+'/view',{signal:lifecycle.signal});if(version!==generation||disposed)return;
   if(!Array.isArray(result.documents)||!result.documents.length)throw new Error('教材が登録されていません。');
   for(const doc of result.documents){if(new URL(doc.url).protocol!=='https:')throw new Error('閲覧URLが不正です。');}
   documents=result.documents;
   if(documents.length>1)documents.forEach((doc,i)=>{const b=document.createElement('button');b.textContent='分冊 '+(i+1);b.onclick=()=>openPart(i);$('#reader-parts').append(b);});
   await openPart(0);
  }catch(e){if(version===generation&&!disposed){status.textContent=e.message;$('#reader-context').textContent='教材を表示すると参照ページが分かります';}}
 }
 root.querySelectorAll('[data-chapter]').forEach(b=>b.onclick=()=>load(b.dataset.chapter));
 $('#reader-reload').onclick=()=>load(selected);
 $('#reader-prev').onclick=()=>{if(page>1){page--;area.scrollTop=0;draw();}};
 $('#reader-next').onclick=()=>{if(pdf&&page<pdf.numPages){page++;area.scrollTop=0;draw();}};
 $('#reader-page').onchange=e=>{if(pdf){page=Math.max(1,Math.min(pdf.numPages,Math.floor(Number(e.target.value)||1)));area.scrollTop=0;draw();}};
 $('#reader-zoom').onchange=draw;
 $('#reader-toggle').onclick=()=>{const hidden=!$('#reader-tutor').hidden;$('#reader-tutor').hidden=hidden;root.classList.toggle('reader-ai-hidden',hidden);$('#reader-toggle').setAttribute('aria-expanded',String(!hidden));$('#reader-toggle').textContent=hidden?'AI相談を開く':'AI相談を閉じる';};
 $('#reader-fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('.reader-book').requestFullscreen();}catch{status.textContent='全画面にできませんでした。AI相談を閉じると表示領域を広げられます。';}};
 area.onkeydown=e=>{if(e.target===area&&e.code==='Space'){e.preventDefault();area.scrollBy({top:area.clientHeight*.8*(e.shiftKey?-1:1),behavior:'auto'});}};
 root.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>{$('#reader-question').value=b.dataset.prompt;$('#reader-question').focus();});
 $('#reader-question-form').onsubmit=async event=>{
  event.preventDefault();const question=$('#reader-question').value.trim();if(!enabled||!ready||busy||!question)return;
  const context=$('#reader-context').textContent;
  const body={requestedAction:'explanation',question:contextualQuestion({title,filename,page,text,question})};
  busy=true;sync();aiController=new AbortController();$('#reader-stop').hidden=false;$('#reader-ai-status').textContent='回答を待っています…';
  message('user',question,context);$('#reader-question').value='';
  try{
   const job=await api('/tutor/jobs',{method:'POST',body,signal:aiController.signal});
   const result=await pollTutor(job,aiController.signal);if(disposed)return;
   message('assistant',result.message,context,result.citations||[]);$('#reader-ai-status').textContent='回答を受信しました。';
  }catch(e){if(!disposed)$('#reader-ai-status').textContent=e.name==='AbortError'?'待機を停止しました。サーバー側の処理は継続する場合があります。':e.message;}
  finally{busy=false;if(!disposed){$('#reader-stop').hidden=true;sync();}}
 };
 $('#reader-stop').onclick=()=>aiController?.abort();
 let resizeTimer,lastWidth=area.clientWidth;const observer=new ResizeObserver(()=>{if(area.clientWidth===lastWidth)return;lastWidth=area.clientWidth;clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if($('#reader-zoom').value==='fit')draw();},150);});observer.observe(area);
 load(selected);
 return ()=>{disposed=true;generation++;renderGeneration++;clearTimeout(resizeTimer);observer.disconnect();lifecycle.abort();loadController?.abort();aiController?.abort();renderTask?.cancel();void pdfTask?.destroy();};
 }};
}
