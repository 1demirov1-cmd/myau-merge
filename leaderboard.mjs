import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.75.0';
const URL='https://udeheaejvqwqsubktnml.supabase.co';
const KEY=globalThis.MYAU_SUPABASE_PUBLISHABLE_KEY||'';
const $=s=>document.querySelector(s);
const modal=$('#rank-modal'),status=$('#rank-status'),body=$('#rank-list'),place=$('#rank-place');
let client=null,user=null,nick='',bestSent=0,busy=false;
function msg(s){status.textContent=s}
function clean(s){return String(s||'').trim().replace(/[<>]/g,'').slice(0,20)}
function score(){return Math.max(0,Math.min(100000000,Number(localStorage.getItem('meow-best'))||0))}
function setPlace(s){place.textContent=s}
async function init(){
 if(!KEY){msg('Рейтинг ожидает подключения базы данных');setPlace('—');return}
 try{
  client=createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true}});
  let {data:{session}}=await client.auth.getSession();
  if(!session){const r=await client.auth.signInAnonymously();if(r.error)throw r.error;session=r.data.session}
  user=session.user;
  const r=await client.from('myau_players').select('nickname,best_score').eq('user_id',user.id).maybeSingle();
  if(r.error)throw r.error;
  nick=clean(r.data?.nickname||localStorage.getItem('myau-nickname')||'');
  bestSent=Number(r.data?.best_score)||0;
  if(nick){$('#rank-nick').value=nick;await sync()}
  else {msg('Укажи ник, чтобы участвовать в рейтинге');setPlace('—')}
 }catch(e){msg('Не удалось подключить рейтинг: '+(e.message||'ошибка сети'));setPlace('—')}
}
async function sync(){
 if(!client||!user||!nick||busy)return;
 busy=true;
 try{
  const best=Math.max(score(),bestSent);
  const r=await client.from('myau_players').upsert({user_id:user.id,nickname:nick,best_score:best},{onConflict:'user_id'});
  if(r.error)throw r.error;
  bestSent=best;
  const ahead=await client.from('myau_players').select('user_id',{count:'exact',head:true}).gt('best_score',best);
  if(ahead.error)throw ahead.error;
  setPlace('#'+((ahead.count||0)+1));
  msg('Ты участвуешь в мировом рейтинге');
 }catch(e){msg('Ошибка синхронизации: '+(e.message||'нет связи'))}
 finally{busy=false}
}
async function show(){
 modal.hidden=false;
 if(!client){await if(localStorage.getItem('myau-nickname'))init();if(!client)return}
 const r=await client.from('myau_players').select('nickname,best_score,user_id').order('best_score',{ascending:false}).order('updated_at',{ascending:true}).limit(100);
 if(r.error){msg('Не удалось загрузить ТОП-100');return}
 body.replaceChildren();
 (r.data||[]).forEach((p,i)=>{const tr=document.createElement('tr');if(p.user_id===user?.id)tr.className='mine';const a=document.createElement('td'),b=document.createElement('td'),c=document.createElement('td');a.textContent=String(i+1);b.textContent=p.nickname;c.textContent=Number(p.best_score).toLocaleString('ru-RU');tr.append(a,b,c);body.append(tr)});
 if(!r.data?.length)msg('Пока нет игроков. Стань первым!');
}
$('#rank-open').addEventListener('click',show);
$('#rank-close').addEventListener('click',()=>modal.hidden=true);
modal.addEventListener('click',e=>{if(e.target===modal)modal.hidden=true});
$('#rank-save').addEventListener('click',async()=>{
 const n=clean($('#rank-nick').value);
 if(n.length<2){msg('Ник должен содержать от 2 до 20 символов');return}
 nick=n;localStorage.setItem('myau-nickname',n);
 await sync();await show();
});
window.addEventListener('myau-best-updated',()=>{if(client&&nick)sync()});
if(localStorage.getItem('myau-nickname'))init();