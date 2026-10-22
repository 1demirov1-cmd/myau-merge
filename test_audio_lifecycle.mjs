import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const game=readFileSync(new URL('./game.mjs',import.meta.url),'utf8');
const start=game.indexOf('let audioCtx,buffer,master,loadingAudio,voices=[];');
const stop=game.indexOf('function meow(',start);
assert.ok(start>=0&&stop>start,'audio lifecycle code present');
const block=game.slice(start,stop);

function simulateAudio(){
 const listeners=new Map(),windows=new Map(),contexts=[];
 const doc={
  hidden:false,
  addEventListener(type,fn){listeners.set(type,fn)},
  fire(type){listeners.get(type)?.()}
 };
 const win={
  addEventListener(type,fn){windows.set(type,fn)},
  AudioContext:class MockAudioContext{
   constructor(){this.state='running';this.destination={};contexts.push(this)}
   createGain(){return {gain:{value:0},connect(){}}}
   createDynamicsCompressor(){return {
    threshold:{value:0},knee:{value:0},ratio:{value:0},connect(){}}}
   decodeAudioData(){return Promise.resolve({duration:1})}
   resume(){this.state='running';return Promise.resolve()}
   close(){this.state='closed';return Promise.resolve()}
  }
 };
 let hushCount=0,persistCount=0;
 const sandbox={
  window:win,document:doc,
  audioBytes:Promise.resolve(null),soundEnabled:true,
  hush(){hushCount++},persist(){persistCount++},
  Promise
 };
 const api=vm.runInNewContext('(function(){'+block+';return {unlockAudio}})()',sandbox);
 return {api,doc,win,contexts,windows,sandbox,
  get hushCount(){return hushCount},
  get persistCount(){return persistCount}};
}

test('iOS background/foreground restores a fresh audio context on first gesture',async()=>{
 const a=simulateAudio();
 await a.api.unlockAudio(true);
 assert.equal(a.contexts.length,1);
 const first=a.contexts[0];
 a.doc.hidden=true;
 a.doc.fire('visibilitychange');
 assert.equal(a.hushCount,1);
 assert.equal(a.persistCount,1);
 first.state='interrupted';
 a.doc.hidden=false;
 a.doc.fire('visibilitychange');
 assert.equal(first.state,'running');
 a.doc.fire('pointerdown');
 await Promise.resolve();
 assert.equal(a.contexts.length,2);
 assert.equal(first.state,'closed');
 assert.equal(a.contexts[1].state,'running');
});

test('turning sound back on after an interruption can recreate the audio context',async()=>{
 const a=simulateAudio();
 await a.api.unlockAudio(true);
 a.doc.hidden=true;a.doc.fire('visibilitychange');
 a.sandbox.soundEnabled=false;
 a.doc.hidden=false;a.doc.fire('visibilitychange');
 a.doc.fire('pointerdown');
 assert.equal(a.contexts.length,1,'disabled sound does not autoplay');
 a.sandbox.soundEnabled=true;
 await a.api.unlockAudio(true);
 assert.equal(a.contexts.length,2);
 assert.equal(a.contexts[1].state,'running');
});

test('pagehide also flags sound context for recovery without waiting for Safari visibilitychange',async()=>{
 const a=simulateAudio();
 await a.api.unlockAudio(true);
 a.windows.get('pagehide')();
 a.doc.fire('touchstart');
 await Promise.resolve();
 assert.equal(a.contexts.length,2);
 assert.equal(a.contexts[0].state,'closed');
});
