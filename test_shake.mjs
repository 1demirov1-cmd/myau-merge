import assert from 'node:assert/strict';
import {World} from './physics.mjs';
import {shakeBalls} from './shake.mjs';
import {captureSnapshot,restoreSnapshot,encodeSave,decodeSave} from './game_state.mjs';
const mk=()=>new World({random:()=>.5});
const w=mk(),a=w.add(0,90,600),b=w.add(1,145,560),c=w.add(2,215,520);
w.danger=.8;
const original=w.balls.map(x=>({id:x.id,level:x.level,r:x.r,x:x.x,y:x.y}));
const moved=shakeBalls(w,()=>.5);
assert.equal(moved,3);
assert(w.danger<.8);
for(let i=0;i<3;i++){
 const after=w.balls[i],before=original[i];
 assert.equal(after.id,before.id);
 assert.equal(after.level,before.level);
 assert.equal(after.r,before.r);
 assert.equal(after.x,before.x);
 assert.equal(after.y,before.y);
 assert(Number.isFinite(after.vx)&&Number.isFinite(after.vy));
 assert(after.vy<=-140&&after.vy>=-460);
}
assert.notEqual(a.vx,0);
assert.notEqual(b.vx,0);
for(let i=0;i<100;i++)w.step(1/120);
assert(w.balls.every(x=>Number.isFinite(x.x)&&Number.isFinite(x.y)&&Number.isFinite(x.vx)&&Number.isFinite(x.vy)));
const blocked=mk();
assert.equal(shakeBalls(blocked),0);
blocked.add(0,40,300);blocked.bond={a:1,b:2,x:60,y:300,elapsed:0};
assert.equal(shakeBalls(blocked),0);
blocked.bond=null;blocked.won=true;
assert.equal(shakeBalls(blocked),0);
const ui={state:'playing',pausedFrom:'playing',current:0,next:1,
 currentMutation:null,nextMutation:null,throwCount:3,highest:1,
 helpRemaining:3,shakeUsed:true,announcedMutations:[],aim:180,
 lastDrop:1,seenMerge:true,finalClock:0,winCats:[]};
const save=captureSnapshot(w,ui,12345);
const loaded=decodeSave(encodeSave(save),mk);
assert(loaded);
assert.equal(loaded.restored.ui.shakeUsed,true,'used shake must persist across reloads');
const historical=structuredClone(save);delete historical.ui.shakeUsed;
assert.equal(restoreSnapshot(historical,mk).ui.shakeUsed,false,'old saves gain one shake');
const invalid=structuredClone(save);invalid.ui.shakeUsed='false';
assert.equal(restoreSnapshot(invalid,mk),null);
console.log('SHAKE_ONCE_PHYSICS_AND_SAVE_PASS');
