// One-time physical shake. Collisions and merges remain exclusively in World.step().
export function shakeBalls(world,random=Math.random){
 if(!world||world.bond||world.over||world.won||
    !Array.isArray(world.balls)||world.balls.length===0)return 0;
 const rand=()=>{
  const n=Number(random());
  return Number.isFinite(n)?Math.max(0,Math.min(.999999,n)):.5;
 };
 const mid=world.width/2;
 for(let i=0;i<world.balls.length;i++){
  const b=world.balls[i];
  const direction=i%2===0?1:-1;
  // Give the pile a sideways jolt and a short lift. No levels, radii,
  // positions, scores or special-cat abilities are changed here.
  const sideways=direction*(135+rand()*160)+(mid-b.x)*.14;
  b.vx=Math.max(-350,Math.min(350,b.vx*.25+sideways));
  b.vy=Math.max(-460,Math.min(-140,b.vy*.18-(240+rand()*160)));
  b.spin=Math.max(-1.6,Math.min(1.6,(rand()-.5)*2.5));
 }
 world.danger=Math.max(0,world.danger-.65);
 return world.balls.length;
}
