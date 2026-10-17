export const RADII = [18,25,33,42,53,61,72,84,98];
export const RATES = [1.55,1.30,1.08,.90,.74,.61,.50,.40,.26];
export class World {
  constructor({width=360,height=650,gravity=1050}={}){Object.assign(this,{width,height,gravity,balls:[],score:0,time:0,nextId:1,danger:0,over:false,won:false,events:[],bossProduced:0,murUntil:0,bond:null});}
  add(level,x,y,extra={}){const r=RADII[level];const b={id:this.nextId++,level,r,x,y,vx:0,vy:0,angle:0,spin:0,born:this.time,lock:0,...extra};this.balls.push(b);return b;}
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
    const damping=Math.pow(.996,dt*120);
    for(const b of this.balls){b.vy=Math.min(b.vy+this.gravity*dt,1400);b.vx*=damping;b.x+=b.vx*dt;b.y+=b.vy*dt;b.angle+=b.spin*dt;b.spin*=.99;}
    for(let pass=0;pass<7;pass++){
      let merged=false;
      for(let i=0;i<this.balls.length;i++){
        const a=this.balls[i];
        for(let j=i+1;j<this.balls.length;j++){
          const b=this.balls[j];let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);const min=a.r+b.r;
          if(d>min+.2)continue;
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
