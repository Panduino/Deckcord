from asyncio import sleep
from pathlib import Path
from .cdp import get_tab, get_tab_lambda

async def create_sharkord_tab():
    while True:
        try:
            shared = await get_tab("SharedJSContext")
            await shared.open_websocket()
            break
        except Exception:
            await sleep(1)
    await shared.evaluate("""
        if (window.SHARKORD_TAB) {
            window.SHARKORD_TAB.m_browserView.SetVisible(false);
            window.SHARKORD_TAB.Destroy();
        }
        window.SHARKORD_TAB = window.DFL.Router.WindowStore.GamepadUIMainWindowInstance.CreateBrowserView("sharkord");
        window.SHARKORD_TAB.WIDTH = 860;
        window.SHARKORD_TAB.HEIGHT = 495;
        window.SHARKORD_TAB.m_browserView.SetBounds(0,0,860,495);
        window.SHARKORD_TAB.m_browserView.LoadURL("data:text/plain,sharkord_waiting");
        window.SHARKORD_TAB.m_browserView.SetVisible(false);
    """)
    for _ in range(30):
        await sleep(1)
        try:
            tab = await get_tab_lambda(lambda t: t.url == "data:text/plain,sharkord_waiting")
            await shared.close_websocket()
            return tab
        except Exception:
            continue
    await shared.close_websocket()
    raise RuntimeError("Sharkord browser tab did not appear")

async def setup_sharkord_tab(tab):
    await tab.open_websocket()
    await tab.enable()
    script = Path(__file__).parent.parent.joinpath("sharkord_client.js").read_text()
    await tab._send_devtools_cmd({"method":"Page.addScriptToEvaluateOnNewDocument","params":{"source":script,"runImmediately":True}})

async def navigate_sharkord(tab, url):
    await tab._send_devtools_cmd({"method":"Page.navigate","params":{"url":url}})

async def setOSK(tab, state):
    shared = await get_tab("SharedJSContext")
    await shared.open_websocket()
    await shared.evaluate("window.SHARKORD_TAB.m_virtualKeyboardHost.m_" + ("showKeyboard" if state else "hideKeyboard") + "()")
    await shared.close_websocket()
