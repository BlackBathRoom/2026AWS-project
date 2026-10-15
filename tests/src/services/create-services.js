'use strict';
module.exports=function createServices(mode) {
 const s={};
 if(mode==='mock') {
  const state=require('../mock/state').createState();
  s.B=require('../mock/B')({state,getC:()=>s.C});
  s.C=require('../mock/C')({state,getB:()=>s.B});
  s.state=state;
 } else {
  s.B=require('./B/live')({getC:()=>s.C});
  s.C=require('./C/live')({getB:()=>s.B});
 }
 return s;
};
