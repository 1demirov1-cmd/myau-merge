"""Headless Chrome smoke test for MYAU mutation rollout; run: py -3 test_browser_mutations.py."""
from __future__ import annotations
import functools
import http.server
import json
import pathlib
import threading
from playwright.sync_api import sync_playwright

ROOT=pathlib.Path(__file__).resolve().parent
class Silent(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

srv=http.server.ThreadingHTTPServer(('127.0.0.1',0), functools.partial(Silent,directory=str(ROOT)))
thread=threading.Thread(target=srv.serve_forever,daemon=True)
thread.start()
url=f'http://127.0.0.1:{srv.server_port}/'
errors=[]
try:
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True,executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
        page=context.new_page()
        page.add_init_script("""Object.defineProperty(Crypto.prototype,'getRandomValues',
            {configurable:true,value:function(a){a[0]=4;return a;}});""")
        page.on('pageerror',lambda e: errors.append(str(e)))
        page.goto(url,wait_until='networkidle',timeout=20000)
        page.locator('#start').click()
        page.wait_for_timeout(200)
        def saved():
            return page.evaluate("JSON.parse(localStorage.getItem('myau-game-v1'))")
        def throw(x):
            box=page.locator('#game').bounding_box()
            assert box is not None
            page.mouse.click(box['x']+box['width']*x,box['y']+box['height']*.15)
            page.wait_for_timeout(640)
        assert saved()['snapshot']['ui']['throwCount']==0
        for x in [.22,.5,.78]: throw(x)
        assert saved()['snapshot']['ui']['throwCount']==3, saved()
        mutation=saved()['snapshot']['ui']['nextMutation']
        assert mutation is not None, 'Expected seeded 5th throw to be a mutant'
        assert page.locator('#next-mutation').is_visible()
        page.locator('#next-mutation').click()
        assert 'Кот-' in page.locator('#toast').inner_text()
        throw(.20)
        assert saved()['snapshot']['ui']['currentMutation']==mutation
        throw(.82)
        assert any(b.get('mutation') for b in saved()['snapshot']['world']['balls']), 'Special cat did not appear'
        assert page.locator('#undo').is_enabled()
        page.locator('#undo').click()
        assert saved()['snapshot']['ui']['throwCount']==4
        assert saved()['snapshot']['ui']['currentMutation']==mutation
        assert not page.locator('#undo').is_enabled()
        # Must be able to replay the same special cat, deterministic RNG.
        throw(.82)
        assert saved()['snapshot']['ui']['throwCount']==5
        page.reload(wait_until='networkidle')
        assert page.locator('#continue').is_visible(), 'PWA resume button missing'
        page.locator('#continue').click()
        assert saved()['snapshot']['ui']['throwCount']==5
        page.locator('#pause').click()
        assert page.locator('#overlay').is_visible()
        old=saved()['snapshot']['world']['time']
        page.wait_for_timeout(400)
        assert saved()['snapshot']['world']['time']==old,'Game time advanced while paused'
        page.locator('#resume').click()
        assert page.locator('#overlay').is_hidden()
        assert not errors, errors
        print('MYAU_BROWSER_PHASE3_PASS: 10% seeded mutation, next preview, mutant drop, undo, reload/resume, pause; type='+mutation)
        browser.close()
finally:
    srv.shutdown()
    srv.server_close()
