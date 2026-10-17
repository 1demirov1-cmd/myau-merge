import {World,RADII,RATES} from './physics.mjs?v=3';
const $=s=>document.querySelector(s), canvas=$('#game'), ctx=canvas.getContext('2d');
const NAMES=['Крошка','Бананчик','Серьёзный','Улыбашка','Батя','Гига-кот','Мегачад','Абсолют','Демирчад'];
const BOSS_LEVEL=NAMES.length-1;
const COLORS=['#d8c5fa','#ffe196','#aeb4ef','#ffbdab','#f2ce72','#cdbfff','#bce6b8','#fff0a7','#ffc47d'];
const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
let best=Math.max(0,Number(read('meow-best',0))||0), soundEnabled=read('meow-sound',true)!==false;
let world=new World(), state='intro', aim=180, current=0, next=0, highest=0, lastDrop=-10, dragging=false, activePointer=null, helpRemaining=3, helpMode=false;
let particles=[],rings=[],points=[],lastTime=0,accumulator=0,shake=0,lastScore=-1,toastTimer,seenMerge=false,finalClock=0,winCats=[],pausedFrom='playing';
const coupleArt=new Image();coupleArt.src='assets/mur-pair.webp';
const sprites=[],rawImages=[],W=360,H=650;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const audioBytes=fetch('./assets/meow.wav').then(r=>{if(!r.ok)throw new Error('audio');return r.arrayBuffer()}).catch(()=>null);
let audioCtx,buffer,master,loadingAudio,voices=[];
function unlockAudio(){
  try{
    if(!audioCtx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return Promise.resolve();audioCtx=new AC();master=audioCtx.createGain();master.gain.value=.65;const limiter=audioCtx.createDynamicsCompressor();limiter.threshold.value=-14;limiter.knee.value=10;limiter.ratio.value=5;master.connect(limiter);limiter.connect(audioCtx.destination);}
    if(audioCtx.state!=='running')audioCtx.resume().catch(()=>{});
    if(!loadingAudio)loadingAudio=audioBytes.then(data=>data?audioCtx.decodeAudioData(data.slice(0)):null).then(b=>{buffer=b}).catch(()=>{});
    return loadingAudio;
  }catch{return Promise.resolve()}
}
function meow(level,quiet=false){
  if(!soundEnabled||!audioCtx||audioCtx.state!=='running')return;
  const t=audioCtx.currentTime;
  if(buffer){
    while(voices.length>=3){const v=voices.shift();try{v.g.gain.cancelScheduledValues(t);v.g.gain.setTargetAtTime(.001,t,.02);v.s.stop(t+.09)}catch{}}
    const s=audioCtx.createBufferSource(),g=audioCtx.createGain();s.buffer=buffer;s.playbackRate.value=RATES[level];g.gain.value=quiet?.48:.95;const effects=[];
    if(level===BOSS_LEVEL){
      const grit=audioCtx.createWaveShaper(),low=audioCtx.createBiquadFilter();const curve=new Float32Array(512);
      for(let i=0;i<curve.length;i++){const x=i*2/(curve.length-1)-1;curve[i]=Math.tanh(x*2.8)/Math.tanh(2.8);}
      grit.curve=curve;grit.oversample='2x';low.type='lowpass';low.frequency.value=1300;low.Q.value=.7;
      s.connect(grit);grit.connect(low);low.connect(g);effects.push(grit,low);g.gain.value=quiet?.38:.70;
    }else s.connect(g);
    g.connect(master);s.start();const v={s,g};voices.push(v);s.onended=()=>{voices=voices.filter(x=>x!==v);s.disconnect();g.disconnect();effects.forEach(n=>n.disconnect());};
  }else{
    // Offline/decoder fallback: a short two-formant meow, shifted with the same rates.
    const duration=.65/RATES[level],o=audioCtx.createOscillator(),f=audioCtx.createBiquadFilter(),g=audioCtx.createGain();o.type='sawtooth';o.frequency.setValueAtTime(440*RATES[level],t);o.frequency.exponentialRampToValueAtTime(630*RATES[level],t+duration*.22);o.frequency.exponentialRampToValueAtTime(220*RATES[level],t+duration);f.type='bandpass';f.Q.value=2;f.frequency.setValueAtTime(1300*RATES[level],t);f.frequency.exponentialRampToValueAtTime(650*RATES[level],t+duration);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.15,t+.04);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(f);f.connect(g);g.connect(master);o.start(t);o.stop(t+duration);
  }
}
function hush(){for(const v of voices){try{v.s.stop()}catch{}}voices=[];}
function updateSound(){const b=$('#sound');b.textContent=soundEnabled?'♪':'♩';b.setAttribute('aria-label',soundEnabled?'Выключить звук':'Включить звук');b.style.opacity=soundEnabled?'1':'.45';}
updateSound();$('#best').textContent=best;
function refreshHelp(){
 const b=$('#paw');b.disabled=helpRemaining<=0||state!=='playing'||!!world.bond;
 b.setAttribute('aria-pressed',helpMode?'true':'false');
 b.setAttribute('aria-label','Лапа помощи: осталось '+helpRemaining);
 $('#paw-count').textContent=helpRemaining;
}
function chooseHelpCat(clientX,clientY){
 const rect=canvas.getBoundingClientRect(),x=(clientX-rect.left)/rect.width*W,y=(clientY-rect.top)/rect.height*H;
 let chosen=null,dist=Infinity;
 for(const ball of world.balls){if(ball.level===BOSS_LEVEL)continue;const d=Math.hypot(x-ball.x,y-ball.y);if(d<=ball.r+5&&d<dist){chosen=ball;dist=d;}}
 if(!chosen){toast('Финальных чадов Лапой не убрать');return;}
 world.balls.splice(world.balls.indexOf(chosen),1);
 helpRemaining--;helpMode=false;refreshHelp();world.danger=0;
 toast('Кот убран · лап осталось: '+helpRemaining);
 $('#hint').innerHTML='<span class="hint-dot"></span> Веди пальцем и отпусти кота';
}
$('#paw').onclick=()=>{
 if(state!=='playing'||helpRemaining<=0)return;
 helpMode=!helpMode;refreshHelp();
 toast(helpMode?'🐾 Выбери кота на поле':'Лапа отменена');
 $('#hint').innerHTML=helpMode?'<span class="hint-dot"></span> 🐾 Коснись кота, которого хочешь убрать':'<span class="hint-dot"></span> Веди пальцем и отпусти кота';
};

