import assert from 'node:assert/strict';
import {World} from './physics.mjs';
import {captureSnapshot,restoreSnapshot,encodeSave,decodeSave,SAVE_VERSION} from './game_state.mjs';
const mk=()=>new World({random:()=>.4});
const ui={state:'playing',pausedFrom:'playing',current:0,next:1,
  currentMutation:null,nextMutation:'ghost',throwCount:4,highest:2,
  helpRemaining:3,shakeUsed:false,announcedMutations:[],aim:180,lastDrop:.48,seenMerge:true,finalClock:0,winCats:[]};
const w=mk();w.add(0,100,100,{mutationType:'maniac'});w.add(1,200,600);
w.balls[0].mutation.phase='armed';w.balls[0].mutationSettle=.17;
w.time=.55;w.score=24;
const before=captureSnapshot(w,ui,0xabba67);
const text=encodeSave(before,before);
assert.equal(JSON.parse(text).version,SAVE_VERSION);
const loaded=decodeSave(text,mk);
assert(loaded);assert(loaded.undo);
assert.deepEqual(captureSnapshot(loaded.restored.world,loaded.restored.ui,loaded.restored.rngState),before);
assert.equal(loaded.restored.world.random(),.4);
assert.equal(loaded.restored.world.events.length,0);
assert.notStrictEqual(loaded.restored.world.balls,w.balls);
loaded.restored.world.balls[0].x=5;
assert.equal(w.balls[0].x,100);
assert.equal(loaded.restored.ui.nextMutation,'ghost');
assert.equal(loaded.undo.rngState,before.rngState);
const corrupted=(change)=>{const copy=structuredClone(before);change(copy);return copy};
for(const caseFn of [
  b=>b.version=100,
  b=>b.world.balls[0].vx=NaN,
  b=>b.world.balls[0].mutation.type='unknown',
  b=>b.world.balls[0].mutation.remaining=Infinity,
  b=>b.world.balls[0].id=b.world.balls[1].id,
  b=>b.world.balls[0].level=8,
  b=>b.ui.current=9,
  b=>b.ui.shakeUsed='false',
  b=>b.ui.currentMutation='invalid',
  b=>b.rngState=-1,
  b=>b.world.nextId=1,
  b=>b.ui.state='over',
]){assert.equal(restoreSnapshot(corrupted(caseFn),mk),null);}
const oldSave=structuredClone(before);
delete oldSave.ui.shakeUsed;
oldSave.world.balls[0].mutation.type='spring';
oldSave.ui.currentMutation='spring';oldSave.ui.nextMutation='spring';
oldSave.ui.announcedMutations=['spring'];
const migrated=restoreSnapshot(oldSave,mk);
assert(migrated,'old save migration must not wipe the game');
assert.equal(migrated.world.balls[0].mutation,undefined);
assert.equal(migrated.world.balls[0].level,0);
assert.equal(migrated.ui.currentMutation,null);
assert.equal(migrated.ui.nextMutation,null);
assert.equal(migrated.ui.shakeUsed,false);
assert.deepEqual(migrated.ui.announcedMutations,[]);
assert.equal(decodeSave('not-json',mk),null);
assert.equal(decodeSave('{"version":2}',mk),null);
const phased=mk();const ghost=phased.add(0,100,500,{mutationType:'ghost'});
phased.step(1/120);
const activeSnap=captureSnapshot(phased,ui,42);
const revived=restoreSnapshot(activeSnap,mk);
assert(revived);assert.equal(revived.world.balls[0].mutation.phase,'active');
assert(revived.world.balls[0].mutation.remaining>1);
revived.world.step(1/120);
assert(revived.world.balls[0].mutation.remaining<ghost.mutation.remaining);
console.log('MYAU_GAME_STATE_PASS: save, undo, RNG, mutations, corrupt data');
