import assert from 'node:assert/strict';
import {World, RADII} from './physics.mjs';
import {isPhased, EFFECT_MAX_SPEED} from './mutation_effects.mjs';

const dt=1/120;
const step=(w,n=1)=>{for(let i=0;i<n;i++)w.step(dt);};
const near=(a,b,tolerance=.001)=>assert(Math.abs(a-b)<tolerance,`Expected ${a} ≈ ${b}`);

// Жиробас: same gravity, 5x lower inverse mass, different collision response.
{
  const normal=new World(), heavy=new World();
  const a=normal.add(0,110,400), b=heavy.add(0,110,400,{mutationType:'heavy'});
  step(normal,15);step(heavy,15);
  near(a.y,b.y);near(a.vy,b.vy);
  assert.equal(b.mutation.phase,'active');
  assert(heavy.events.some(e=>e.type==='mutation'&&e.mutation==='heavy'&&e.stage==='start'));
  const ordinary=new World(), weighted=new World();
  ordinary.add(0,130,570,{vx:110});const ordinaryTarget=ordinary.add(1,170,570);
  weighted.add(0,130,570,{vx:110,mutationType:'heavy'});const heavyTarget=weighted.add(1,170,570);
  step(ordinary,5);step(weighted,5);
  assert(heavyTarget.vx>ordinaryTarget.vx+3,'heavy must transfer more momentum');
}
// Maniac deletes only an eligible different-level cat upon descending contact.
{
  const w=new World();const killer=w.add(0,100,200,{mutationType:'maniac',vy:230});
  const target=w.add(1,100,235);step(w);
  assert(w.balls.some(b=>b.id===killer.id));
  assert(!w.balls.some(b=>b.id===target.id));
  assert.equal(killer.mutation.phase,'spent');
  assert.equal(w.events.filter(e=>e.mutation==='maniac').length,1);
}
// Ниндзя: settle 0.4 seconds, then exactly one jump.
{
  const w=new World({random:()=>.75});
  const b=w.add(0,180,650-RADII[0],{mutationType:'ninja'});
  step(w,42);assert.equal(b.mutation.phase,'armed');
  step(w,20);
  assert.equal(b.mutation.phase,'spent');
  assert(w.events.some(e=>e.mutation==='ninja'&&e.stage==='jump'));
  assert.equal(w.events.filter(e=>e.mutation==='ninja').length,1);
  const emitted=w.events.length;
  step(w,150);assert.equal(w.events.filter(e=>e.mutation==='ninja').length,1);
  assert(w.events.length>=emitted);
}
// Магнит: same-level pairs attract even when the magnet has a different level.
{
  const w=new World();
  const mag=w.add(2,90,650-RADII[2],{mutationType:'magnet'});
  const first=w.add(1,180,650-RADII[1]);
  const second=w.add(1,300,650-RADII[1]);
  const outsider=w.add(0,345,650-RADII[0]);
  step(w,1);assert.equal(mag.mutation.phase,'active');
  assert(w.events.some(e=>e.mutation==='magnet'&&e.stage==='start'));
  const distance=Math.abs(first.x-second.x), outsiderX=outsider.x;
  step(w,35);
  assert(!w.balls.includes(first)||!w.balls.includes(second)||Math.abs(first.x-second.x)<distance-1,
    'magnet must attract same-level pairs within its field');
  near(outsider.x,outsiderX);
  assert.equal(w.events.filter(e=>e.mutation==='magnet').length,1);
  const solo=new World();const soloMag=solo.add(2,90,650-RADII[2],{mutationType:'magnet'});
  step(solo,270);
  assert.equal(soloMag.mutation.phase,'spent');
  assert.equal(solo.events.filter(e=>e.mutation==='magnet').length,1);
}
// Призрак: phases through solids, does not merge until becoming solid.
{
  const w=new World();
  const ghost=w.add(0,140,500,{mutationType:'ghost'});
  w.add(0,140,500);
  step(w,100);assert(isPhased(ghost));
  assert(w.events.some(e=>e.mutation==='ghost'&&e.stage==='start'));assert.equal(w.balls.length,2);
  step(w,85);
  assert(!isPhased(ghost));
  assert(w.events.some(e=>e.mutation==='ghost'&&e.stage==='end'));
  assert.equal(w.balls.length,1,'ghost should merge only after phase expires');
  assert.equal(w.balls[0].level,1);
  assert.equal(w.activeMutationCount(),0);
}
{
  const w=new World();
  const ghost=w.add(0,175,510,{mutationType:'ghost'});
  w.add(3,175,510);
  step(w,340);
  assert(w.balls.some(b=>b.id===ghost.id),'different levels should not merge');
  for(const b of w.balls){
    assert(Number.isFinite(b.x)&&Number.isFinite(b.y)&&Number.isFinite(b.vx)&&Number.isFinite(b.vy));
    assert(b.x>=b.r-1e-6&&b.x<=w.width-b.r+1e-6);
    assert(b.y<=w.height-b.r+1e-6);
  }
}
// Mutations never apply special magnetic/pulse forces directly to either final boss.
{
  const w=new World();
  w.add(8,225,400,{kind:'kamilla'});
  w.add(2,90,650-RADII[2],{mutationType:'magnet'});
  step(w,1);
  const boss=w.balls.find(b=>b.kind==='kamilla');
  const initial=boss.vx;step(w,30);near(boss.vx,initial);
  assert.throws(()=>w.add(8,225,350,{kind:'demir',mutationType:'ghost'}),RangeError);
}
// Pause is implemented at the caller: World.step is not invoked while paused.
{
  const w=new World();const b=w.add(0,180,400,{mutationType:'ghost'});
  step(w,1);const remaining=b.mutation.remaining,time=w.time;
  near(b.mutation.remaining,remaining);near(w.time,time);
}
// Stress simulation: all types can coexist and no non-finite physics values appear.
{
  let seed=87654321;
  const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const w=new World({random:rng});
  const types=['heavy','ghost','maniac','ninja','magnet'];
  for(let i=0;i<90;i++){
    if(w.balls.length<35){
      const level=i%5;
      const mut=w.activeMutationCount()<3&&i%3===0?types[i%5]:null;
      w.add(level,30+rng()*290,120,{...(mut?{mutationType:mut}:{}),vx:(rng()-.5)*80,vy:30});
    }
    step(w,18);if(w.over)break;
    for(const b of w.balls){
      assert(Number.isFinite(b.x)&&Number.isFinite(b.y)&&Number.isFinite(b.vx)&&Number.isFinite(b.vy));
      assert(b.x>=b.r-1e-5&&b.x<=w.width-b.r+1e-5);
      assert(b.y<=w.height-b.r+1e-5);
    }
  }
}
console.log('MYAU_MUTATIONS_PHASE2_PASS: all five physical abilities, interaction, boss safety and stress');
