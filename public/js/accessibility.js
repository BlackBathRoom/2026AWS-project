export function initAccessibility(){
 const root=document.documentElement;let prefs={size:'standard',contrast:false};
 try{const p=JSON.parse(localStorage.getItem('learning-accessibility'));if(p&&['standard','large','largest'].includes(p.size))prefs={size:p.size,contrast:p.contrast===true};}catch{}
 const box=document.createElement('details');box.className='accessibility-settings';box.innerHTML='<summary>表示・アクセシビリティ設定</summary><div><label for="text-size">文字サイズ</label><select id="text-size"><option value="standard">標準</option><option value="large">大きい</option><option value="largest">最大</option></select><label class="option"><input id="high-contrast" type="checkbox">高コントラスト</label><p>Tabキーで移動、Enter・Spaceで操作できます。読み上げソフト用の見出し・項目名・状態通知に対応しています。</p><button id="reset-display">表示設定を初期化</button></div>';document.querySelector('#app').before(box);
 const size=box.querySelector('#text-size'),contrast=box.querySelector('#high-contrast');
 function apply(save=false){root.dataset.textSize=prefs.size;root.dataset.contrast=prefs.contrast?'high':'standard';size.value=prefs.size;contrast.checked=prefs.contrast;if(save)try{localStorage.setItem('learning-accessibility',JSON.stringify(prefs));}catch{document.querySelector('#notice').textContent='設定はこの画面に適用しました。ブラウザーへの保存はできません。';}}
 size.onchange=()=>{prefs.size=size.value;apply(true);};contrast.onchange=()=>{prefs.contrast=contrast.checked;apply(true);};box.querySelector('#reset-display').onclick=()=>{prefs={size:'standard',contrast:false};apply(true);};apply();
}
