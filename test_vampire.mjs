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
assert.equal(lone.mutation.phase,'spent','vampire gets only one chance');
assert.equal(empty.balls.length,1);

const boss=new World();
boss.add(8,180,552);
const v=boss.add(0,180,400,{mutationType:'vampire'});
advance(boss);
assert.equal(boss.balls.length,2,'boss immune');
assert.equal(v.mutation.phase,'spent');
console.log('VAMPIRE_PASS');
