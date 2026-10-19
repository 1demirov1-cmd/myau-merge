import assert from 'node:assert/strict';
import {World} from './physics.mjs';
import {
  MUTATION_CHANCE, FIRST_MUTATION_THROW, MAX_ACTIVE_MUTATIONS,
  MUTATION_TYPES, MUTATION_DEFINITIONS, createMutationState, isMutationLevel,
  countActiveMutations, isActiveMutation, rollMutation, activateMutation,
  advanceMutation, spendMutation,
} from './mutations.mjs';

assert.equal(MUTATION_CHANCE, .1);
assert.equal(FIRST_MUTATION_THROW, 5);
assert.equal(MAX_ACTIVE_MUTATIONS, 3);
assert.equal(MUTATION_DEFINITIONS.maniac.weight,25);
assert.equal(MUTATION_DEFINITIONS.magnet.rangeInRadii,7);
assert.deepEqual(MUTATION_TYPES, ['ghost','heavy','maniac','ninja','magnet']);
assert.equal(MUTATION_TYPES.reduce((sum,t)=>sum+MUTATION_DEFINITIONS[t].weight,0),100);
for(let i=0;i<=8;i++) assert.equal(isMutationLevel(i),i<=4);
assert(!isMutationLevel(2.5));
assert(!isMutationLevel(-1));

// No draws should be consumed when ineligible; chance is exactly 10%, no pity mechanic.
const noRng=()=>{throw Error('RNG must not be called');};
for(let n=1;n<5;n++) assert.equal(rollMutation({level:0,throwNumber:n,random:noRng}),null);
assert.equal(rollMutation({level:5,throwNumber:5,random:noRng}),null);
assert.equal(rollMutation({level:8,throwNumber:5,random:noRng}),null);
assert.equal(rollMutation({level:0,throwNumber:5,balls:[
  {mutation:createMutationState('heavy')},
  {mutation:createMutationState('ghost')},
  {mutation:createMutationState('magnet')},
],random:noRng}),null);
assert.equal(rollMutation({level:0,throwNumber:5,random:()=>.1}),null);

const cases=[['ghost',0],['heavy',.20],['maniac',.45],['ninja',.70],['magnet',.85]];
for(const [expected,pick] of cases) {
  const numbers=[.05,pick];let calls=0;
  const value=rollMutation({level:0,throwNumber:5,random:()=>numbers[calls++]});
  assert.equal(value,expected);assert.equal(calls,2);
}
assert.throws(()=>rollMutation({level:0,throwNumber:0}),RangeError);
assert.throws(()=>rollMutation({level:0,throwNumber:5,random:()=>1}),RangeError);
assert.throws(()=>rollMutation({level:0,throwNumber:5,random:()=>NaN}),RangeError);
assert.throws(()=>createMutationState('unknown'),RangeError);

// Reproducible statistics across 100,000 eligible independent draws.
let seed=0x12345678;
const seededRandom=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const counts=Object.fromEntries(MUTATION_TYPES.map(type=>[type,0]));
let mutated=0;
for(let i=0;i<100000;i++){
  const type=rollMutation({level:0,throwNumber:i+5,random:seededRandom});
  if(type){counts[type]++;mutated++;}
}
assert(mutated>9500&&mutated<10500,'10% rate '+mutated);
for(const type of MUTATION_TYPES){
  const share=counts[type]/mutated;
  assert(Math.abs(share-MUTATION_DEFINITIONS[type].weight/100)<.025,type+' distribution '+share);
}

// Pure, serializable state transitions and pause behavior.
const ghost=createMutationState('ghost');
assert.deepEqual(ghost,{type:'ghost',phase:'armed',remaining:0});
assert(isActiveMutation(ghost));
const started=activateMutation(ghost);
assert.deepEqual(started,{type:'ghost',phase:'active',remaining:1.5});
assert.deepEqual(ghost,{type:'ghost',phase:'armed',remaining:0},'state functions are immutable');
const half=advanceMutation(started,.5);
assert.equal(half.remaining,1);
assert.strictEqual(advanceMutation(half,10,{paused:true}),half);
const ended=advanceMutation(half,1);
assert.equal(ended.phase,'spent');
assert.equal(ended.remaining,0);
assert(!isActiveMutation(ended));
assert.strictEqual(activateMutation(ended),ended);
assert.throws(()=>advanceMutation(started,-.1),RangeError);
assert.throws(()=>advanceMutation(started,NaN),RangeError);
const heavy=activateMutation(createMutationState('heavy'));
assert.equal(heavy.phase,'active');assert.equal(heavy.remaining,null);
assert.strictEqual(advanceMutation(heavy,100),heavy);
assert.equal(spendMutation(heavy).phase,'spent');
for(const type of ['maniac','ninja']){
  assert.equal(activateMutation(createMutationState(type)).phase,'spent');
}
assert.equal(advanceMutation(activateMutation(createMutationState('magnet')),2).phase,'spent');

// Integration: ball model supports optional mutation without enabling its physical effect.
const world=new World();
world.add(0,40,180,{mutationType:'ghost'});
world.add(1,100,180,{mutationType:'heavy'});
world.add(2,200,180,{mutationType:'maniac'});
assert.equal(world.activeMutationCount(),3);
assert.equal(countActiveMutations(world.balls),3);
const prevId=world.nextId;
assert.throws(()=>world.add(0,280,180,{mutationType:'magnet'}),/limit/i);
assert.equal(world.nextId,prevId);
assert.throws(()=>world.add(8,280,180,{mutationType:'magnet'}),RangeError);
assert.throws(()=>world.add(0,280,180,{mutationType:'???'}),RangeError);
assert.equal(world.nextId,prevId);
world.balls[0].mutation=spendMutation(world.balls[0].mutation);
assert.equal(world.activeMutationCount(),2);
world.add(0,280,180,{mutationType:'magnet'});
assert.equal(world.activeMutationCount(),3);

// Merger consumes the special ball, resulting ball has no mutation.
const merge=new World();
merge.add(0,120,300,{mutationType:'ninja'});
merge.add(0,120,300);
merge.step(1/120);
assert.equal(merge.balls.length,1);
assert.equal(merge.balls[0].level,1);
assert.equal(merge.balls[0].mutation,undefined);
assert.equal(merge.activeMutationCount(),0);

// Physics phase: heavy does not change gravitational acceleration in free-fall,
// although it changes momentum sharing with other cats.
const plain=new World(),decorated=new World();
plain.add(0,90,100); decorated.add(0,90,100,{mutationType:'heavy'});
for(let i=0;i<60;i++){plain.step(1/120);decorated.step(1/120);}
for(const key of ['x','y','vx','vy','angle','spin','level']){
  assert.equal(plain.balls[0][key],decorated.balls[0][key],key+' changed physical behavior');
}
// No mutations can be generated for final cats; existing victory mechanics remain tested separately.
assert.equal(rollMutation({level:8,throwNumber:999,random:noRng}),null);
assert.equal(rollMutation({level:7,throwNumber:999,random:noRng}),null);
assert.deepEqual(JSON.parse(JSON.stringify(started)),started);
console.log('MYAU_MUTATIONS_PHASE1_PASS: 5 types, sampling, state lifecycle, caps, merges, unchanged physics; sample='+mutated);
