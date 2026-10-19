"""Browser regression for maniac knife, once-per-game name and legacy-safe save."""
import functools,http.server,pathlib,threading
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parent
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True,args=['--no-sandbox'])
  context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block')
  page=context.new_page()
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.add_init_script("""Object.defineProperty(Crypto.prototype,'getRandomValues',{configurable:true,value:function(a){a[0]=4;return a;}});
   window.__bladeCount=0;const orig=CanvasRenderingContext2D.prototype.fillText;
   CanvasRenderingContext2D.prototype.fillText=function(text,...args){if(String(text)==='🔪')window.__bladeCount++;return orig.call(this,text,...args);};""")
  def inject(route):
   response=route.fetch()
   body=response.body().decode('utf-8')
   marker='if (getRandom(random) >= MUTATION_CHANCE) return null;'
   assert marker in body
   body=body.replace(marker,"if(throwNumber===5||throwNumber===7) return 'maniac'; return null;")
   route.fulfill(response=response,body=body)
  page.route('**/mutations.mjs*',inject)
  page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='networkidle',timeout=50000)
  page.locator('#start').click()
  page.wait_for_function("localStorage.getItem('myau-game-v1')!==null",timeout=15000)
  page.evaluate("""() => {window.__toasts=[];new MutationObserver(()=>window.__toasts.push(document.querySelector('#toast').textContent)).observe(document.querySelector('#toast'),{childList:true,characterData:true,subtree:true});}""")
  def drop(x):
   box=page.locator('#game').bounding_box()
   page.mouse.click(box['x']+box['width']*x,box['y']+box['height']*.15)
   page.wait_for_timeout(700)
  def saved():return page.evaluate("JSON.parse(localStorage.getItem('myau-game-v1'))")
  for x in [.1,.30,.73]: drop(x)
  assert saved()['snapshot']['ui']['nextMutation']=='maniac'
  assert page.locator('#next-mutation').inner_text()=='🔪'
  drop(.88);assert saved()['snapshot']['ui']['currentMutation']=='maniac'
  drop(.50)
  assert 'maniac' in saved()['snapshot']['ui']['announcedMutations']
  assert page.evaluate('window.__bladeCount')>0,'Knife not drawn'
  drop(.10)
  assert saved()['snapshot']['ui']['currentMutation']=='maniac'
  drop(.43)
  seen=page.evaluate("window.__toasts.filter(x=>x.includes('ОСОБЫЙ КОТ: КОТ-МАНЬЯК')).length")
  assert seen==1,('Name must display exactly once per run',seen)
  page.reload(wait_until='domcontentloaded')
  assert page.locator('#continue').is_visible()
  page.locator('#continue').click()
  assert 'maniac' in saved()['snapshot']['ui']['announcedMutations']
  assert not errors,errors
  print('MANIAC_UI_ONCE_SAVE_PASS blade_frames='+str(page.evaluate('window.__bladeCount')),flush=True)
  browser.close()
finally:
 server.shutdown();server.server_close()
