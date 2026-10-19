import assert from 'node:assert/strict';
import {World,RADII} from './physics.mjs';
import {MUTATION_TYPES,MUTATION_DEFINITIONS,rollMutation} from './mutations.mjs';
const tick=w=>w.step(1/120);
const steps=(w,n)=>{for(let i=0;i<n;i++){tick(w);if(w.over||w.won)break;}};
assert(MUTATION_TYPES.includes('maniac')&&!MUTATION_TYPES.includes('spring'));
assert.equal(MUTATION_DEFINITIONS.maniac.weight,25);
let count=0;assert.equal(rollMutation({level:0,throwNumber:5,random:()=>count++===0?.01:.46}),'maniac');
{
 const w=new World(),killer=w.add(0,180,200,{mutationType:'maniac',vy:230});
 const victim=w.add(1,180,235);tick(w);
 assert.equal(w.balls.length,1);assert.equal(w.balls[0].id,killer.id);
 assert.equal(killer.mutation.phase,'spent');
 assert.equal(w.events.filter(e=>e.mutation==='maniac').length,1);
 assert.equal(w.events.find(e=>e.mutation==='maniac').targetId,victim.id);
 assert.equal(w.score,0);
}
{
 const w=new World();w.add(0,160,200,{mutationType:'maniac',vy:180});w.add(0,160,230);
 tick(w);assert.equal(w.balls.length,1);assert.equal(w.balls[0].level,1);
 assert.equal(w.balls[0].mutation,undefined);
 assert(!w.events.some(e=>e.mutation==='maniac'));
}
{
 const w=new World(),killer=w.add(0,180,210,{mutationType:'maniac',vy:220});
 w.add(1,180,243);w.add(2,230,243);tick(w);
 assert.equal(w.balls.length,2);assert.equal(killer.mutation.phase,'spent');steps(w,10);
 assert.equal(w.events.filter(e=>e.mutation==='maniac').length,1);
}
{
 const w=new World(),killer=w.add(0,100,330,{mutationType:'maniac',vy:300});
 const boss=w.add(8,100,420,{kind:'kamilla'});tick(w);
 assert(w.balls.some(b=>b.id===boss.id));
}
{
 const w=new World(),killer=w.add(0,100,370,{mutationType:'maniac',vx:180});
 const other=w.add(1,137,370);tick(w);
 assert(w.balls.some(b=>b.id===other.id));assert.equal(killer.mutation.phase,'armed');
}
{
 const w=new World(),m=w.add(0,90,650-RADII[0],{mutationType:'magnet'});
 const far=w.add(0,210,650-RADII[0]);tick(w);
 assert.equal(m.mutation.phase,'active');
 const initial=far.x;steps(w,80);
 assert(far.x<initial-10,'magnet should pull across 120 units');
 const expiry=new World(),solo=expiry.add(0,90,650-RADII[0],{mutationType:'magnet'});steps(expiry,300);assert.equal(solo.mutation.phase,'spent');
}
{
 const w=new World();const killer=w.add(0,160,200,{mutationType:'maniac',vy:200,lock:2});
 const same=w.add(0,160,230,{lock:2});tick(w);
 assert.equal(w.balls.length,2,'locked same-level cat must not be deleted');
 assert.equal(killer.mutation.phase,'armed');
 assert(w.balls.includes(same));
}
console.log('MANIAC_AND_MAGNET_PASS');
