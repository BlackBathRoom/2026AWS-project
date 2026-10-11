// 通信処理をここに集約。B/Cの本番API接続時はAPI_CONTRACT.mdに従って変更する。
export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export async function api(path, { method = 'GET', body, signal } = {}) {
  const controller = new AbortController();
  const relay = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', relay, { once: true });
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`/api${path}`, { method, credentials: 'same-origin', signal: controller.signal,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    let data;
    try { data = await response.json(); } catch { throw new ApiError(response.status, 'INVALID_RESPONSE', 'APIの応答形式を確認してください。'); }
    if (!response.ok) throw new ApiError(response.status, data.code, data.message || '処理に失敗しました。');
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new ApiError(0, 'TIMEOUT', '通信が時間切れになりました。保存結果を確認してから再試行してください。');
    throw e;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', relay); }
}
export async function waitForAI(jobId, signal, onWaiting) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (signal.aborted) return null;
    await new Promise(resolve => setTimeout(resolve, Math.min(2000, deadline - Date.now())));
    if (signal.aborted) return null;
    const control = new AbortController();
    const abort = () => control.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, Math.max(1, deadline - Date.now()));
    let result;
    try { result = await api(`/ai/jobs/${encodeURIComponent(jobId)}`, { signal: control.signal }); }
    finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
    if (signal.aborted) return null;
    if (result.status === 'COMPLETED') return result;
    if (result.status === 'FAILED') throw new ApiError(500, 'AI_FAILED', result.message);
    onWaiting();
  }
  throw new ApiError(0, 'TIMEOUT', '30秒以内に回答を取得できませんでした。後で再試行してください。');
}
