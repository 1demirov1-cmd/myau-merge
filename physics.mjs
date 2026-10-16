export const RADII = [18,25,33,42,53,61,72,84,98];
export const RATES = [1.55,1.30,1.08,.90,.74,.61,.50,.40,.26];
export class World {
  constructor({width=360,height=650,gravity=1050}={}){Object.assign(this,{width,height,gravity,balls:[],score:0,time:0,nextId:1,danger:0,over:false,won:false,events:[]});}
  add(level,x,y,extra={}){const r=RADII[level];const b={id:this.nextId++,level,r,x,y,vx:0,vy:0,angle:0,spin:0,born:this.time,lock:0,...extra};this.balls.push(b);return b;}
  step(dt){
    if(this.over||this.won)return;
    this.time+=dt;const damping=Math.pow(.996,dt*120);
    for(const b of this.balls){b.vy=Math.min(b.vy+this.gravity*dt,1400);b.vx*=damping;b.x+=b.vx*dt;b.y+=b.vy*dt;b.angle+=b.spin*dt;b.spin*=.99;}
    for(let pass=0;pass<7;pass++){
      let merged=false;
      for(let i=0;i<this.balls.length;i++){
        const a=this.balls[i];
        for(let j=i+1;j<this.balls.length;j++){
          const b=this.balls[j];let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);const min=a.r+b.r;
          if(d>min+.2)continue;
          if(a.level===b.level&&this.time>=a.lock&&this.time>=b.lock){
            const x=(a.x+b.x)/2,y=(a.y+b.y)/2,level=a.level+1;
            this.balls.splice(j,1);this.balls.splice(i,1);
            if(level===RADII.length){this.won=true;this.score+=2048;this.events.push({type:'win',x,y,level:level-1});return;}
            const r=RADII[level];this.add(level,Math.max(r,Math.min(this.width-r,x)),Math.min(this.height-r,y),{vx:(a.vx+b.vx)*.2,vy:Math.min(0,(a.vy+b.vy)*.15)-30,spin:(a.vx-b.vx)*.001,lock:this.time+.12});
            const points=2**(level+1);this.score+=points;this.events.push({type:'merge',x,y,level,points});merged=true;break;
          }
          if(d<.001){dx=.01;dy=0;d=.01;}
          const nx=dx/d,ny=dy/d,ia=1/(a.r*a.r),ib=1/(b.r*b.r),sum=ia+ib;
          const correction=Math.max(0,min-d-.02)*.85/sum;
          a.x-=nx*correction*ia;a.y-=ny*correction*ia;b.x+=nx*correction*ib;b.y+=ny*correction*ib;
          const rvx=b.vx-a.vx,rvy=b.vy-a.vy,normal=rvx*nx+rvy*ny;
          if(normal<0){const e=Math.abs(normal)>100?.17:0;const impulse=-(1+e)*normal/sum;a.vx-=impulse*nx*ia;a.vy-=impulse*ny*ia;b.vx+=impulse*nx*ib;b.vy+=impulse*ny*ib;
            const t=(-rvx*ny+rvy*nx)*.035/sum;a.vx+=-ny*t*ia;a.vy+=nx*t*ia;b.vx-=-ny*t*ib;b.vy-=nx*t*ib;
            a.spin=Math.max(-1.4,Math.min(1.4,a.vx*.012));b.spin=Math.max(-1.4,Math.min(1.4,b.vx*.012));
          }
        }
        if(merged)break;
      }
      for(const b of this.balls){if(b.x<b.r){b.x=b.r;b.vx=Math.abs(b.vx)*.25;}if(b.x>this.width-b.r){b.x=this.width-b.r;b.vx=-Math.abs(b.vx)*.25;}if(b.y>this.height-b.r){b.y=this.height-b.r;b.vy=b.vy>70?-b.vy*.12:0;b.vx*=.98;b.spin*=.94;}}
    }
    const crowded=this.balls.some(b=>this.time-b.born>1.8&&b.y-b.r<105&&Math.abs(b.vy)<45);
    this.danger=crowded?this.danger+dt:Math.max(0,this.danger-dt*2);
    if(this.danger>2){this.over=true;this.events.push({type:'over'});}
  }
}
