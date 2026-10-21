import asyncio
import sys
import json
from pathlib import Path
from urllib.parse import urlparse
from aiohttp import web, WSMsgType
from decky import logger, DECKY_PLUGIN_SETTINGS_DIR, DECKY_PLUGIN_DIR
sys.path.append(DECKY_PLUGIN_DIR)
from tab_utils.tab import create_sharkord_tab, setup_sharkord_tab, navigate_sharkord, setOSK
from tab_utils.cdp import get_tab

SETTINGS = Path(DECKY_PLUGIN_SETTINGS_DIR) / "sharkord.json"

def valid_url(url):
    parsed = urlparse(url)
    return parsed.scheme == "https" and bool(parsed.hostname) and not parsed.username and not parsed.password

class Plugin:
    tab = None
    shared = None
    runner = None
    sockets = {}

    async def _main(self):
        app = web.Application()
        app.add_routes([web.get("/signal", self.signal), web.get("/openkb", self.openkb)])
        self.runner = web.AppRunner(app)
        await self.runner.setup()
        await web.TCPSite(self.runner, "127.0.0.1", 65123).start()
        self.tab = await create_sharkord_tab()
        await setup_sharkord_tab(self.tab)
        self.shared = await get_tab('SharedJSContext')
        await self.shared.open_websocket()
        url = await self.get_url()
        if url:
            await navigate_sharkord(self.tab, url)
        logger.info("Deckshark browser ready")

    async def get_url(self):
        try:
            url = json.loads(SETTINGS.read_text()).get("url", "")
            return url if valid_url(url) else ""
        except (OSError, ValueError, TypeError):
            return ""

    async def set_url(self, url):
        url = url.strip().rstrip("/")
        if not valid_url(url):
            raise ValueError("Enter a valid HTTPS Sharkord server URL")
        SETTINGS.parent.mkdir(parents=True, exist_ok=True)
        SETTINGS.write_text(json.dumps({"url": url}))
        if self.tab:
            await self.tab.ensure_open()
            await navigate_sharkord(self.tab, url)
        return True

    async def openkb(self, request):
        await setOSK(self.tab, True)
        return web.Response(text="OK", headers={"Access-Control-Allow-Origin":"*"})

    async def signal(self, request):
        role = request.query.get("role")
        if role not in ("browser", "decky"):
            raise web.HTTPBadRequest()
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        previous = self.sockets.get(role)
        if previous and not previous.closed:
            await previous.close()
        self.sockets[role] = ws
        try:
            async for msg in ws:
                if msg.type != WSMsgType.TEXT:
                    continue
                other = self.sockets.get("decky" if role == "browser" else "browser")
                if other and not other.closed:
                    await other.send_str(msg.data)
        finally:
            if self.sockets.get(role) is ws:
                self.sockets.pop(role, None)
        return ws

    async def _unload(self):
        for ws in list(self.sockets.values()):
            await ws.close()
        if self.runner:
            await self.runner.cleanup()
        if self.shared:
            await self.shared.ensure_open()
            await self.shared.evaluate("""
                if (window.SHARKORD_TAB) {
                    window.SHARKORD_TAB.m_browserView.SetVisible(false);
                    window.SHARKORD_TAB.Destroy();
                    window.SHARKORD_TAB = undefined;
                }
            """)
            await self.shared.close_websocket()
