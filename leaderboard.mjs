// World ranking. Player nicknames remain local if Supabase is temporarily unreachable.
let createClient;
async function loadClient(){
 if(createClient)return createClient;
 const mod=await import('https://esm.sh/@supabase/supabase-js@2.75.0');
 createClient=mod.createClient;
 return createClient;
}
const URL='https://udeheaejvqwqsubktnml.supabase.co';
const KEY=globalThis.MYAU_SUPABASE_PUBLISHABLE_KEY||'';
const $=s=>document.querySelector(s);
function clean(s){return String(s||'').trim().replace(/[<>]/g,'').slice(0,20)}
function score(){return Math.max(0,Math.min(100000000,Number(localStorage.getItem('meow-best'))||0))}
async function limited(p,ms=12000){
 let timer;
 try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('превышено время ожидания сети')),ms)})])}
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
  const factory=await limited(loadClient(),10000);
  const active=client||factory(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true}});
  const old=await limited(active.auth.getSession());
  let session=old.data?.session;
  if(!session){
   const r=await limited(active.auth.signInAnonymously());
   if(r.error)throw r.error;
   session=r.data?.session;
  }
  if(!session?.user?.id)throw new Error('авторизация не завершена');
  client=active;user=session.user;
  const r=await limited(client.from('myau_players').select('nickname,best_score').eq('user_id',user.id).maybeSingle());
  if(r.error)throw r.error;
  // A locally saved nickname takes priority over an older server response.
  nick=clean(localStorage.getItem('myau-nickname')||r.data?.nickname);
  if(nick&&!localStorage.getItem('myau-nickname'))localStorage.setItem('myau-nickname',nick);
  renderNick();updateProfile();
  bestSent=Number(r.data?.best_score)||0;
  if(nick){nickInput.value=nick;await sync()}
  else {msg('Укажи ник, чтобы участвовать в рейтинге');setPlace('—')}
  return true;
 }catch(e){
  client=null;user=null;setPlace('—');
  msg(nick?offlineMessage(e.message||'ошибка сети'):'Не удалось подключить рейтинг: '+(e.message||'ошибка сети'));
  return false;
 }
}
async function init(){
 if(connecting)return connecting;
 connecting=connectOnce();
 try{return await connecting}finally{connecting=null}
}
async function sync(){
 if(!client||!user||!nick||busy)return false;
 busy=true;
 try{
  const best=Math.max(score(),bestSent);
  const r=await limited(client.from('myau_players').upsert({user_id:user.id,nickname:nick,best_score:best},{onConflict:'user_id'}));
  if(r.error)throw r.error;
  bestSent=best;
  localStorage.removeItem('myau-rank-pending');
  localStorage.setItem('myau-rank-choice','joined');
  editing=false;updateProfile();
  msg('Ник и рекорд сохранены в мировом рейтинге');
  try{
   const ahead=await limited(client.from('myau_players').select('user_id',{count:'exact',head:true}).gt('best_score',best));
   if(ahead.error)throw ahead.error;
   setPlace('#'+((ahead.count||0)+1));
  }catch{setPlace('—');msg('Ник сохранён в мировом ТОПе. Место временно недоступно.')}
  return true;
 }catch(e){
  localStorage.setItem('myau-rank-pending','yes');
  setPlace('—');editing=true;updateProfile();
  const duplicate=e.code==='23505';
  msg(duplicate?'Этот ник уже занят. Выбери другой.':offlineMessage(e.message||'ошибка сети'));
  return false;
 }finally{busy=false}
}
async function show(){
 modal.hidden=false;updateProfile();
 if(!client||!user){const ok=await init();if(!ok)return}
 try{
  const r=await limited(client.from('myau_players').select('nickname,best_score,user_id').order('best_score',{ascending:false}).order('updated_at',{ascending:true}).limit(100));
  if(r.error)throw r.error;
  body.replaceChildren();
  (r.data||[]).forEach((p,i)=>{
   const tr=document.createElement('tr');
   if(p.user_id===user?.id)tr.className='mine';
   const a=document.createElement('td'),b=document.createElement('td'),c=document.createElement('td');
   a.textContent=String(i+1);b.textContent=p.nickname;c.textContent=Number(p.best_score).toLocaleString('ru-RU');
   tr.append(a,b,c);body.append(tr);
  });
  if(!r.data?.length)msg('Пока нет игроков. Стань первым!');
 }catch(e){msg('Не удалось загрузить ТОП-100: '+(e.message||'ошибка сети'))}
}
$('#rank-open').addEventListener('click',show);
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
window.addEventListener('myau-best-updated',()=>{if(client&&nick)sync()});
window.addEventListener('online',()=>{if(!client||!user)init();else if(nick)sync()});
if(nick&&localStorage.getItem('myau-rank-choice')!=='skip'){
 nickInput.value=nick;init();
}else if(localStorage.getItem('myau-rank-choice')==='skip'){
 skip.checked=true;nickInput.disabled=true;saveButton.disabled=true;
}else{
 modal.hidden=false;msg('Придумай ник для мирового ТОПа или выбери «Играть без ника»');
}
