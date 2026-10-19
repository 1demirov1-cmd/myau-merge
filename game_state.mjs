// Portable, validated snapshots for undo and mobile/PWA resume.
export const SAVE_VERSION = 1;
const BALL_FIELDS=['id','level','r','x','y','vx','vy','angle','spin','born','lock','kind','materializeUntil','mutationSettle'];
const WORLD_FIELDS=['width','height','gravity','score','time','nextId','danger','over','won','bossProduced','murUntil','bond'];
const UI_FIELDS=['state','pausedFrom','current','next','currentMutation','nextMutation','throwCount','highest','helpRemaining','aim','lastDrop','seenMerge','finalClock','winCats','announcedMutations'];
const MUT_TYPES=new Set(['ghost','heavy','maniac','spring','ninja','magnet']);
const PHASES=new Set(['armed','active','spent']);
const validNumber=v=>typeof v==='number'&&Number.isFinite(v);
const copy=(obj,fields)=>Object.fromEntries(fields.filter(k=>Object.hasOwn(obj,k)).map(k=>[k,obj[k]]));

export function captureSnapshot(world,ui,rngState) {
  if(!world||!Array.isArray(world.balls))throw new TypeError('Invalid world');
  const balls=world.balls.map(b=>{
    const item=copy(b,BALL_FIELDS);
    if(b.mutation)item.mutation=copy(b.mutation,['type','phase','remaining']);
    return item;
  });
  return {version:SAVE_VERSION,world:{...copy(world,WORLD_FIELDS),balls},ui:copy(ui,UI_FIELDS),rngState};
}
function checkBall(b,idSet){
  if(!b||typeof b!=='object'||!Number.isSafeInteger(b.id)||b.id<1||idSet.has(b.id)||
    !Number.isInteger(b.level)||b.level<0||b.level>8)return false;
  idSet.add(b.id);
  for(const f of ['r','x','y','vx','vy','angle','spin','born','lock']){
    if(!validNumber(b[f]))return false;
  }
  if(b.r<=0||b.r>150||Math.abs(b.x)>1e5||Math.abs(b.y)>1e5||Math.abs(b.vx)>1e5||Math.abs(b.vy)>1e5)return false;
  if(b.kind!==undefined&&!['kamilla','demir'].includes(b.kind))return false;
  if(b.kind!==undefined&&b.level!==8)return false;
  if(b.materializeUntil!==undefined&&!validNumber(b.materializeUntil))return false;
  if(b.mutationSettle!==undefined&&!validNumber(b.mutationSettle))return false;
  if(b.mutation){
    const m=b.mutation;
    if(b.level>4||!MUT_TYPES.has(m.type)||!PHASES.has(m.phase)||
      !(m.remaining===null||(validNumber(m.remaining)&&m.remaining>=0&&m.remaining<=20)))return false;
  }
  return true;
}
export function restoreSnapshot(snapshot,makeWorld) {
  if(!snapshot||snapshot.version!==SAVE_VERSION||!snapshot.world||!snapshot.ui||
    !Array.isArray(snapshot.world.balls)||snapshot.world.balls.length>256||
    typeof makeWorld!=='function')return null;
  const w=snapshot.world,u=snapshot.ui;
  const numericWorld=['width','height','gravity','score','time','nextId','danger','bossProduced','murUntil'];
  if(numericWorld.some(k=>!validNumber(w[k]))||w.width<200||w.width>1200||
    w.height<300||w.height>1400||w.time<0||w.nextId<1||
    !Number.isSafeInteger(w.nextId)||w.score<0||w.score>1e12||
    w.danger<0||w.bossProduced<0||w.bossProduced>1e6||
    typeof w.over!=='boolean'||typeof w.won!=='boolean')return null;
  const ids=new Set();
  if(w.balls.some(b=>!checkBall(b,ids))||[...ids].some(id=>id>=w.nextId))return null;
  if(w.balls.filter(b=>b.mutation&&b.mutation.phase!=='spent').length>3)return null;
  if(w.bond!==null&&(!w.bond||!ids.has(w.bond.a)||!ids.has(w.bond.b)||
    !validNumber(w.bond.x)||!validNumber(w.bond.y)||!validNumber(w.bond.elapsed)))return null;
  if(!['playing','paused','finale'].includes(u.state)||
    !['playing','finale'].includes(u.pausedFrom)||
    !Number.isInteger(u.current)||u.current<0||u.current>2||
    !Number.isInteger(u.next)||u.next<0||u.next>2||
    !Number.isInteger(u.throwCount)||u.throwCount<0||
    !Number.isInteger(u.highest)||u.highest<0||u.highest>8||
    !Number.isInteger(u.helpRemaining)||u.helpRemaining<0||u.helpRemaining>3||
    !validNumber(u.aim)||!validNumber(u.lastDrop)||
    typeof u.seenMerge!=='boolean'||!validNumber(u.finalClock)||
    !Array.isArray(u.winCats)||u.winCats.length>256||
    (u.announcedMutations!==undefined &&
      (!Array.isArray(u.announcedMutations)||u.announcedMutations.length>6||
       u.announcedMutations.some(type=>!MUT_TYPES.has(type))))||
    !Number.isInteger(snapshot.rngState)||snapshot.rngState<0||snapshot.rngState>0xffffffff)return null;
  for(const k of ['currentMutation','nextMutation']){
    if(u[k]!==null&&!MUT_TYPES.has(u[k]))return null;
  }
  const world=makeWorld();
  Object.assign(world,copy(w,WORLD_FIELDS));
  world.balls=w.balls.map(b=>({...copy(b,BALL_FIELDS),
    ...(b.mutation?{mutation:copy(b.mutation,['type','phase','remaining'])}:{})}));
  world.events=[];world.mutationPulses=[];
  const ui={...copy(u,UI_FIELDS),winCats:u.winCats.map(b=>({...b})),
    announcedMutations:[...(u.announcedMutations??[])]};
  return {world,ui,rngState:snapshot.rngState>>>0};
}
export function encodeSave(snapshot,undo=null) {
  return JSON.stringify({version:SAVE_VERSION,snapshot,undo});
}
export function decodeSave(text,makeWorld) {
  try{
    const value=JSON.parse(text);
    if(value.version!==SAVE_VERSION)return null;
    const restored=restoreSnapshot(value.snapshot,makeWorld);
    if(!restored)return null;
    const undo=value.undo?restoreSnapshot(value.undo,makeWorld):null;
    return {restored,undo:undo?value.undo:null};
  }catch{return null}
}
