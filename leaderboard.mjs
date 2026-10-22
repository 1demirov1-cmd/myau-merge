// World ranking. Player nicknames remain local if Supabase is temporarily unreachable.
let createClient;
async function loadClient(){
 if(createClient)return createClient;
 const mod=await import('./vendor/supabase.mjs');
 createClient=mod.createClient;
 return createClient;
}
const URL='https://udeheaejvqwqsubktnml.supabase.co';
const KEY=globalThis.MYAU_SUPABASE_PUBLISHABLE_KEY||'';
const $=s=>document.querySelector(s);
const TOP_CACHE='myau-last-world-top-v1';
const RANK_USER_KEY='myau-rank-user-id';
let topLastUpdated=0,topLoading=false;
function restoreTop(){
 try{
  const old=JSON.parse(localStorage.getItem(TOP_CACHE));
  return old&&Array.isArray(old.rows)&&old.rows.length<=100&&old.rows.every(
   x=>x&&typeof x.nickname==='string'&&Number.isFinite(x.best_score)&&typeof x.user_id==='string'
  )?old:null;
 }catch{return null}
}
function renderTop(rows){
 body.replaceChildren();
 rows.forEach((p,i)=>{
  const tr=document.createElement('tr');
  if(p.user_id===user?.id)tr.className='mine';
  const a=document.createElement('td'),b=document.createElement('td'),c=document.createElement('td');
  a.textContent=String(i+1);b.textContent=p.nickname;
  c.textContent=Number(p.best_score).toLocaleString('ru-RU');
  tr.append(a,b,c);body.append(tr);
 });
}
function showCachedTop(){
 const old=restoreTop();
 if(!old)return false;
 renderTop(old.rows);
 const time=new Date(old.at).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
 msg('Показан сохранённый ТОП от '+time+'. Проверяем обновления…');
 return true;
}
function clean(s){return String(s||'').trim().replace(/[<>]/g,'').slice(0,20)}
function score(){return Math.max(0,Math.min(100000000,Number(localStorage.getItem('meow-best'))||0))}
async function limited(p,ms=25000,stage='связь с сервером'){
 let timer;
 try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('превышено время ожидания сети ('+stage+')')),ms)})])}
 finally{clearTimeout(timer)}
}
if(localStorage.getItem('myau-rank-reset-v1')!=='done'){
 localStorage.removeItem('myau-nickname');
 localStorage.removeItem('myau-rank-choice');
 localStorage.setItem('myau-rank-reset-v1','done');
}
const modal=$('#rank-modal'),status=$('#rank-status'),body=$('#rank-list'),place=$('#rank-place');
const headerNick=$('#header-nick'),profile=$('#rank-profile'),editButton=$('#rank-edit');
const skipLabel=$('.rank-skip'),skip=$('#rank-skip'),saveButton=$('#rank-save'),nickInput=$('#rank-nick');
let client=null,user=null,nick=clean(localStorage.getItem('myau-nickname')),bestSent=0,busy=false,editing=false,connecting=null,saving=false;
let serverNick='',resyncAfterBusy=false,syncTimer=null;
const retryButton=$('#rank-retry');
function showRetry(){retryButton.hidden=false}
function hideRetry(){retryButton.hidden=true}
function markPending(){
 if(!nick||localStorage.getItem('myau-rank-choice')==='skip')return;
 localStorage.setItem('myau-rank-pending','yes');
 setPlace('…');
 updateProfile();
}
function scheduleSync(delay=1200){
 if(!nick||localStorage.getItem('myau-rank-choice')==='skip')return;
 markPending();
 if(syncTimer!==null)clearTimeout(syncTimer);
 syncTimer=setTimeout(()=>{
  syncTimer=null;
  if(!client||!user)init();
  else sync();
 },delay);
}
function msg(s){status.textContent=s}
function setPlace(s){place.textContent=s}
function renderNick(){headerNick.textContent=clean(localStorage.getItem('myau-nickname'))||'Гость'}
function updateProfile(){
 const published=!!nick&&localStorage.getItem('myau-rank-choice')==='joined'&&localStorage.getItem('myau-rank-pending')!=='yes';
 profile.hidden=published&&!editing;
 skipLabel.hidden=published&&!editing;
 editButton.hidden=!published||editing;
}
function offlineMessage(detail=''){
 return 'Ник сохранён на устройстве. Мировой ТОП пока недоступен'+(detail?': '+detail:'.')+'. Попробуй позже.';
}
renderNick();updateProfile();
headerNick.addEventListener('click',()=>$('#rank-open').click());
editButton.addEventListener('click',()=>{editing=true;updateProfile();nickInput.value=nick;nickInput.focus()});
async function connectOnce(){
 if(!KEY){msg('Рейтинг ожидает подключения базы данных');setPlace('—');return false}
 msg(nick?'Подключаем мировой рейтинг. Ник уже сохранён на устройстве…':'Подключаем мировой рейтинг…');
 try{
  const factory=await limited(loadClient(),15000,'загрузка библиотеки рейтинга');
  // iOS PWAs can leave navigator.locks stuck after suspension. Our writes
  // are serialized in this client; skip browser-level locking only.
  const active=client||factory(URL,KEY,{auth:{
   persistSession:true,autoRefreshToken:true,lock:(_name,_timeout,fn)=>fn()
  }});
  const old=await limited(active.auth.getSession(),30000,'проверка прежнего входа');
  // Never replace an existing anonymous account when token refresh merely fails.
  if(old.error)throw old.error;
  let session=old.data?.session;
  if(!session){
   // Never silently replace a saved anonymous identity with a new one.
   const authKey='sb-'+URL.replace(/^https?:\/\//,'').split('.')[0]+'-auth-token';
   if(localStorage.getItem(RANK_USER_KEY)||localStorage.getItem(authKey)){
    throw new Error('прежняя сессия не восстановилась; повтори подключение без очистки данных игры');
   }
   const r=await limited(active.auth.signInAnonymously(),30000,'авторизация игрока');
   if(r.error)throw r.error;
   session=r.data?.session;
  }
  if(!session?.user?.id)throw new Error('авторизация не завершена');
  const pinnedId=localStorage.getItem(RANK_USER_KEY);
  if(pinnedId&&pinnedId!==session.user.id){
   throw new Error('найдена другая игровая сессия; старую запись не перезаписываем');
  }
  if(!pinnedId)localStorage.setItem(RANK_USER_KEY,session.user.id);
  client=active;user=session.user;
  hideRetry();
  const r=await limited(client.from('myau_players').select('nickname,best_score').eq('user_id',user.id).maybeSingle(),30000,'получение профиля');
  if(r.error)throw r.error;
  // A locally saved nickname takes priority over an older server response.
  nick=clean(localStorage.getItem('myau-nickname')||r.data?.nickname);
  if(nick&&!localStorage.getItem('myau-nickname'))localStorage.setItem('myau-nickname',nick);
  renderNick();updateProfile();
  bestSent=Number(r.data?.best_score)||0;
  serverNick=clean(r.data?.nickname);
  if(nick){
   nickInput.value=nick;
   if(localStorage.getItem('myau-rank-choice')==='skip'){
    msg('Рейтинг открыт в режиме гостя');
   }else if(!r.data||score()>bestSent||nick!==serverNick||localStorage.getItem('myau-rank-pending')==='yes'){
    // The TOP is loaded independently of a slow personal-score upload.
    setTimeout(()=>{sync()},0);
   }else{
    msg('Ник и рекорд сохранены в мировом рейтинге');
    await refreshPlace(bestSent);
   }
  }else {msg('Укажи ник, чтобы участвовать в рейтинге');setPlace('—')}
  return true;
 }catch(e){
  client=null;user=null;setPlace('—');
  showRetry();
  msg(nick?offlineMessage(e.message||'ошибка сети'):'Не удалось подключить рейтинг: '+(e.message||'ошибка сети')+
   '. Нажми «Повторить»');
  return false;
 }
}
async function init(){
 if(connecting)return connecting;
 connecting=connectOnce();
 try{return await connecting}finally{connecting=null}
}
async function refreshPlace(record){
 try{
  const ahead=await limited(client.from('myau_players').select('user_id',{count:'exact',head:true}).gt('best_score',record),25000,'расчёт места');
  if(ahead.error)throw ahead.error;
  // Do not display a stale placement while a newer local record is waiting.
  if(score()>bestSent||localStorage.getItem('myau-rank-pending')==='yes'){setPlace('…');return}
  setPlace('#'+((ahead.count||0)+1));
 }catch{
  setPlace('—');
  msg('Рекорд сохранён в мировом ТОПе. Место временно недоступно.');
 }
}
async function sync(){
 if(!client||!user||!nick||localStorage.getItem('myau-rank-choice')==='skip')return false;
 // A score can improve while an earlier network request is still in flight.
 // Never drop that update: queue it and publish the latest score afterward.
 if(busy){resyncAfterBusy=true;markPending();return false}
 busy=true;
 let published=false,moreNeeded=false;
 try{
  for(let attempt=0;attempt<5;attempt++){
   resyncAfterBusy=false;
   const sendingNick=nick;
   const best=Math.max(score(),bestSent);
   // Request the actual stored row: 2xx alone is not proof that this score was saved.
   const r=await limited(client.from('myau_players')
    .upsert({user_id:user.id,nickname:sendingNick,best_score:best},{onConflict:'user_id'})
    .select('user_id,nickname,best_score').single(),30000,'отправка рекорда');
   if(r.error)throw r.error;
   const confirmed=Number(r.data?.best_score);
   if(r.data?.user_id!==user.id||r.data?.nickname!==sendingNick||
      !Number.isFinite(confirmed)||confirmed<best){
    throw new Error('сервер не подтвердил сохранение рекорда');
   }
   bestSent=Math.max(bestSent,confirmed);
   serverNick=sendingNick;
   if(score()<=bestSent&&nick===sendingNick&&!resyncAfterBusy){published=true;break}
  }
  if(!published){moreNeeded=true;markPending();return false}
  // The latest score was already included in this upload; discard its old debounce timer.
  if(syncTimer!==null){clearTimeout(syncTimer);syncTimer=null}
  localStorage.removeItem('myau-rank-pending');
  localStorage.setItem('myau-rank-choice','joined');
  editing=false;updateProfile();
  msg('Ник и рекорд подтверждены сервером мирового ТОПа');
  await refreshPlace(bestSent);
  return true;
 }catch(e){
  markPending();setPlace('—');editing=true;updateProfile();
  const duplicate=e.code==='23505';
  msg(duplicate?'Этот ник уже закреплён за другой игровой сессией. Не удаляй игру и не меняй ник: для восстановления рейтинга может понадобиться прежняя сессия.':offlineMessage(e.message||'ошибка сети'));
  return false;
 }finally{
  busy=false;
  // The score may change during the confirmation/rank request too.
  if(moreNeeded||(published&&(score()>bestSent||nick!==serverNick||resyncAfterBusy))){
   scheduleSync(900);
  }
 }
}
async function show(){
 modal.hidden=false;updateProfile();
 if(topLoading)return;
 topLoading=true;
 try{
  const hadCache=showCachedTop();
  if(!client||!user){const ok=await init();if(!ok)return}
  msg(hadCache?'Обновляем сохранённый мировой ТОП…':'Загружаем мировой ТОП…');
  const r=await limited(client.from('myau_players').select('nickname,best_score,user_id').order('best_score',{ascending:false}).order('updated_at',{ascending:true}).limit(100),30000,'загрузка ТОП-100');
  if(r.error)throw r.error;
  const rows=(r.data||[]).map(p=>({nickname:p.nickname,best_score:Number(p.best_score),user_id:p.user_id}));
  renderTop(rows);
  const at=Date.now();topLastUpdated=at;
  try{localStorage.setItem(TOP_CACHE,JSON.stringify({at,rows}))}catch{}
  hideRetry();
  if(!rows.length)msg('Пока нет игроков. Стань первым!');
  else if(localStorage.getItem('myau-rank-pending')==='yes')msg('ТОП обновлён. Твой новый рекорд ожидает отправки на сервер.');
  else msg('Мировой ТОП обновлён');
 }catch(e){
  showRetry();
  msg('Не удалось обновить ТОП: '+(e.message||'ошибка сети')+
   '. Можно смотреть сохранённый список и повторить подключение.');
 }finally{topLoading=false}
}
$('#rank-open').addEventListener('click',show);
retryButton.addEventListener('click',()=>{show()});
function applySkip(){
 const checked=skip.checked;
 nickInput.disabled=checked;saveButton.disabled=checked;
 if(checked){
  localStorage.setItem('myau-rank-choice','skip');
  modal.hidden=true;
  msg('Без ника: участие в рейтинге отключено');
 }else{
  localStorage.removeItem('myau-rank-choice');
  msg('Введи ник для участия в рейтинге');
 }
}
skip.addEventListener('change',applySkip);
$('#rank-close').addEventListener('click',()=>modal.hidden=true);
modal.addEventListener('click',e=>{if(e.target===modal)modal.hidden=true});
saveButton.addEventListener('click',async()=>{
 if(saving)return;
 const n=clean(nickInput.value);
 if(n.length<2){msg('Ник должен содержать от 2 до 20 символов');return}
 // Local persistence must not depend on CDN loading, auth, or network latency.
 nick=n;localStorage.setItem('myau-nickname',n);
 localStorage.setItem('myau-rank-choice','joined');
 localStorage.setItem('myau-rank-pending','yes');
 renderNick();editing=true;updateProfile();
 msg('Ник сохранён на устройстве. Отправляем в мировой ТОП…');
 saving=true;saveButton.disabled=true;
 try{
  if(!client||!user){
   const ok=await init();
   if(!ok)return;
  }else await sync();
  if(localStorage.getItem('myau-rank-pending')!=='yes')await show();
 }finally{saving=false;saveButton.disabled=skip.checked}
});
window.addEventListener('myau-best-updated',()=>{if(nick)scheduleSync(1200)});
window.addEventListener('online',()=>{
 if(!modal.hidden)show();
 if(nick&&localStorage.getItem('myau-rank-choice')!=='skip'){
  if(!client||!user)init();else sync();
 }
});
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&!modal.hidden&&Date.now()-topLastUpdated>20000)show();
 if(!document.hidden&&localStorage.getItem('myau-rank-pending')==='yes'){
  if(!client||!user)init();else sync();
 }
});
// Retry pending records even when a phone silently reconnects without an online event.
setInterval(()=>{
 if(!document.hidden&&!modal.hidden&&Date.now()-topLastUpdated>60000)show();
 if(!document.hidden&&localStorage.getItem('myau-rank-pending')==='yes'&&nick){
  if(!client||!user)init();else sync();
 }
},30000);
if(nick&&localStorage.getItem('myau-rank-choice')!=='skip'){
 nickInput.value=nick;init();
}else if(localStorage.getItem('myau-rank-choice')==='skip'){
 skip.checked=true;nickInput.disabled=true;saveButton.disabled=true;
}else{
 modal.hidden=false;msg('Придумай ник для мирового ТОПа или выбери «Играть без ника»');
}