function loadSprite(i){return new Promise(resolve=>{const im=new Image();rawImages[i]=im;im.onload=()=>{
  const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0);
  // Chroma-key the black source background at render time; source textures stay intact.
  if(i!==BOSS_LEVEL){const d=g.getImageData(0,0,c.width,c.height);
  for(let p=0;p<d.data.length;p+=4){const value=Math.max(d.data[p],d.data[p+1],d.data[p+2]);d.data[p+3]=Math.min(255,Math.max(0,(value-12)*12));}
  g.putImageData(d,0,0);}sprites[i]=c;resolve(c);
};im.onerror=()=>resolve(null);im.src=i===9?'assets/cat-9.webp':i===BOSS_LEVEL?'assets/cat-8.png':`assets/cat-${i}.webp`;});}
const assets=Promise.all([...NAMES.map((_,i)=>loadSprite(i)),loadSprite(9)]);
function drawCat(level,x,y,r,angle=0,alpha=1,glow=false,kind=null){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalAlpha=alpha;
  const color=level===BOSS_LEVEL&&kind==='kamilla'?'#ffb5de':COLORS[level];ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);const grad=ctx.createRadialGradient(-r*.25,-r*.35,1,0,0,r);grad.addColorStop(0,`${color}28`);grad.addColorStop(1,`${color}0a`);ctx.fillStyle=grad;ctx.fill();ctx.strokeStyle=`${color}65`;ctx.lineWidth=1;ctx.stroke();
  if(glow&&!reduced){ctx.shadowColor=color;ctx.shadowBlur=14;ctx.stroke();ctx.shadowBlur=0;}
  const spriteIndex=level===BOSS_LEVEL&&kind==='kamilla'?9:level;
  if(sprites[spriteIndex]){const im=sprites[spriteIndex];ctx.beginPath();ctx.arc(0,0,r-.5,0,Math.PI*2);ctx.clip();const scale=Math.min(r*1.82/im.width,r*1.92/im.height);ctx.drawImage(im,-im.width*scale/2,-im.height*scale/2+1,im.width*scale,im.height*scale);}else{ctx.fillStyle=color;ctx.font=`${r*1.4}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('🐱',0,0);}
  ctx.restore();
}
function rebuildTrack(){
  const track=$('#cats');track.replaceChildren();
  NAMES.forEach((name,i)=>{
    const secret=i===BOSS_LEVEL,label=secret?'Секретный босс':name;
    const b=document.createElement('button');b.className='cat-button'+(i===highest?' active':'')+(secret?' secret-cat':'');
    b.title=`${label} — послушать мяу`;b.setAttribute('aria-label',`${label}: послушать мяу, уровень ${i+1}`);
    if(secret){const mark=document.createElement('span');mark.className='secret-mark';mark.textContent='?';mark.setAttribute('aria-hidden','true');b.append(mark);}
    else{const img=document.createElement('img');img.src=sprites[i]?sprites[i].toDataURL('image/png'):`assets/cat-${i}.webp`;img.alt='';b.append(img);}
    b.addEventListener('click',()=>{soundEnabled=true;save('meow-sound',true);updateSound();unlockAudio().then(()=>{hush();meow(i);});toast(`${secret?'???':name} · ${i+1}/${NAMES.length}`);});
    track.append(b);
  });
}
rebuildTrack();assets.then(()=>{rebuildTrack();updateNext();});
function randomLevel(){const x=Math.random();return x<.55?0:x<.89?1:2;}
function updateNext(){$('#next-cat').src=sprites[next]?sprites[next].toDataURL('image/png'):`assets/cat-${next}.webp`;$('#next-cat').alt=`Следующий: ${NAMES[next]}`;}
function updateHUD(){if(lastScore!==world.score){lastScore=world.score;$('#score').textContent=world.score;if(world.score>best){best=world.score;$('#best').textContent=best;save('meow-best',best);}}}
function setHighest(level){if(level<=highest)return;highest=level;$('#level-label').textContent=`${highest+1} / ${NAMES.length}`;document.querySelectorAll('.cat-button').forEach((b,i)=>b.classList.toggle('active',i===highest));toast(`${NAMES[level]}! Мяу ещё ниже ↓`);}
function toast(text){const el=$('#toast');el.textContent=text;el.classList.remove('show');void el.offsetWidth;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),1900);}
function start(){world=new World();state='playing';finalClock=0;winCats=[];pausedFrom='playing';helpRemaining=3;helpMode=false;refreshHelp();current=0;next=0;highest=0;aim=180;lastDrop=-10;particles=[];rings=[];points=[];seenMerge=false;accumulator=0;lastTime=0;lastScore=-1;$('#overlay').hidden=true;$('#level-label').textContent=`1 / ${NAMES.length}`;$('#hint').innerHTML='<span class="hint-dot"></span> Веди пальцем и отпусти кота';rebuildTrack();updateNext();updateHUD();unlockAudio();}
$('#start').addEventListener('click',start);
function showOverlay(html){helpMode=false;refreshHelp();$('#overlay-content').innerHTML=html;$('#overlay').hidden=false;dragging=false;activePointer=null;}
function pause(){if(state!=='playing'&&state!=='finale')return;pausedFrom=state;state='paused';hush();showOverlay('<span class="pill">КОТЫ ОТДЫХАЮТ</span><img class="end-cat" src="assets/cat-3.webp" alt="Кот отдыхает"><h2>Мяу-пауза</h2><p>Все коты на своих местах.</p><button class="primary" id="resume">Продолжить ↗</button>');$('#resume').onclick=resume;}
function resume(){state=pausedFrom;helpMode=false;refreshHelp();$('#overlay').hidden=true;accumulator=0;lastTime=0;unlockAudio();}
$('#pause').onclick=()=>{if(state==='playing'||state==='finale')pause();else if(state==='paused')resume();};
$('#restart').onclick=()=>{if(state==='intro')return;const previous=state,previousRunning=state==='paused'?pausedFrom:state;state='confirm';hush();showOverlay('<span class="pill">НОВАЯ ПОПЫТКА</span><h2 style="margin-top:24px">Начать сначала?</h2><p>Текущие коты исчезнут.<br>Рекорд останется.</p><button class="primary" id="confirm-restart">Новая игра ↻</button><button class="secondary" id="cancel-restart">Вернуться</button>');$('#confirm-restart').onclick=start;$('#cancel-restart').onclick=()=>{if(previous==='over'||previous==='won'){state=previous;endScreen(previous==='won')}else{pausedFrom=previousRunning;resume();}};};
$('#sound').onclick=()=>{soundEnabled=!soundEnabled;save('meow-sound',soundEnabled);updateSound();if(soundEnabled)unlockAudio().then(()=>meow(current,true));else hush();};
function endScreen(won){
  state=won?'won':'over';
  showOverlay(won
    ? `<div class="boss-end"><span class="pill">СЕМЕЙНОЕ СЛИЯНИЕ</span><img class="boss-portrait mur-couple" src="assets/mur-pair.webp" alt="Камиллкачад и Демирчад вместе"><h2>АБСОЛЮТНЫЙ МУР</h2><div class="end-score">${world.score}</div><p>КАМИЛЛКАЧАД + ДЕМИРЧАД = МЯУ НАВСЕГДА!<br>Рекорд: ${best}</p><button class="primary" id="play-again">Ещё раз <span>↻</span></button></div>`
    : `<span class="pill">КОТОВ СЛИШКОМ МНОГО</span><div class="end-score">${world.score}</div><h2>Кошачий переполох.</h2><p>Твой кот: ${NAMES[highest]} · Рекорд: ${best}<br>Ещё одна попытка — ещё ниже мяу.</p><button class="primary" id="play-again">Ещё раз <span>↻</span></button>`);
  $('#play-again').onclick=start;
}
function drop(){
  if(state!=='playing'||world.bond||world.time-lastDrop<.48)return;
  const r=RADII[current],x=Math.max(r+2,Math.min(W-r-2,aim));world.add(current,x,43,{angle:(Math.random()-.5)*.12});lastDrop=world.time;meow(current,true);current=next;next=randomLevel();aim=Math.max(RADII[current]+2,Math.min(W-RADII[current]-2,aim));updateNext();
}
function aimAt(clientX){const r=canvas.getBoundingClientRect();aim=Math.max(RADII[current]+2,Math.min(W-RADII[current]-2,(clientX-r.left)/r.width*W));}
canvas.addEventListener('pointerdown',e=>{if(state!=='playing'||world.bond||activePointer!==null||!e.isPrimary)return;e.preventDefault();if(helpMode){chooseHelpCat(e.clientX,e.clientY);return;}activePointer=e.pointerId;dragging=true;aimAt(e.clientX);canvas.setPointerCapture(e.pointerId);unlockAudio();});
canvas.addEventListener('pointermove',e=>{if(state==='playing'&&(activePointer===e.pointerId||e.pointerType==='mouse'))aimAt(e.clientX);});
canvas.addEventListener('pointerup',e=>{if(e.pointerId!==activePointer)return;e.preventDefault();aimAt(e.clientX);dragging=false;activePointer=null;drop();});
canvas.addEventListener('pointercancel',()=>{dragging=false;activePointer=null;});
canvas.addEventListener('lostpointercapture',()=>{dragging=false;activePointer=null;});
window.addEventListener('keydown',e=>{if(e.target.closest?.('button,a,input'))return;if(e.key==='Escape'){if(helpMode){helpMode=false;refreshHelp();toast('Лапа отменена');}else if(state==='playing'||state==='finale')pause();else if(state==='paused')resume();}if(state!=='playing')return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();aim=Math.max(RADII[current]+2,Math.min(W-RADII[current]-2,aim+(e.key==='ArrowLeft'?-13:13)));}if(e.code==='Space'&&!e.repeat){e.preventDefault();unlockAudio();drop();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='playing')pause();});
function handleEvents(){for(const e of world.events){if(e.type==='bond'){refreshHelp();toast('ЧАДОСЛИЯНИЕ: 1,5 СЕКУНДЫ');}if(e.type==='mur'){toast('МУР-ИМПУЛЬС!');}if(e.type==='merge'||e.type==='win'||e.type==='mur'){
  meow(e.level);if(e.type==='merge')setHighest(e.level);if(e.kind)toast(e.kind==='kamilla'?'КАМИЛЛКАЧАД!':'ДЕМИРЧАД!');if(!reduced){shake=Math.min(4,1+e.level*.35);rings.push({x:e.x,y:e.y,r:RADII[e.level],life:.7,max:.7,color:COLORS[e.level]});for(let i=0;i<14;i++){const a=Math.random()*Math.PI*2,s=35+Math.random()*90;particles.push({x:e.x,y:e.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.5+Math.random()*.4,color:COLORS[e.level]});}}
  points.push({x:e.x,y:e.y-RADII[e.level],life:1,text:`+${e.points??2048}`});if(!seenMerge){seenMerge=true;$('#hint').innerHTML='<span class="hint-dot"></span> Больше кот → ниже мяу';}
}if(e.type==='over')endScreen(false);
if(e.type==='win'){
 updateHUD();state='finale';finalClock=0;helpMode=false;refreshHelp();
 winCats=world.balls.filter(b=>b.level<BOSS_LEVEL).map((b,i)=>({...b,popAt:.4+i*.15+(i%3)*.11}));
 $('#hint').innerHTML='<span class="hint-dot"></span> АБСОЛЮТНЫЙ МУР';
}
}world.events.length=0;updateHUD();}
function updateFX(dt){particles=particles.filter(p=>(p.life-=dt)>0);for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=120*dt;}rings=rings.filter(p=>(p.life-=dt)>0);points=points.filter(p=>(p.life-=dt)>0);for(const p of points)p.y-=dt*25;shake=Math.max(0,shake-dt*15);}
function draw(){
  const dpr=Math.min(devicePixelRatio||1,2),rect=canvas.getBoundingClientRect(),px=Math.round(rect.width*dpr),py=Math.round(rect.height*dpr);
  if(canvas.width!==px||canvas.height!==py){canvas.width=px;canvas.height=py;}
  ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);ctx.clearRect(0,0,W,H);ctx.save();if(shake&&!reduced)ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);
  const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#17121d');bg.addColorStop(1,'#191622');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#c7acff0b';for(let x=16;x<W;x+=24)for(let y=130;y<H;y+=24){ctx.beginPath();ctx.arc(x,y,.7,0,Math.PI*2);ctx.fill();}
  ctx.save();ctx.setLineDash([4,5]);ctx.strokeStyle=world.danger>0?'#ff8585':'#7e5d9555';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(13,105);ctx.lineTo(W-13,105);ctx.stroke();ctx.restore();ctx.fillStyle=world.danger>0?'#ffaaaa':'#8b6f9b';ctx.font='8px -apple-system, sans-serif';ctx.textAlign='right';ctx.fillText(world.danger>0?`ОСТОРОЖНО · ${Math.max(0,2-world.danger).toFixed(1)} c`:'НЕ ВЫШЕ ЭТОЙ ЛИНИИ',W-13,98);
  if(!world.balls.length&&state==='playing'){ctx.textAlign='center';ctx.fillStyle='#665770';ctx.font='36px -apple-system,sans-serif';ctx.fillText('↓',180,264);ctx.font='12px -apple-system,sans-serif';ctx.fillStyle='#897792';ctx.fillText('Куда посадим первого?',180,295);ctx.font='10px -apple-system,sans-serif';ctx.fillStyle='#655771';ctx.fillText('Коснись поля и отпусти',180,315);}
  const floor=ctx.createLinearGradient(0,0,W,0);floor.addColorStop(0,'#a984ff');floor.addColorStop(.45,'#e7b1d9');floor.addColorStop(1,'#b8e98d');ctx.strokeStyle=floor;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(1,110);ctx.lineTo(1,H-14);ctx.quadraticCurveTo(1,H-1,14,H-1);ctx.lineTo(W-14,H-1);ctx.quadraticCurveTo(W-1,H-1,W-1,H-14);ctx.lineTo(W-1,110);ctx.stroke();
  if(state==='playing'){
    const r=RADII[current],ready=world.time-lastDrop>.48;let target=H-r;
    for(const b of world.balls){const dx=aim-b.x;if(Math.abs(dx)<r+b.r){const y=b.y-Math.sqrt((r+b.r)**2-dx*dx);if(y<target)target=y;}}
    target=Math.max(80,target);ctx.save();ctx.setLineDash([3,6]);ctx.strokeStyle='#c8b0eb40';ctx.beginPath();ctx.moveTo(aim,43+r);ctx.lineTo(aim,target);ctx.stroke();ctx.restore();if(dragging){ctx.strokeStyle='#c8b0eb40';ctx.beginPath();ctx.arc(aim,target,r,0,Math.PI*2);ctx.stroke();}drawCat(current,aim,43,r,0,ready?1:.35,true);
    ctx.fillStyle='#b199c6';ctx.font='7px -apple-system,sans-serif';ctx.textAlign='center';ctx.fillText(ready?'ОТПУСТИ ↓':'…',aim,43+r+14);
  }
  if(state==='finale')drawVictoryHearts();
else for(const b of world.balls){
 const bonded=world.bond&&(b.id===world.bond.a||b.id===world.bond.b);
 drawCat(b.level,b.x,b.y,b.r*(bonded?1+.04*Math.sin(world.bond.elapsed*15):1),b.angle,1,!!bonded,b.kind);
}
  for(const ring of rings){const t=1-ring.life/ring.max;ctx.beginPath();ctx.arc(ring.x,ring.y,ring.r+t*50,0,Math.PI*2);ctx.globalAlpha=(1-t)*.7;ctx.strokeStyle=ring.color;ctx.lineWidth=2-t;ctx.stroke();ctx.globalAlpha=1;}
  for(const p of particles){ctx.globalAlpha=Math.min(1,p.life*2);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,1.7,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
  ctx.font='bold 17px -apple-system,sans-serif';ctx.textAlign='center';for(const p of points){ctx.globalAlpha=Math.min(1,p.life*2);ctx.fillStyle='#e5f9c1';ctx.fillText(p.text,p.x,p.y);}ctx.globalAlpha=1;
  if(world.danger>0){ctx.fillStyle=`rgba(255,100,120,${world.danger*.045})`;ctx.fillRect(0,0,W,110);}
  ctx.restore();
}
function drawHeart(x,y,r,color){
 ctx.save();ctx.translate(x,y);ctx.beginPath();ctx.moveTo(0,r*.78);
 ctx.bezierCurveTo(-r*.38,r*.42,-r*1.13,-r*.04,-r*.94,-r*.54);
 ctx.bezierCurveTo(-r*.78,-r*.98,-r*.22,-r*.98,0,-r*.49);
 ctx.bezierCurveTo(r*.22,-r*.98,r*.78,-r*.98,r*.94,-r*.54);
 ctx.bezierCurveTo(r*1.13,-r*.04,r*.38,r*.42,0,r*.78);
 ctx.closePath();ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=9;ctx.fill();ctx.restore();
}
function drawVictoryHearts(){
 const palette=['#ff8caf','#e2a3ff','#ffce8a','#b1e6ff','#c5ffc0','#ff8696','#cbaaff'];
 for(const b of winCats){
  const elapsed=finalClock-b.popAt;
  if(elapsed<0){drawHeart(b.x,b.y,b.r,palette[b.level%palette.length]);continue;}
  if(elapsed>.7)continue;
  const t=elapsed/.7;ctx.globalAlpha=1-t;
  for(let i=0;i<7;i++){
   const a=i*Math.PI*2/7+b.id;
   drawHeart(b.x+Math.cos(a)*t*b.r*2.2,b.y+Math.sin(a)*t*b.r*2.2,b.r*(1-t)*.30,palette[(b.level+i)%palette.length]);
  }
  ctx.globalAlpha=1;
 }
 const appear=Math.max(0,Math.min(1,(finalClock-.45)/1));
 if(appear&&coupleArt.complete&&coupleArt.naturalWidth){
  const w=245*appear*(1+.02*Math.sin(finalClock*8));
  ctx.save();ctx.globalAlpha=appear;ctx.shadowBlur=35;ctx.shadowColor='#ff76cb';
  ctx.drawImage(coupleArt,(W-w)/2,(H-w)/2,w,w);ctx.restore();
 }
}
function loop(now){const dt=lastTime?Math.min((now-lastTime)/1000,.05):0;lastTime=now;if(state==='playing'){accumulator+=dt;let n=0;while(accumulator>=1/120&&n++<8){world.step(1/120);accumulator-=1/120;handleEvents();if(state!=='playing')break;}updateFX(dt);}if(state==='finale'){finalClock+=dt;updateFX(dt);if(finalClock>=5)endScreen(true);}draw();requestAnimationFrame(loop);}
requestAnimationFrame(loop);
