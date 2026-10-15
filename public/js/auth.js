// 担当Bの差し替え箇所。Cognito/OIDCの認証フローをここへ接続。
// access tokenはlocalStorageに保存せず、SDKのセッション管理に従う。
export const auth = {
    async getAccessToken() { if(window.RUNTIME_CONFIG.mode==='mock')return null; throw new Error('担当B：auth.jsのgetAccessTokenを接続してください。'); },
    async signIn(user_id) { if(window.RUNTIME_CONFIG.mode==='mock'){const r=await fetch('/dev/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id})});if(!r.ok)throw new Error('デモに入場できませんでした。');return;}throw new Error('担当B：Cognitoのサインインを接続してください。'); },
    async signOut() { if(window.RUNTIME_CONFIG.mode==='mock'){await fetch('/dev/session',{method:'DELETE'});return;}throw new Error('担当B：サインアウトを接続してください。'); }
   };
   