import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('./leaderboard.mjs',import.meta.url),'utf8');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function loadRanking(existing={}){
 const storage=new Map(Object.entries(existing));
 const elements=new Map(), windowEvents=new Map(), documentEvents=new Map();
 function el(s){
  if(!elements.has(s)){
   const listeners=new Map();
   elements.set(s,{
    value:'',textContent:'',hidden:false,disabled:false,checked:false,
    addEventListener(type,fn){listeners.set(type,fn)},
    fire(type){return listeners.get(type)?.({target:this})},
    focus(){},click(){return this.fire('click')},append(){},replaceChildren(){},
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
 const doc={hidden:false,querySelector:el,addEventListener:(type,fn)=>documentEvents.set(type,fn),
  createElement:()=>({textContent:'',className:'',append(){}})};
 const context=vm.createContext({
  document:doc,localStorage,window:fakeWindow,setTimeout,clearTimeout,
  setInterval:()=>0,clearInterval:()=>{},
  globalThis:{MYAU_SUPABASE_PUBLISHABLE_KEY:'test-key'},
 });
 vm.runInContext(source,context,{
  filename:'leaderboard.mjs',
  importModuleDynamically:async()=>{throw Error('Сеть недоступна')}
 });
 return {el,storage,context,windowEvents,documentEvents};
}

function fakeClient({writes=[],confirm=true,barrier=null,onWrite=null}={}){
 return {
  auth:{getSession:async()=>({data:{session:{user:{id:'test-user'}}}})},
  from:()=>({
   upsert:input=>{
    writes.push({...input});
    onWrite?.(input);
    return {select:()=>({single:async()=>{
     if(writes.length===1&&barrier)await barrier;
     return confirm?{error:null,data:{...input}}:{error:null,data:null};
    }})};
   },
   select(_fields,opts){
    if(opts?.head)return {gt:async()=>({error:null,count:0})};
    return {eq:()=>({maybeSingle:async()=>({error:null,data:null})}),
     order(){return this},limit:async()=>({error:null,data:[]})};
   }
  })
 };
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
 await sleep(0);
 assert.equal(app.storage.get('myau-nickname'),'Курбан');
});

test('reconnect publishes a locally saved nickname with verified server echo',async()=>{
 const app=loadRanking();
 app.el('#rank-nick').value='Курбан';
 await app.el('#rank-save').fire('click');
 const writes=[];
 app.context.fakeFactory=()=>fakeClient({writes});
 vm.runInContext('createClient = fakeFactory',app.context);
 app.windowEvents.get('online')();
 await sleep(35);
 assert.equal(app.storage.get('myau-rank-pending'),undefined,app.el('#rank-status').textContent);
 assert.equal(app.el('#rank-place').textContent,'#1');
 assert.equal(app.storage.get('myau-rank-choice'),'joined');
 assert.equal(writes.length,1);
});

test('score increasing during an in-flight network request is never dropped',async()=>{
 const app=loadRanking({'meow-best':'9248'});
 let releaseFirst; const barrier=new Promise(r=>releaseFirst=r);
 let writeStarted; const started=new Promise(r=>writeStarted=r);
 const writes=[];
 const fake=fakeClient({writes,barrier,onWrite:()=>writeStarted()});
 app.context.fakeFactory=()=>fake;
 vm.runInContext('createClient = fakeFactory',app.context);
 app.el('#rank-nick').value='Сигма';
 const saving=app.el('#rank-save').fire('click');
 await started;
 app.storage.set('meow-best','14364');
 app.windowEvents.get('myau-best-updated')();
 assert.equal(app.storage.get('myau-rank-pending'),'yes');
 assert.equal(app.el('#rank-place').textContent,'…');
 releaseFirst();
 await saving;
 await sleep(35);
 assert.deepEqual(writes.map(x=>x.best_score),[9248,14364]);
 assert.equal(app.storage.get('myau-rank-pending'),undefined);
 assert.equal(app.el('#rank-place').textContent,'#1');
});

test('missing server confirmation never marks a high score as published',async()=>{
 const app=loadRanking({'meow-best':'14364'});
 app.context.fakeFactory=()=>fakeClient({confirm:false});
 vm.runInContext('createClient = fakeFactory',app.context);
 app.el('#rank-nick').value='Сигма';
 await app.el('#rank-save').fire('click');
 assert.equal(app.storage.get('myau-rank-pending'),'yes');
 assert.equal(app.el('#rank-place').textContent,'—');
 assert.match(app.el('#rank-status').textContent,/не подтвердил/);
});

test('temporary authentication error must never replace the previous anonymous account',async()=>{
 const app=loadRanking({
  'myau-nickname':'Сигма',
  'myau-rank-choice':'joined',
  'myau-rank-pending':'yes',
  'myau-rank-reset-v1':'done',
  'meow-best':'14364'
 });
 let newAnonymousSignups=0;
 app.context.fakeFactory=()=>({
  auth:{
   getSession:async()=>({data:{session:null},error:new Error('token refresh timed out')}),
   signInAnonymously:async()=>{newAnonymousSignups++;return {error:null,data:{session:{user:{id:'wrong-new-id'}}}};}
  }
 });
 vm.runInContext('createClient = fakeFactory',app.context);
 app.windowEvents.get('online')();
 await sleep(35);
 assert.equal(newAnonymousSignups,0,'must not replace the existing account on network failure');
 assert.equal(app.storage.get('myau-nickname'),'Сигма');
 assert.equal(app.storage.get('meow-best'),'14364');
 assert.equal(app.storage.get('myau-rank-pending'),'yes');
 assert.match(app.el('#rank-status').textContent,/token refresh timed out/);
});

test('production ranking SDK is bundled locally, not loaded from esm.sh',()=>{
 assert.match(source,/import\('\.\/vendor\/supabase\.mjs'\)/);
 assert.doesNotMatch(source,/https:\/\/esm\.sh\//);
});
