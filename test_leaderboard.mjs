import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('./leaderboard.mjs',import.meta.url),'utf8');

function loadRanking(existing={}){
 const storage=new Map(Object.entries(existing));
 const elements=new Map();
 const windowEvents=new Map();
 function el(s){
  if(!elements.has(s)){
   const listeners=new Map();
   elements.set(s,{
    value:'',textContent:'',hidden:false,disabled:false,checked:false,
    addEventListener(type,fn){listeners.set(type,fn)},
    fire(type){return listeners.get(type)?.({target:this})},
    focus(){},
    append(){},
    replaceChildren(){},
   });
  }
  return elements.get(s);
 }
 const localStorage={
  getItem:key=>storage.has(key)?storage.get(key):null,
  setItem:(key,value)=>storage.set(key,String(value)),
  removeItem:key=>storage.delete(key)
 };
 const fakeWindow={addEventListener:(type,fn)=>windowEvents.set(type,fn)};
 const context=vm.createContext({
  document:{querySelector:el,createElement:()=>({textContent:'',className:'',append(){}})},
  localStorage,window:fakeWindow,
  setTimeout,clearTimeout,
  globalThis:{MYAU_SUPABASE_PUBLISHABLE_KEY:'test-key'},
 });
 vm.runInContext(source,context,{
  filename:'leaderboard.mjs',
  importModuleDynamically:async()=>{throw Error('Сеть недоступна')}
 });
 return {el,storage,context,windowEvents};
}

test('nickname persists immediately even without Supabase',async()=>{
 const app=loadRanking();
 app.el('#rank-nick').value='Курбан';
 const saving=app.el('#rank-save').fire('click');
 assert.equal(app.storage.get('myau-nickname'),'Курбан');
 assert.equal(app.el('#header-nick').textContent,'Курбан');
 assert.equal(app.storage.get('myau-rank-pending'),'yes');
 await saving;
 assert.match(app.el('#rank-status').textContent,/сохранён на устройстве/);
 assert.equal(app.el('#rank-save').disabled,false);
});

test('nickname survives reopening while connection is unavailable',async()=>{
 const app=loadRanking({'myau-nickname':'Курбан','myau-rank-choice':'joined','myau-rank-pending':'yes','myau-rank-reset-v1':'done'});
 assert.equal(app.el('#header-nick').textContent,'Курбан');
 assert.equal(app.el('#rank-nick').value,'Курбан');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(app.storage.get('myau-nickname'),'Курбан');
});

test('reconnect publishes a locally saved nickname',async()=>{
 const app=loadRanking();
 app.el('#rank-nick').value='Курбан';
 await app.el('#rank-save').fire('click');
 const fakeClient={
  auth:{getSession:async()=>({data:{session:{user:{id:'test-user'}}}})},
  from:()=>({
   upsert:async()=>({error:null}),
   select(_fields,opts){
    if(opts?.head)return {gt:async()=>({error:null,count:0})};
    return {
     eq:()=>({maybeSingle:async()=>({error:null,data:null})}),
     order(){return this},
     limit:async()=>({error:null,data:[]})
    };
   }
  })
 };
 app.context.fakeFactory=()=>fakeClient;
 vm.runInContext('createClient = fakeFactory',app.context);
 await app.windowEvents.get('online')();
 assert.equal(app.storage.get('myau-rank-pending'),undefined);
 assert.equal(app.el('#rank-place').textContent,'#1');
 assert.equal(app.storage.get('myau-rank-choice'),'joined');
});
