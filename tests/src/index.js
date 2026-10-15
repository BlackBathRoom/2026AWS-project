'use strict';
const {createApp}=require('./app');
if(require.main===module) {
 const host=process.env.HOST||'127.0.0.1',port=process.env.PORT||3000;
 createApp().listen(port,host,()=>console.log(`Listening on http://${host}:${port}`));
}
module.exports={createApp};
