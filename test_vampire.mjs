import assert from 'node:assert/strict';
import {World} from './physics.mjs';

function advance(world,steps=300){
  for(let i=0;i<steps;i++) world.step(1/120);
}
const w=new World();
const target=w.add(1,180,625);
const vampire=w.add(0,180,570,{mutationType:'vampire'});
advance(w);
assert.equal(w.balls.length,1,'bite must combine the pair');
assert.equal(w.balls[0].level,1,'bite result level');
assert.equal(w.score,4,'bite awards merge points');
assert(w.events.some(e=>e.mutation==='vampire'&&e.stage==='bite'));
assert(w.events.some(e=>e.type==='merge'));

const empty=new World();
const lone=empty.add(0,180,500,{mutationType:'vampire'});
advance(empty);
assert.equal(lone.mutation.phase,'armed','vampire waits for a valid target');
assert.equal(empty.balls.length,1);

const boss=new World();
boss.add(8,180,552);
const v=boss.add(0,180,400,{mutationType:'vampire'});
advance(boss);
assert.equal(boss.balls.length,2,'boss immune');
assert.equal(v.mutation.phase,'armed','boss must not consume the bite');
console.log('VAMPIRE_PASS');

// Target arriving after the vampire has already landed must still trigger the bite.
const delayed=new World();
const waiting=delayed.add(0,160,632,{mutationType:'vampire'});
advance(delayed,120);
assert.equal(waiting.mutation.phase,'armed');
delayed.add(1,160,590);
advance(delayed,180);
assert.equal(delayed.balls.length,1);
assert.equal(delayed.balls[0].level,1);
assert(delayed.events.some(e=>e.mutation==='vampire'&&e.stage==='bite'));
