import assert from 'node:assert/strict';
import {World,RADII} from './physics.mjs';
const DT=1/120;
function run(type, makeWorld, seconds=4) {
 const w=new World({random:()=>.75});
 const ball=makeWorld(w,type);
 const events=[];let peakUp=0, peakRight=ball.x, minX=ball.x;
 for(let i=0;i<seconds/DT;i++){
  w.step(DT);
  events.push(...w.events.filter(e=>e.type==='mutation').map(e=>({...e,time:w.time})));
  w.events.length=0;
  if(w.balls.includes(ball)) {
   peakUp=Math.min(peakUp,ball.vy);
   peakRight=Math.max(peakRight,ball.x);
   minX=Math.min(minX,ball.x);
  }
  if(w.over)break;
 }
 return {w,ball,events,peakUp,minX,peakRight};
}
{
 const s=run('spring',(w,type)=>w.add(0,180,43,{mutationType:type}));
 assert(s.events.some(e=>e.mutation==='spring'&&e.stage==='burst'),'Spring did not burst');
 assert(s.peakUp < -150,'Spring did not visibly bounce: '+s.peakUp);
 console.log('SPRING_REAL_DROP_PASS',s.peakUp.toFixed(1));
}
{
 const n=run('ninja',(w,type)=>w.add(0,180,43,{mutationType:type}));
 assert(n.events.some(e=>e.mutation==='ninja'&&e.stage==='jump'),'Ninja did not jump');
 assert(n.peakUp < -300,'Ninja jump was not visible: '+n.peakUp);
 console.log('NINJA_REAL_DROP_PASS',n.peakUp.toFixed(1),Math.round(n.minX));
}
{
 const m=run('magnet',(w,type)=>{
  const source=w.add(1,150,43,{mutationType:type});
  w.add(1,230,625);
  return source;
 });
 assert(m.events.some(e=>e.mutation==='magnet'&&e.stage==='start'),'Magnet did not activate');
 assert(m.w.events.some(e=>e.type==='merge')||m.w.balls.length===1,'Magnet did not pull same-level target into a merge');
 console.log('MAGNET_REAL_DROP_PASS',m.w.balls.length,m.events.length);
}
{
 const w=new World();
 const spring=w.add(0,140,180,{mutationType:'spring'});
 const peer=w.add(0,140,180);
 w.step(DT);
 assert(w.events.some(e=>e.mutation==='spring'&&e.stage==='burst'),'Spring vanished upon same-level merge');
 assert.equal(w.balls.length,1);
 console.log('SPRING_MERGE_PASS');
}
console.log('REAL_DROPS_MUTATIONS_PASS');
