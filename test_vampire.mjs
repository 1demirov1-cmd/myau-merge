import assert from 'node:assert/strict';
import {World,RADII} from './physics.mjs';
for(const level of [0,1,2,3,4,5,6,7]){
 const world=new World();
 const vampire=world.add(0,150,200,{mutationType:'vampire'});
 const victim=world.add(level,150,200);
 world.step(1/120);
 assert.equal(vampire.level,0);
 assert.equal(vampire.mutation.phase,'spent');
 assert(world.events.some(e=>e.mutation==='vampire'&&e.stage==='bite'));
 if(level<2){
   assert.equal(world.balls.length,1);
   assert(!world.balls.includes(victim));
 }else{
   assert.equal(world.balls.length,2);
   assert.equal(victim.level,level-2);
   assert.equal(victim.r,RADII[level-2]);
 }
}
const world=new World();
const vampire=world.add(0,150,200,{mutationType:'vampire'});
world.add(8,150,200);
world.step(1/120);
assert.equal(vampire.mutation.phase,'armed');
console.log('VAMPIRE_FIRST_CONTACT_PASS');
