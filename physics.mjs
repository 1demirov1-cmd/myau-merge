import {createMutationState, countActiveMutations, isMutationLevel, MAX_ACTIVE_MUTATIONS, spendMutation} from './mutations.mjs?v=5';
import {startMutationTick, finishMutationTick, registerImpact, registerTouchdown, isPhased, inverseMass} from './mutation_effects.mjs?v=7';
export const RADII = [18,25,33,42,53,61,72,84,98];
export const RATES = [1.55,1.30,1.08,.90,.74,.61,.50,.40,.26];
export class World {
  constructor({width=360,height=650,gravity=1050,random=Math.random}={}){Object.assign(this,{width,height,gravity,random,balls:[],score:0,time:0,nextId:1,danger:0,over:false,won:false,events:[],bossProduced:0,murUntil:0,bond:null});}
  add(level,x,y,extra={}){
    const {mutationType, ...ballExtra}=extra;
    const mutation=mutationType != null ? createMutationState(mutationType) : null;
    if(mutation){
      if(!isMutationLevel(level)) throw new RangeError('Mutations are limited to levels 1–5');
      if(countActiveMutations(this.balls)>=MAX_ACTIVE_MUTATIONS) throw new Error('Active mutation limit exceeded');
    }
    const r=RADII[level];
    const b={id:this.nextId++,level,r,x,y,vx:0,vy:0,angle:0,spin:0,born:this.time,lock:0,...ballExtra};
    if(mutation) b.mutation=mutation;
    this.balls.push(b);
    return b;
  }
  activeMutationCount(){return countActiveMutations(this.balls);}
  pair(){
    const a=this.balls.find(b=>b.level===8&&b.kind==='kamilla');
    const b=this.balls.find(b=>b.level===8&&b.kind==='demir');
    return a&&b?[a,b]:null;
  }
  step(dt){
    if(this.over||this.won)return;
    this.time+=dt;
    if(this.bond){
      this.bond.elapsed+=dt;
      const a=this.balls.find(b=>b.id===this.bond.a),b=this.balls.find(b=>b.id===this.bond.b);
      if(a&&b){
        const x=(a.x+b.x)/2,y=(a.y+b.y)/2;
        const p=Math.min(1,this.bond.elapsed/1.5),offset=(a.r+b.r)*(.5-.35*p)/2;
        const dx=b.x-a.x,dy=b.y-a.y,d=Math.max(1,Math.hypot(dx,dy));
        a.x=x-offset*dx/d;b.x=x+offset*dx/d;
        a.y=y-offset*dy/d;b.y=y+offset*dy/d;
        a.vx=a.vy=b.vx=b.vy=0;
      }
      if(this.bond.elapsed>=1.5){
        this.won=true;this.score+=4096;
        this.events.push({type:'win',x:this.bond.x,y:this.bond.y,level:8,points:4096});
      }
      return;
    }
    const duo=this.pair();
    if(duo&&this.time<this.murUntil){
      const [a,b]=duo,dx=b.x-a.x,dy=b.y-a.y,d=Math.max(1,Math.hypot(dx,dy));
      const impulse=480*dt,ux=dx/d,uy=dy/d;
      a.vx=Math.max(-255,Math.min(255,a.vx+ux*impulse));
      b.vx=Math.max(-255,Math.min(255,b.vx-ux*impulse));
      a.vy=Math.max(-320,Math.min(320,a.vy+uy*impulse));
      b.vy=Math.max(-320,Math.min(320,b.vy-uy*impulse));
    }
    startMutationTick(this,dt);
    const damping=Math.pow(.996,dt*120);
    for(const b of this.balls){b.vy=Math.min(b.vy+this.gravity*dt,1400);b.vx*=damping;b.x+=b.vx*dt;b.y+=b.vy*dt;b.angle+=b.spin*dt;b.spin*=.99;}
    for(let pass=0;pass<7;pass++){
      let merged=false;
      for(let i=0;i<this.balls.length;i++){
        const a=this.balls[i];
        for(let j=i+1;j<this.balls.length;j++){
          const b=this.balls[j];let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);const min=a.r+b.r;
          if(d>min+.2 || isPhased(a) || isPhased(b))continue;
          if(dy>0 && a.vy>=b.vy-20)registerTouchdown(this,a);
          if(dy<0 && b.vy>=a.vy-20)registerTouchdown(this,b);
          if(a.level===8&&b.level===8&&a.kind!==b.kind&&
             ['kamilla','demir'].includes(a.kind)&&['kamilla','demir'].includes(b.kind)&&
             this.time>=a.lock&&this.time>=b.lock){
            this.bond={a:a.id,b:b.id,x:(a.x+b.x)/2,y:(a.y+b.y)/2,elapsed:0};
            this.murUntil=0;this.danger=0;this.events.push({type:'bond',x:this.bond.x,y:this.bond.y});
            return;
          }
          if(a.level===b.level&&a.level<8&&this.time>=a.lock&&this.time>=b.lock){
            const x=(a.x+b.x)/2,y=(a.y+b.y)/2,level=a.level+1;
            this.balls.splice(j,1);this.balls.splice(i,1);
            const points=2**(level+1);this.score+=points;
            if(level===8){
              this.bossProduced++;
              if(this.bossProduced<=2){
                const kind=this.bossProduced===1?'kamilla':'demir',r=RADII[level];
                this.add(level,Math.max(r,Math.min(this.width-r,x)),Math.min(this.height-r,y),{kind,lock:this.time+.12});
                this.events.push({type:'merge',x,y,level,points,kind});
              }else{
                this.murUntil=this.time+6;this.danger=0;
                this.events.push({type:'mur',x,y,level,points,duration:6});
              }
            }else{
              const r=RADII[level];
              this.add(level,Math.max(r,Math.min(this.width-r,x)),Math.min(this.height-r,y),
                {vx:(a.vx+b.vx)*.2,vy:Math.min(0,(a.vy+b.vy)*.15)-30,spin:(a.vx-b.vx)*.001,lock:this.time+.12});
              this.events.push({type:'merge',x,y,level,points});
            }
            merged=true;break;
          }
          // The maniac removes one different-level cat it lands on.
          // Same-level merging already took priority; bosses are immune.
          const fromAbove=Math.max(3,min*.18);
          const attackerA=dy>fromAbove && a.level!==b.level && a.mutation?.type==='maniac' &&
            a.mutation.phase==='armed' && a.vy>=b.vy-25;
          const attackerB=dy<-fromAbove && a.level!==b.level && b.mutation?.type==='maniac' &&
            b.mutation.phase==='armed' && b.vy>=a.vy-25;
          const killer=attackerA?a:attackerB?b:null;
          if(killer){
            const victim=killer===a?b:a;
            if(victim.level<8){
              killer.mutation=spendMutation(killer.mutation);
              this.balls.splice(this.balls.indexOf(victim),1);
              this.events.push({type:'mutation',mutation:'maniac',stage:'remove',
                id:killer.id,targetId:victim.id,x:victim.x,y:victim.y,r:victim.r});
              merged=true;break;
            }
          }
          if(d<.001){dx=.01;dy=0;d=.01;}
          const nx=dx/d,ny=dy/d,ia=inverseMass(a),ib=inverseMass(b),sum=ia+ib;
          const capped=(a.materializeUntil>this.time||b.materializeUntil>this.time);
          const correction=Math.min(Math.max(0,min-d-.02)*.85,capped?4:Infinity)/sum;
          a.x-=nx*correction*ia;a.y-=ny*correction*ia;b.x+=nx*correction*ib;b.y+=ny*correction*ib;
          const rvx=b.vx-a.vx,rvy=b.vy-a.vy,normal=rvx*nx+rvy*ny;
          if(normal<0){registerImpact(this,a,-normal);registerImpact(this,b,-normal);const e=Math.abs(normal)>100?.17:0;const impulse=-(1+e)*normal/sum;a.vx-=impulse*nx*ia;a.vy-=impulse*ny*ia;b.vx+=impulse*nx*ib;b.vy+=impulse*ny*ib;
            const t=(-rvx*ny+rvy*nx)*.035/sum;a.vx+=-ny*t*ia;a.vy+=nx*t*ia;b.vx-=-ny*t*ib;b.vy-=nx*t*ib;
            a.spin=Math.max(-1.4,Math.min(1.4,a.vx*.012));b.spin=Math.max(-1.4,Math.min(1.4,b.vx*.012));
          }
        }
        if(merged)break;
      }
      for(const b of this.balls){if(b.x<b.r){registerImpact(this,b,Math.max(0,-b.vx));b.x=b.r;b.vx=Math.abs(b.vx)*.25;}if(b.x>this.width-b.r){registerImpact(this,b,Math.max(0,b.vx));b.x=this.width-b.r;b.vx=-Math.abs(b.vx)*.25;}if(b.y>this.height-b.r){registerTouchdown(this,b);registerImpact(this,b,Math.max(0,b.vy));b.y=this.height-b.r;b.vy=b.vy>70?-b.vy*.12:0;b.vx*=.98;b.spin*=.94;}}
    }
    finishMutationTick(this,dt);
    const crowded=this.balls.some(b=>this.time-b.born>2.5&&b.y-b.r<86);
    this.danger=crowded?this.danger+dt:Math.max(0,this.danger-dt*2);
    if(this.danger>2){this.over=true;this.events.push({type:'over'});}
  }
}
