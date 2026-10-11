import { api, waitForAI } from './api.js';

const app = document.querySelector('#app');
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const time = value => value ? new Date(value).toLocaleString('ja-JP') : '未保存';
const labels = { teacher: '受講教員', reviewer: '評価者', manager: '教材管理者', admin: '運用管理者' };
const stateLabels = { DRAFT: '下書き', REVIEW: 'レビュー中', APPROVED: '承認済み', INDEXING: '取込中', PUBLISHED: '公開中', WITHDRAWN: '取り下げ' };
const axisNames = [['K', '知識理解'], ['P', '実践'], ['E', '説明'], ['D', 'つまずき診断'], ['L', '授業設計']];
const taskFields = [['goal', '研修目標', 'この単元で身につけたいことを書きます。'], ['practice', '実践課題', '散布図を使って関係を調べる手順を説明します。'], ['explanation', '生徒への説明', '相関と因果の違いを、生徒に伝わる言葉で説明します。'], ['diagnosis', '架空の誤答とつまずき診断', '「相関があれば必ず因果関係がある」という誤答にどう対応しますか。'], ['lesson', '授業案', '目標、導入、活動、理解確認の流れを書きます。'], ['assistance', 'AI・他者の援助申告', '利用した援助と範囲を書きます。利用なしの場合は「なし」。']];
let me, settings, generation = 0, dirty = false, pendingAI;
let toastTimer;
function toast(text) { $('#notice').textContent = text; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#notice').textContent = '', 7000); }
function inlineError(error, target = '#page-error') {
  const el = $(target);
  if (!el) return toast(error.message);
  el.hidden = false;
  el.textContent = `${error.code ? `${error.code}：` : ''}${error.message || '通信できませんでした。接続を確認してください。'}`;
  if (error.status === 401) {
    const button = document.createElement('button'); button.textContent = 'デモ入場に戻る';
    button.addEventListener('click', () => { if (leaveOK()) { dirty = false; me = null; pendingAI?.abort(); login(); } }); el.append(' ', button);
  }
  el.setAttribute('tabindex', '-1'); el.focus();
}
function leaveOK() { return !dirty || window.confirm('未保存の入力があります。内容を破棄して移動しますか？'); }
function badge(text, tone = '') { return `<span class="badge ${tone}">${esc(text)}</span>`; }
function title(kicker, heading, description) { return `<div class="page-heading"><p class="eyebrow">${esc(kicker)}</p><h1 id="page-title" tabindex="-1">${esc(heading)}</h1><p class="muted">${esc(description)}</p></div>`; }
function empty(heading, text) { return `<div class="empty"><span class="empty-mark" aria-hidden="true">○</span><h2>${esc(heading)}</h2><p>${esc(text)}</p></div>`; }
function errorBox() { return '<div id="page-error" class="alert error" role="alert" hidden></div>'; }
function formValues(form) { return Object.fromEntries(new FormData(form)); }
function bindForm(selector, callback) {
  $(selector)?.addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget;
    if ($('#page-error')) $('#page-error').hidden = true;
    const buttons = [...form.querySelectorAll('button')]; const disabledBefore = buttons.map(b => b.disabled); buttons.forEach(b => b.disabled = true);
    try { await callback(formValues(form), form, event.submitter); }
    catch (error) { inlineError(error); }
    finally { buttons.forEach((b, i) => b.disabled = disabledBefore[i]); }
  });
}
const links = {
  teacher: [['home', 'ホーム', '⌂'], ['materials', '教材を学ぶ', '▤'], ['quiz', '小テスト', '✓'], ['ai', 'AIに相談', '✦'], ['task', '指導課題・提出', '▱'], ['progress', '学習・到達状況', '◴']],
  reviewer: [['home', 'ホーム', '⌂'], ['training', '研修の状況', '◴'], ['review', '提出物レビュー', '✓'], ['materials', '教材を確認', '▤'], ['ai', 'AIに相談', '✦']],
  manager: [['home', 'ホーム', '⌂'], ['manage', '教材の公開管理', '▤'], ['materials', '公開教材を確認', '✓']],
  admin: [['home', 'ホーム', '⌂'], ['settings', '運用設定・削除', '⚙']],
};
function shell(route) {
  app.innerHTML = `<div class="layout"><aside class="sidebar"><a class="brand" href="#home"><span class="brand-icon">Ⅱ</span><span>情報Ⅱ<span class="brand-sub">教員ラーニング</span></span></a><p class="nav-caption">ワークスペース</p><nav aria-label="メインメニュー">${links[me.role].map(([id, text, icon]) => `<a href="#${id}" ${route === id ? 'aria-current="page"' : ''}><span aria-hidden="true">${icon}</span>${text}</a>`).join('')}</nav><div class="sidebar-note"><b>学びを、教える力へ。</b><p>知識を確かめ、実践し、<br>振り返るための場所。</p></div><div class="user"><span class="avatar">${esc(me.name[0])}</span><div><b>${esc(labels[me.role])}</b><small>${esc(me.school)}</small></div></div><button id="logout" class="secondary small">役割を切り替える / 退出</button></aside><div class="workspace"><header class="topbar"><span>${esc(me.training)}</span><div>${badge(settings.studyMode === 'assessment' ? '自力評価モード' : '学習モード', settings.studyMode === 'assessment' ? 'amber' : 'green')}${badge('DEMO')}</div></header><main id="main" tabindex="-1"><div class="loading" role="status">画面を読み込んでいます…</div></main><footer>情報Ⅱ 教員ラーニング · 担当Aの画面実装デモ</footer></div></div>`;
  $('#logout').onclick = async () => {
    if (!leaveOK()) return;
    try { await api('/logout', { method: 'POST', body: {} }); dirty = false; pendingAI?.abort(); me = null; login(); }
    catch (e) { toast(e.message); }
  };
}
async function login() {
  app.innerHTML = `<main class="login" id="main"><div class="login-intro"><div class="brand-icon large">Ⅱ</div><p class="eyebrow">INFORMATION II · TEACHER LEARNING</p><h1>学ぶ、その先の<br><em>教える力</em>へ。</h1><p>教材で理解を深め、授業づくりに取り組む。<br>先生の学びを支えるワークスペース。</p><div class="login-steps"><span>01 理解する</span><span>02 実践する</span><span>03 振り返る</span></div></div><section class="card login-card"><p class="eyebrow">UI DEVELOPMENT PREVIEW</p><h2>デモをはじめる</h2><p class="muted">パスワードを使わない画面確認用の入口です。実際の認証は担当BのCognito接続後に利用できます。</p>${errorBox()}<form id="login-form"><label for="user">確認する役割</label><select id="user" name="userId">${Object.entries(labels).map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select><button class="primary wide">デモに入る <span aria-hidden="true">→</span></button></form><div class="note">まず「受講教員」で課題を提出し、次に「評価者」へ切り替えると、一連の操作を確認できます。</div></section></main>`;
  bindForm('#login-form', async data => {
    const result = await api('/demo/login', { method: 'POST', body: data }); me = result.user;
    dirty = false;
    if (location.hash !== '#home') location.hash = 'home'; else render();
  });
  try { const config = await api('/config'); if (!config.demo) { $('#login-form').hidden = true; inlineError({ message: 'デモは無効です。本番の認証・APIは未接続です。' }); } }
  catch (e) { inlineError(e); }
}
async function render() {
  if (!me) return login();
  const g = ++generation; pendingAI?.abort(); dirty = false;
  const route = location.hash.slice(1).split('/')[0] || 'home';
  try { const data = await api('/me'); if (g !== generation) return; me = data.user; settings = data.settings; }
  catch (e) { if (e.status === 401) { me = null; return login(); } toast(e.message); return; }
  shell(route);
  if (!links[me.role].some(([key]) => key === route)) { $('#main').innerHTML = title('ACCESS', 'この画面は利用できません', '現在の役割に対応するメニューを選んでください。'); return; }
  try {
    const view = await views[route]();
    if (g !== generation) return;
    $('#main').innerHTML = view.html;
    view.bind?.(); $('#page-title')?.focus();
  } catch (e) {
    if (g !== generation) return;
    $('#main').innerHTML = title('CONNECTION', '画面を取得できませんでした', '接続を確認して、再読み込みしてください。') + errorBox() + '<button id="retry">再読み込み</button>';
    inlineError(e); $('#retry').onclick = render;
  }
}
const views = {};
views.home = async () => {
  if (me.role !== 'teacher') return { html: title('WORKSPACE', `${labels[me.role]}のワークスペース`, '担当する範囲の情報を確認し、次の操作に進みましょう。') + `<div class="grid two">${links[me.role].filter(([id]) => id !== 'home').map(([id, name, icon]) => `<a class="card action-card" href="#${id}"><span class="card-icon">${icon}</span><h2>${name}</h2><p>画面を開く →</p></a>`).join('')}</div>` };
  const p = await api('/progress');
  return { html: title('MY LEARNING', '今日の学びを、はじめよう。', 'まずはひとつの単元から。自分のペースで理解と指導力を育てていきましょう。') + `<section class="hero"><div><span class="pill">学習中の単元 · 情報Ⅱ</span><h2>データの関係を読み解き、<br>生徒に伝える。</h2><p>データサイエンス / 相関と因果</p><a class="button light" href="#materials">教材を開く <span aria-hidden="true">→</span></a></div><div class="hero-art" aria-hidden="true"><div class="orbit"></div><span class="art-num">Ⅱ</span><span class="art-label">LEARN & TEACH</span></div></section><div class="grid three stats"><section class="card"><p class="muted">知識の確認</p><strong class="metric">${p.answered}<small> / ${p.total} 問</small></strong><p>小テストの初回回答</p></section><section class="card"><p class="muted">課題の提出</p><strong class="metric">${p.submissionCount}<small> 版</small></strong><p>${p.pending ? '専門家のレビュー待ち' : p.review ? '評価結果を確認できます' : 'これから取り組みましょう'}</p></section><section class="card"><p class="muted">単元の到達状況</p><strong class="metric text-metric">${p.reached ? '到達（デモ）' : '未到達・未判定'}</strong><p>専門家の5軸評価で確認</p></section></div><div class="section-head"><h2>次の一歩</h2><a href="#progress">学習状況を見る →</a></div><div class="grid three">${[['quiz', '01', '知識を確かめる', '小テストで、理解できたことを確認。'], ['task', '02', '授業をつくる', '学んだ知識を、生徒への説明に。'], ['ai', '03', 'つまずきを相談する', '教材の出典を見ながら理解を深める。']].map(([id, n, t, d]) => `<a class="card action-card" href="#${id}"><span class="step">${n}</span><h3>${t}</h3><p>${d}</p></a>`).join('')}</div><p class="note">このデモの教材・課題・評価基準は未監修です。小テストの正答率と指導力の到達は分けて扱います。</p>` };
};
views.materials = async () => {
  const list = await api('/materials'); const selected = location.hash.split('/')[1];
  const m = list.find(x => x.id === selected) || list[0];
  return { html: title('MATERIALS', '教材を学ぶ', '教材の出典を確認しながら、情報Ⅱと前提知識を学びます。') + (m ? `<div class="material-layout"><section class="card material-list"><h2>公開教材</h2>${list.map(x => `<a href="#materials/${encodeURIComponent(x.id)}" class="material-link ${x.id === m.id ? 'selected' : ''}">${badge(x.subject)}<b>${esc(x.title)}</b><small>${esc(x.unit)}</small></a>`).join('')}</section><article class="card reading">${badge(m.subject, 'green')}<h2>${esc(m.title)}</h2><p class="muted">${esc(m.unit)}</p><div class="prose">${esc(m.text)}</div><div class="source"><strong>出典</strong><p>${esc(m.source)}</p><small>${esc(m.chapter)} / p.${esc(m.page)} / 版 ${m.version}</small></div><div class="note"><strong>前提知識・関連資料</strong><p>${esc(m.related)}</p></div>${me.role === 'teacher' ? '<div class="actions"><a class="button primary" href="#quiz">小テストへ</a><a class="button secondary" href="#ai">AIに相談する</a></div>' : ''}</article></div>` : empty('公開教材がありません', '教材管理者が公開するまでお待ちください。')) };
};
views.quiz = async () => {
  const [questions, p] = await Promise.all([api('/questions'), api('/progress')]);
  return { html: title('KNOWLEDGE CHECK', '理解を確かめる小テスト', '初回の回答を知識スコアに記録します。同じ問題を再送しても加算されません。') + errorBox() + `<div class="note">回答済み ${p.answered} / ${p.total} 問。問題・採点は画面確認用です。自力評価の設定はサーバー側で管理します。</div><div class="stack">${questions.map((q, i) => `<section class="card"><form class="quiz-form" data-question="${q.id}" data-version="${q.version}"><fieldset><legend><span class="eyebrow">QUESTION ${String(i + 1).padStart(2, '0')} · ${esc(q.tag)}</span><span class="question">${esc(q.prompt)}</span></legend>${q.options.map((v, n) => `<label class="option"><input type="radio" name="choice" value="${n}" required><span>${esc(v)}</span></label>`).join('')}</fieldset><button class="primary">回答を送信</button><div class="answer-result" role="status" hidden></div></form></section>`).join('')}</div><a class="button secondary" href="#progress">結果・復習を見る →</a>`, bind() {
    document.querySelectorAll('.quiz-form').forEach(form => form.addEventListener('submit', async event => {
      event.preventDefault(); const button = form.querySelector('button'); button.disabled = true; button.textContent = '保存中…';
      try {
        const result = await api('/answers', { method: 'POST', body: { questionId: form.dataset.question, version: Number(form.dataset.version), choice: Number(new FormData(form).get('choice')) } });
        const box = form.querySelector('.answer-result'); box.hidden = false; box.className = `answer-result alert ${result.correct ? 'success' : 'warning'}`;
        box.textContent = `${result.correct ? '✓ 正解' : '△ 要復習'}：${result.explanation}${result.repeated ? '（初回に保存した回答の結果です）' : ''}`;
        form.querySelectorAll('input').forEach(input => { input.disabled = true; input.checked = Number(input.value) === result.choice; }); button.textContent = '保存済み';
      } catch (e) { button.disabled = false; button.textContent = '再試行'; inlineError(e); }
    }));
  } };
};
views.ai = async () => ({ html: title('AI LEARNING SUPPORT', 'AIに相談する', '教材を根拠にした解説や授業相談の画面です。この版では固定のデモ回答を返します。') + errorBox() + `<div class="grid ai-grid"><section class="card"><h2>一緒に考えてみましょう</h2><p class="muted">例：相関と因果の違いを、生徒向けに説明したい。</p><form id="ai-form"><label for="question">質問・相談内容</label><textarea id="question" name="question" rows="6" maxlength="2000" placeholder="教材や授業について質問してください" required></textarea><details class="dev-controls"><summary>開発用：エラー表示を確認</summary><label for="scenario">デモ応答</label><select id="scenario" name="scenario"><option value="normal">通常</option><option value="insufficient">根拠不足</option><option value="outside">範囲外</option><option value="limit">利用上限</option><option value="failure">処理失敗</option><option value="timeout">30秒の時間切れ</option></select></details><button class="primary" ${settings.studyMode === 'assessment' || !settings.aiEnabled ? 'disabled' : ''}>質問を送る</button></form><div id="ai-status" role="status" aria-live="polite"></div>${settings.studyMode === 'assessment' ? '<p class="alert warning">自力評価中のためAI援助は利用できません。</p>' : ''}${!settings.aiEnabled ? '<p class="alert warning">AIは停止中です。教材や小テストを利用してください。</p>' : ''}</section><section class="card answer-card"><h2>回答と出典</h2><div id="ai-result">${empty('質問を入力してください', '回答の根拠となる教材とページもここに表示します。')}</div></section></div><div class="note">AIは学習の参考です。最終的な到達判定は人間の評価者が行います。<a href="#materials">教材を確認する →</a></div>`, bind() {
  const form = $('#ai-form');
  $('#question').addEventListener('input', () => dirty = true);
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button = form.querySelector('button'); button.disabled = true;
    $('#page-error').hidden = true; $('#ai-result').textContent = ''; $('#ai-status').textContent = '依頼を受け付けています…';
    const control = new AbortController(); pendingAI = control;
    try {
      const job = await api('/ai/jobs', { method: 'POST', body: formValues(form), signal: control.signal });
      $('#ai-status').textContent = '回答を準備中です。2秒ごとに状態を確認しています…';
      const result = await waitForAI(job.jobId, control.signal, () => {});
      if (!result || control.signal.aborted) return;
      $('#ai-status').textContent = '処理が完了しました。'; dirty = false;
      const box = $('#ai-result');
      box.innerHTML = `${badge({ SUPPORTED: '根拠あり（デモ）', INSUFFICIENT: '根拠不足', OUT_OF_SCOPE: '教材の範囲外' }[result.verdict], result.verdict === 'SUPPORTED' ? 'green' : 'amber')}<div class="prose">${esc(result.text)}</div>${result.citations.map(c => `<a class="source source-link" href="#materials/${encodeURIComponent(c.materialId)}"><strong>${esc(c.title)}</strong><p>${esc(c.source)}</p><small>${esc(c.chapter)} / p.${esc(c.page)} / 版 ${c.version} →</small></a>`).join('')}${result.verdict === 'SUPPORTED' ? '<form id="feedback-form"><label for="feedback">回答について報告する</label><input id="feedback" name="reason" maxlength="2000" placeholder="気になった点を入力" required><button class="secondary small">報告を送信</button></form>' : ''}`;
      bindForm('#feedback-form', async data => { await api('/ai/feedback', { method: 'POST', body: { jobId: job.jobId, ...data } }); toast('デモ報告を保存しました。'); $('#feedback-form').reset(); });
    } catch (e) { if (!control.signal.aborted) { $('#ai-status').textContent = '回答を取得できませんでした。'; inlineError(e); } }
    finally { if (!control.signal.aborted) button.disabled = false; }
  });
} });
function historyHTML(task) {
  if (!task.submissions.length) return empty('提出履歴はまだありません', '下書きを保存し、内容を確認してから提出してください。');
  return [...task.submissions].reverse().map(s => {
    const review = task.reviews.find(r => r.submissionId === s.id);
    return `<details class="history"><summary>提出 v${s.version} · ${time(s.at)} · ${review ? review.decision === 'revise' ? '改善・再提出' : '評価確定' : 'レビュー待ち'}</summary><div class="history-body">${taskFields.map(([key, text]) => `<h3>${text}</h3><p class="pre">${esc(s.body[key])}</p>`).join('')}${s.body.attachment ? `<h3>添付：${esc(s.body.attachment.name)}</h3><pre>${esc(s.body.attachment.content)}</pre>` : ''}${review ? `<div class="note"><b>評価者：${esc(review.reviewer)}</b><p class="pre">${esc(review.comment)}</p><p>${axisNames.map(([key, name]) => `${name} ${review.scores[key]}/3`).join(' · ')}</p><small>基準版 ${esc(review.rubricVersion)} / ${time(review.at)}</small></div>` : '<p>評価待ちです。</p>'}</div></details>`;
  }).join('');
}
views.task = async () => {
  const task = await api('/task'); let draft = task.draft; const last = task.submissions.at(-1);
  const review = task.reviews.find(r => r.submissionId === last?.id);
  const pending = last && !review;
  return { html: title('TEACHING PRACTICE', '指導課題・成果物の提出', task.title) + errorBox() + `<div class="note">${task.mode === 'assessment' ? '自力評価課題：AI援助は制限されています。' : '学習課題：利用したAI・他者の援助を申告してください。'} 下書きと提出版を分けて保存します。</div><div class="task-layout"><section class="card"><form id="task-form">${taskFields.map(([key, name, desc]) => `<label for="${key}">${name}<span class="required">必須</span></label><p class="field-help">${desc}</p><textarea id="${key}" name="${key}" rows="${key === 'goal' || key === 'assistance' ? 2 : 4}" maxlength="5000">${esc(draft[key])}</textarea>`).join('')}<p id="save-status" role="status">${draft.savedAt ? `下書き保存済み：${time(draft.savedAt)}` : '未保存'}</p><div class="actions"><button type="submit" class="secondary">下書き保存</button><button type="button" class="primary" id="submit-task" ${pending ? 'disabled' : ''}>${last ? '改善版を提出' : '課題を提出'}</button></div></form><div class="attachment"><label for="attachment">補足ファイル（任意）</label><p class="field-help">このデモではUTF-8のtxt・100KBまで。PDF・画像・ウイルス検査・S3保存はB担当との連携が必要です。</p><input type="file" id="attachment" accept=".txt,text/plain"><button id="upload" class="secondary small">添付を保存</button><p id="attachment-status" role="status">${draft.attachment ? `保存済み：${esc(draft.attachment.name)}（デモ用テキストのみ）` : '添付なし'}</p></div></section><aside><section class="card"><h2>提出の流れ</h2><ol class="timeline"><li>課題に取り組む</li><li>下書きを保存する</li><li>提出版を確定する</li><li>専門家のレビュー</li><li>改善して再提出する</li></ol>${badge(pending ? 'レビュー待ち' : review ? 'レビュー済み' : '未提出', pending ? 'amber' : 'green')}<p class="muted">提出後の版は変更されません。変更は新しい提出版になります。</p></section><section class="card"><h2>5つの評価観点</h2>${axisNames.map(([k, name]) => `<p><b>${k}</b> ${name}</p>`).join('')}<small>デモ基準：各0〜3。全観点2以上かつ人の確定評価でデモ単元到達。実際の基準は要合意。</small></section></aside></div><section class="card"><h2>提出・評価の履歴</h2>${historyHTML(task)}</section>${review ? `<section class="card"><h2>評価への申立て</h2><p class="muted">別評価者への再割当は未実装です。このデモは受付状態までを確認します。</p>${task.appeals.some(a => a.reviewId === review.id) ? '<p class="alert warning">申立て受付済み・再評価者の割当待ち</p>' : '<form id="appeal-form"><label for="reason">理由</label><textarea id="reason" name="reason" maxlength="2000" required></textarea><button class="secondary">申立てを記録する</button></form>'}</section>` : ''}`, bind() {
    const form = $('#task-form');
    form.addEventListener('input', () => { dirty = true; $('#save-status').textContent = '未保存の変更があります'; });
    bindForm('#task-form', async data => {
      $('#save-status').textContent = '保存中…';
      try { draft = await api('/draft', { method: 'PUT', body: { ...data, revision: draft.revision } }); delete $('#submit-task').dataset.requestId; dirty = false; $('#save-status').textContent = `下書き保存済み：${time(draft.savedAt)}`; toast('下書きを保存しました。'); }
      catch (e) { $('#save-status').textContent = '保存を確認できません。入力は画面に残っています。'; throw e; }
    });
    $('#submit-task').onclick = async event => {
      if (dirty) return inlineError({ message: '先に下書きを保存してください。' });
      if (!confirm('現在保存されている下書きを提出版として確定しますか？')) return;
      const button = event.currentTarget; button.disabled = true;
      // 通信失敗時の再送でも同じリクエストIDを使う。
      button.dataset.requestId ||= crypto.randomUUID();
      try { await api('/submissions', { method: 'POST', body: { revision: draft.revision, requestId: button.dataset.requestId } }); toast('提出しました。評価者のレビューをお待ちください。'); render(); }
      catch (e) { inlineError(e); button.disabled = false; if (e.status >= 400 && e.status < 500) delete button.dataset.requestId; }
    };
    $('#upload').onclick = async event => {
      const file = $('#attachment').files[0];
      if (!file || !file.name.toLowerCase().endsWith('.txt') || file.size > 100000) return inlineError({ message: '100KB以内のtxtファイルを選択してください。' });
      if (dirty) return inlineError({ message: '先に下書きを保存してください。' });
      const button = event.currentTarget; button.disabled = true;
      try { draft = await api('/attachments', { method: 'POST', body: { revision: draft.revision, name: file.name, content: await file.text() } }); delete $('#submit-task').dataset.requestId; $('#attachment-status').textContent = `保存済み：${file.name}（デモ用テキストのみ）`; toast('添付を保存しました。'); }
      catch (e) { inlineError(e); } finally { button.disabled = false; }
    };
    bindForm('#appeal-form', async data => { await api('/appeals', { method: 'POST', body: data }); toast('申立てを受け付けました。'); render(); });
  } };
};
views.progress = async () => {
  const p = await api('/progress');
  return { html: title('YOUR PROGRESS', '学習・到達状況', '知識の正答率と、専門家が評価する指導力を分けて確認します。') + `<div class="grid two"><section class="card"><p class="eyebrow">KNOWLEDGE</p><h2>小テストの知識スコア</h2><strong class="metric">${p.score === null ? '—' : p.score}<small>${p.score === null ? ' 未測定' : ' %'}</small></strong><p>${p.answered}問中 ${p.correct}問正解 / 全${p.total}問</p><p class="note">少数のデモ問題による結果です。指導力や正式な知識習得の認定を表すものではありません。</p><a href="#quiz">小テストへ →</a></section><section class="card"><p class="eyebrow">TEACHING COMPETENCE</p><h2>5つの能力軸</h2>${p.axes.map(a => `<div class="axis"><div><b>${a.id}</b><span>${a.name}</span><strong>${a.value === null ? '未測定' : `${a.value} / 3`}</strong></div><progress aria-label="${a.name}" value="${a.value ?? 0}" max="3"></progress></div>`).join('')}<p>${badge(p.reached ? '対象単元に到達（デモ判定）' : '未到達・未判定', p.reached ? 'green' : 'amber')}</p><small>対象：${esc(p.unit)} / 基準版 ${p.rubricVersion}<br>情報Ⅱ全体の修了や公的資格を示すものではありません。</small></section></div><section class="card"><h2>評価の根拠</h2>${p.review ? `<p>提出 v${p.review.version} · ${esc(p.review.reviewer)} · ${time(p.review.at)}</p><p class="pre">${esc(p.review.comment)}</p>${p.appealPending ? badge('申立て・再評価待ち', 'amber') : ''}` : '<p class="muted">まだ専門家の確定評価がありません。</p>'}<p><a href="#task">提出・評価の履歴を確認する →</a></p></section><section class="card"><h2>復習する内容</h2>${p.weaknesses.length ? p.weaknesses.map(w => `<div class="review-item"><strong>${esc(w.tag)}</strong><p>初回回答が不正解だったため、関連教材を確認しましょう。</p><a href="#materials/${w.materialId}">関連教材へ →</a></div>`).join('') : empty(p.answered ? '記録された誤答はありません' : 'まだ判定材料がありません', '小テストや指導課題で理解を確かめていきましょう。')}</section>` };
};
views.review = async () => {
  const task = await api('/task'), latest = task.submissions.at(-1);
  const reviewed = task.reviews.some(r => r.submissionId === latest?.id);
  return { html: title('EXPERT REVIEW', '提出物をレビューする', '担当する受講教員の提出版と評価基準を確認し、人間の評価者が確定します。') + errorBox() + `<section class="card"><h2>提出物・過去のレビュー</h2>${historyHTML(task)}</section>${latest && !reviewed ? `<section class="card"><h2>提出 v${latest.version} を評価</h2><p class="note">デモ評価基準：0＝未確認、1＝支援が必要、2＝基本を実行できる、3＝根拠を示して説明・応用できる。実際の基準は監修者と確定してください。</p><form id="review-form"><div class="grid five">${axisNames.map(([id, name]) => `<div><label for="score-${id}">${name}</label><select name="${id}" id="score-${id}" required><option value="">選択</option>${[0, 1, 2, 3].map(n => `<option value="${n}">${n}</option>`).join('')}</select></div>`).join('')}</div><label for="comment">評価の根拠・改善点</label><textarea name="comment" id="comment" rows="5" maxlength="5000" required></textarea><label for="decision">評価結果</label><select name="decision" id="decision"><option value="revise">改善・再提出を依頼</option><option value="confirmed">評価を確定</option></select><button class="primary">この提出版の評価を保存</button></form></section>` : latest ? '<div class="alert success">最新の提出版は評価済みです。再提出をお待ちください。</div>' : ''}${task.appeals.length ? `<section class="card"><h2>再評価の申立て</h2>${task.appeals.map(a => `<p class="pre">${esc(a.reason)}</p>${badge('別評価者への割当待ち', 'amber')}`).join('')}<p class="muted">別評価者への再割当・再評価の確定は、本番API接続時に実装します。</p></section>` : ''}`, bind() {
    $('#review-form')?.addEventListener('input', () => dirty = true);
    bindForm('#review-form', async data => {
      if (!confirm('入力した評価をこの提出版に保存しますか？')) return;
      await api('/reviews', { method: 'POST', body: { submissionId: latest.id, scores: Object.fromEntries(axisNames.map(([k]) => [k, Number(data[k])])), comment: data.comment, decision: data.decision } }); dirty = false; toast('評価を保存しました。'); render();
    });
  } };
};
views.training = async () => {
  const data = await api('/training');
  return { html: title('TRAINING OVERVIEW', '研修の状況', '担当研修の受講状況と、レビュー待ちを確認します。') + `<section class="card"><div class="section-head"><h2>${esc(data.training)}</h2>${badge('デモ1単元・受講者1名')}</div><div class="table-wrap"><table><thead><tr><th>受講教員</th><th>知識スコア</th><th>提出</th><th>レビュー</th><th>単元到達</th></tr></thead><tbody>${data.people.map(p => `<tr><td>${esc(p.name)}</td><td>${p.score === null ? '未測定' : `${p.score}%`}</td><td>${p.submissionCount ? `${p.submissionCount}版` : '未提出'}</td><td>${p.pending ? 'レビュー待ち' : p.review ? '評価済み' : '対象なし'}</td><td>${p.reached ? '到達（デモ）' : '未到達・未判定'}</td></tr>`).join('')}</tbody></table></div><p><a class="button primary" href="#review">提出物をレビューする →</a></p></section><p class="note">所属・担当研修の本番認可、研修／単元の絞り込み、複数評価者への割当はB担当との接続時に追加します。</p>` };
};
views.manage = async () => {
  const list = await api('/admin/materials');
  const next = { DRAFT: 'REVIEW', REVIEW: 'APPROVED', APPROVED: 'INDEXING', INDEXING: 'PUBLISHED', PUBLISHED: 'WITHDRAWN', WITHDRAWN: 'REVIEW' };
  return { html: title('MATERIAL MANAGEMENT', '教材の公開管理', '承認と公開を区別し、公開済みの教材だけを学習画面に表示します。') + errorBox() + '<p class="note">このデモでは教材テキストの登録と状態遷移を確認します。PDF解析・検索用取込・専門家承認の実処理はC担当と接続します。</p>' + `<section class="card"><h2>教材一覧</h2><div class="table-wrap"><table><thead><tr><th>教材</th><th>版</th><th>状態</th><th>次の操作</th></tr></thead><tbody>${list.map(m => `<tr><td>${esc(m.title)}</td><td>v${m.version}</td><td>${badge(stateLabels[m.status], m.status === 'PUBLISHED' ? 'green' : 'amber')}</td><td><button class="secondary small transition" data-id="${m.id}" data-version="${m.version}" data-next="${next[m.status]}">${stateLabels[next[m.status]]}へ</button></td></tr>`).join('')}</tbody></table></div></section><section class="card"><h2>教材を登録</h2><form id="material-form"><label for="title">教材名</label><input id="title" name="title" maxlength="150" required><label for="source">出典・利用許諾の確認メモ</label><input id="source" name="source" maxlength="1000" required><label for="text">教材本文（デモ用テキスト）</label><textarea id="text" name="text" rows="5" maxlength="5000" required></textarea><button class="primary">下書きとして登録</button></form></section><section class="card"><h2>問題・知識マップの管理</h2><p class="muted">この版では小テストはサーバーの固定データです。問題の編集・承認・知識マップの管理画面は、C担当の契約確定後に追加する未実装項目です。</p></section>`, bind() {
    $('#material-form').addEventListener('input', () => dirty = true);
    bindForm('#material-form', async data => { await api('/admin/materials', { method: 'POST', body: data }); dirty = false; toast('教材を下書き登録しました。'); render(); });
    document.querySelectorAll('.transition').forEach(button => button.onclick = async () => {
      if (!leaveOK()) return;
      const reason = prompt(`「${stateLabels[button.dataset.next]}」に変更する理由を入力してください。\n取込・承認の実処理は行わず、デモ状態を変更します。`);
      if (!reason?.trim()) return;
      button.disabled = true;
      try { await api(`/admin/materials/${button.dataset.id}/transition`, { method: 'POST', body: { version: Number(button.dataset.version), status: button.dataset.next, reason } }); dirty = false; toast('教材の状態を変更しました。'); render(); }
      catch (e) { inlineError(e); button.disabled = false; }
    });
  } };
};
views.settings = async () => {
  const data = await api('/admin/settings');
  return { html: title('OPERATIONS', '運用設定', '重要な操作は変更理由と確認を伴います。ここでの設定はデモサーバーにのみ反映されます。') + errorBox() + `<div class="grid two"><section class="card"><h2>AI・学習モード</h2><form id="settings-form"><label class="option"><input type="checkbox" name="aiEnabled" ${data.aiEnabled ? 'checked' : ''}><span>AIを利用可能にする</span></label><label for="dailyLimit">1人あたりの日次上限（デモはUTC日付）</label><input id="dailyLimit" name="dailyLimit" type="number" min="1" max="100" value="${data.dailyLimit}" required><label for="studyMode">課題の援助ポリシー</label><select id="studyMode" name="studyMode"><option value="practice" ${data.studyMode === 'practice' ? 'selected' : ''}>学習：AI利用可</option><option value="assessment" ${data.studyMode === 'assessment' ? 'selected' : ''}>自力評価：AI援助不可</option></select><label for="setting-reason">変更理由</label><textarea id="setting-reason" name="reason" maxlength="1000" required></textarea><button class="primary">設定を保存</button></form></section><section class="card danger-card"><h2>デモ学習データの削除</h2><p>${esc(data.storage)}</p><p>対象：受講教員の回答・下書き・提出版・添付・評価・申立て・AIジョブ・回答報告。教材、設定、利用回数、操作履歴は残ります。</p><form id="delete-form"><label for="delete-reason">削除理由</label><textarea id="delete-reason" name="reason" maxlength="1000" required></textarea><label for="confirm">確認として「削除」と入力</label><input id="confirm" name="confirm" pattern="削除" required><button class="danger">対象データを削除</button></form></section></div><section class="card"><h2>デモ操作履歴</h2>${data.audit.length ? `<ul class="audit">${data.audit.map(a => `<li><b>${esc(a.action)}</b><p>${esc(a.reason)}</p><small>${esc(a.actor)} · ${time(a.at)}</small></li>`).join('')}</ul>` : empty('操作履歴はありません', '設定や教材の状態変更をすると表示されます。')}</section>`, bind() {
    bindForm('#settings-form', async data => {
      if (!confirm('AIと課題の設定を変更しますか？')) return;
      await api('/admin/settings', { method: 'PUT', body: { ...data, aiEnabled: data.aiEnabled === 'on', dailyLimit: Number(data.dailyLimit) } }); toast('設定を保存しました。'); render();
    });
    bindForm('#delete-form', async data => {
      if (!confirm('デモ学習データを削除します。元に戻せません。実行しますか？')) return;
      await api('/admin/delete-learning', { method: 'POST', body: data }); toast('デモ学習データを削除しました。'); render();
    });
  } };
};
document.addEventListener('click', event => {
  const a = event.target.closest('a[href^="#"]');
  if (!a || a.getAttribute('href') === '#main') return;
  if (!leaveOK()) { event.preventDefault(); return; }
  dirty = false;
  if (location.hash === a.getAttribute('href')) { event.preventDefault(); render(); }
});
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
let previousHash = location.hash;
window.addEventListener('hashchange', () => {
  if (dirty && !leaveOK()) { history.replaceState(null, '', previousHash || '#home'); return; }
  previousHash = location.hash; render();
});
async function start() {
  try { const data = await api('/me'); me = data.user; settings = data.settings; render(); }
  catch { login(); }
}
start();
