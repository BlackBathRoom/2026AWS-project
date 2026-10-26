// Local mock tokens only. Production Cognito integration is a separate step.
export const demoUsers = [
 {id:'mock-user-001',label:'受講教員（school-001）'},
 {id:'mock-user-002',label:'受講教員（school-002）'},
 {id:'mock-user-003',label:'研修担当'},
 {id:'mock-user-004',label:'評価者'},
 {id:'mock-user-005',label:'運営管理者'},
 {id:'mock-user-006',label:'受講教員B（school-001）'}
];
let token = null;
function requireMock() {
 if(window.RUNTIME_CONFIG.mode !== 'mock') throw new Error('Cognitoのサインイン接続は未実装です。');
}
export const auth = {
 async getAccessToken(){ requireMock(); return token; },
 async signIn(id){
  requireMock(); token=null;
  if(!demoUsers.some(user=>user.id===id)) throw new Error('確認する利用者を選択してください。');
  const response=await fetch(window.RUNTIME_CONFIG.api_base+'/me',{
   headers:{Accept:'application/json',Authorization:'Bearer '+id},credentials:'omit',redirect:'error'
  });
  if(!response.ok){
   const data=await response.json().catch(()=>({}));
   throw new Error(data.message || 'ログインできませんでした（HTTP '+response.status+'）。');
  }
  token=id;
 },
 async signOut(){token=null;}
};
