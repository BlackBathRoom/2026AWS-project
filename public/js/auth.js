// Local mock tokens only. Production Cognito integration is a separate step.
export const demoUsers = [
 {id:'mock-user-001',label:'受講教員（school-001）'},
 {id:'mock-user-002',label:'受講教員（school-002）'},
 {id:'mock-user-003',label:'研修担当'},
 {id:'mock-user-004',label:'評価者'},
 {id:'mock-user-005',label:'運営管理者'},
 {id:'mock-user-006',label:'受講教員B（school-001）'}
];
// Tokens stay in memory; reloads start a fresh authorization flow.
let token = null;
let expiresAt = 0;
const transactionKey = 'bittomo.oauth.transaction';
const isMock = () => window.RUNTIME_CONFIG.mode === 'mock';
function config() {
 const c = window.RUNTIME_CONFIG.cognito;
 if (!c || !c.domain || !c.client_id || !c.redirect_uri) throw new Error('Cognito設定が不足しています。');
 const domain = new URL(c.domain);
 if (domain.protocol !== 'https:' || domain.pathname !== '/' || domain.search || domain.hash) throw new Error('Cognitoドメインの設定が不正です。');
 if (new URL(c.redirect_uri).origin !== location.origin) throw new Error('ログインの戻り先が一致しません。');
 return c;
}
function base64url(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function random() { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
export const auth = {
 async getAccessToken() {
  if (!isMock() && Date.now() >= expiresAt) token = null;
  return token;
 },
 async completeSignIn() {
  if (isMock()) return;
  const url = new URL(location.href);
  if (!url.searchParams.has('code') && !url.searchParams.has('error')) return;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const failed = url.searchParams.has('error');
  for (const key of ['code','state','error','error_description']) url.searchParams.delete(key);
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  const raw = sessionStorage.getItem(transactionKey);
  sessionStorage.removeItem(transactionKey);
  const c = config();
  let tx;
  try { tx = JSON.parse(raw); } catch {}
  if (!tx || state !== tx.state || !tx.verifier || tx.redirect !== c.redirect_uri || !Number.isFinite(tx.created) || Date.now()-tx.created > 600000 || tx.created > Date.now()) throw new Error('ログインの確認情報がありません。アプリのサインインからやり直してください。');
  if (failed || !code) throw new Error('Cognitoでのログインが完了しませんでした。再度サインインしてください。');
  const response = await fetch(c.domain + '/oauth2/token', {
   method:'POST', credentials:'omit', redirect:'error',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({grant_type:'authorization_code',client_id:c.client_id,redirect_uri:c.redirect_uri,code,code_verifier:tx.verifier})
  });
  const data = await response.json().catch(()=>({}));
  if (!response.ok || typeof data.access_token !== 'string' || data.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new Error('ログイン情報を取得できませんでした。再度サインインしてください。');
  token = data.access_token;
  expiresAt = Date.now() + data.expires_in * 1000 - 30000;
 },
 async signIn(id) {
  token = null;
  if (isMock()) {
   if (!demoUsers.some(user=>user.id===id)) throw new Error('確認する利用者を選択してください。');
   const response = await fetch(window.RUNTIME_CONFIG.api_base+'/me',{headers:{Accept:'application/json',Authorization:'Bearer '+id},credentials:'omit',redirect:'error'});
   if (!response.ok) throw new Error('ログインできませんでした（HTTP '+response.status+'）。');
   token=id; return true;
  }
  const c=config();
  const verifier=random(), state=random();
  const challenge=base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
  sessionStorage.setItem(transactionKey,JSON.stringify({verifier,state,created:Date.now(),redirect:c.redirect_uri}));
  const url=new URL('/oauth2/authorize',c.domain);
  url.search=new URLSearchParams({response_type:'code',client_id:c.client_id,redirect_uri:c.redirect_uri,scope:c.scopes||'openid email profile',state,code_challenge:challenge,code_challenge_method:'S256'}).toString();
  location.assign(url.href); return false;
 },
 async signOut() {
  token=null; expiresAt=0; sessionStorage.removeItem(transactionKey);
  if (isMock()) return;
  const c=config(); const url=new URL('/logout',c.domain);
  url.search=new URLSearchParams({client_id:c.client_id,logout_uri:c.redirect_uri}).toString();
  location.assign(url.href);
 }
};
