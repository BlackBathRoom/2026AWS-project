import {api} from './api.js';
export const C={lesson:id=>api('/lessons/'+encodeURIComponent(id)),content:(cursor='')=>api('/content'+(cursor?'?cursor='+encodeURIComponent(cursor):'')),edges:()=>api('/knowledge-edges')};
