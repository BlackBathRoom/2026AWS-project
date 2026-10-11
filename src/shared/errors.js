'use strict';
class AppError extends Error {
 constructor(status, code, message) { super(message); this.status=status; this.code=code; }
}
function requireValue(value, message='入力内容を確認してください。') { if (!value) throw new AppError(422,'INVALID_INPUT',message); }
function text(value, max=5000) { requireValue(typeof value==='string' && value.trim().length>0 && value.length<=max); return value.trim(); }
function allow(ctx, roles) { if (!roles.includes(ctx.user.role)) throw new AppError(403,'FORBIDDEN','この操作は許可されていません。'); }
function version(actual, expected) { if(actual!==expected) throw new AppError(409,'VERSION_CONFLICT','別の画面で更新されています。入力を控え、再読込してください。'); }
function missing() { throw new AppError(404,'NOT_FOUND','対象がないか、閲覧が許可されていません。'); }
module.exports={AppError,requireValue,text,allow,version,missing};
