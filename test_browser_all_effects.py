"""Browser regression: force each mutation only at the fifth eligible drop via test-only HTTP interception.
No test hook or cheat is published in the game.
"""
import functools, http.server, pathlib, threading
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parent
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/'
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',args=['--no-sandbox'])
  for typ,needle in [('spring','ПРУЖИНА! БУМ!'),('ninja','НИНДЗЯ! ПРЫЖОК!'),('magnet','МАГНИТ! ПРИТЯЖЕНИЕ!')]:
   c=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block')
   pg=c.new_page()
   errors=[]
   pg.on('pageerror',lambda e: errors.append(str(e)))
   pg.add_init_script("""Object.defineProperty(Crypto.prototype,'getRandomValues',{configurable:true,value:function(a){a[0]=4;return a;}});
     window.__fxTexts={};
     const old=CanvasRenderingContext2D.prototype.fillText;
     CanvasRenderingContext2D.prototype.fillText=function(text,...args){
       const str=String(text); window.__fxTexts[str]=(window.__fxTexts[str]||0)+1;
       return old.call(this,text,...args);
     };""")
   def mutation_route(route):
    response=route.fetch()
    body=response.body().decode('utf-8')
    marker='if (getRandom(random) >= MUTATION_CHANCE) return null;'
    assert marker in body, 'Cannot intercept mutation probability'
    body=body.replace(marker, f"if(throwNumber===5) return '{typ}'; return null;")
    route.fulfill(response=response,body=body)
   pg.route('**/mutations.mjs',mutation_route)
   pg.goto(url,wait_until='domcontentloaded',timeout=25000)
   pg.locator('#start').click()
   pg.wait_for_timeout(150)
   def drop(x):
    box=pg.locator('#game').bounding_box()
    pg.mouse.click(box['x']+box['width']*x,box['y']+box['height']*.15)
    pg.wait_for_timeout(660)
   for x in [.12,.32,.70,.89]:drop(x)
   data=pg.evaluate("JSON.parse(localStorage.getItem('myau-game-v1'))")
   assert data['snapshot']['ui']['currentMutation']==typ,(typ,'not queued',data['snapshot']['ui'])
   drop(.5)
   pg.wait_for_timeout(3000)
   counts=pg.evaluate('window.__fxTexts')
   matched=sum(n for t,n in counts.items() if needle in t)
   print('BROWSER_ABILITY',typ,'render_frames',matched,'error_count',len(errors),flush=True)
   assert matched>0,(typ,'no visible activation event',counts)
   assert not errors,(typ,errors)
   c.close()
  browser.close()
 print('ALL_THREE_BROWSER_EFFECTS_PASS',flush=True)
finally:
 server.shutdown()
 server.server_close()
