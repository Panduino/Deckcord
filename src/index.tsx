import { definePlugin, PanelSection, PanelSectionRow, TextField, DialogButton, Router, staticClasses } from "@decky/ui";
import { call, toaster } from "@decky/api";
import { useEffect, useState } from "react";
import { FaComments } from "react-icons/fa";
import { patchMenu } from "./patches/menuPatch";\nimport { routerHook } from "@decky/api";

declare global { interface Window { SHARKORD_TAB: any; } }

const Browser = () => {
  useEffect(() => {
    const tab = window.SHARKORD_TAB;
    if (tab) {
      tab.m_browserView.SetVisible(true);
      tab.m_browserView.SetFocus(true);
    }
    return () => {
      if (window.SHARKORD_TAB) {
        window.SHARKORD_TAB.m_browserView.SetVisible(false);
        window.SHARKORD_TAB.m_browserView.SetFocus(false);
      }
    };
  }, []);
  return <div />;
};

const Content = () => {
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { call<[], string>("get_url").then(v => {setUrl(v || ""); setSaved(!!v);}); }, []);
  return <PanelSection>
    <PanelSectionRow><TextField label="Sharkord server (HTTPS)" value={url} onChange={e => {setUrl(e.target.value); setSaved(false);}} /></PanelSectionRow>
    <PanelSectionRow><DialogButton onClick={async () => {
      try { await call("set_url", url); setSaved(true); toaster.toast({title:"Deckshark",body:"Server saved"}); }
      catch(e) { toaster.toast({title:"Deckshark",body:String(e)}); }
    }}>Save server</DialogButton></PanelSectionRow>
    <PanelSectionRow><DialogButton disabled={!saved} onClick={() => Router.Navigate("/sharkord")}>Open Sharkord</DialogButton></PanelSectionRow>
    <PanelSectionRow><div>Sharkord runs in a separate Steam browser view. Voice audio should continue when the menu closes; microphone compatibility requires Steam Deck testing.</div></PanelSectionRow>
  </PanelSection>;
};

export default definePlugin(() => {
  const unpatch = patchMenu();\n  routerHook.addRoute("/sharkord", () => <Browser />);
  let ws: WebSocket | undefined;
  let peer: RTCPeerConnection | undefined;
  let stream: MediaStream | undefined;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const connect = () => {
    if (disposed) return;
    ws = new WebSocket("ws://127.0.0.1:65123/signal?role=decky");
    ws.onmessage = async e => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "offer") {
          peer?.close();
          stream?.getTracks().forEach(t => t.stop());
          peer = new RTCPeerConnection();
          stream = await navigator.mediaDevices.getUserMedia({audio:true, video:false});
          stream.getTracks().forEach(t => peer!.addTrack(t, stream!));
          peer.onicecandidate = ev => {
            if (ev.candidate && ws?.readyState === WebSocket.OPEN)
              ws.send(JSON.stringify({type:"ice", candidate:ev.candidate}));
          };
          await peer.setRemoteDescription(msg.sdp);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          ws?.send(JSON.stringify({type:"answer",sdp:peer.localDescription}));
        } else if (msg.type === "ice" && peer) {
          await peer.addIceCandidate(msg.candidate);
        }
      } catch(err) { console.error("Deckshark microphone bridge:",err); }
    };
    ws.onclose = () => { if (!disposed) reconnect = setTimeout(connect, 2000); };
  };
  connect();
  return {
    title:<div className={staticClasses.Title}>Deckshark</div>,
    icon:<FaComments />,
    content:<Content />,
    onDismount() {
      disposed = true;
      if (reconnect) clearTimeout(reconnect);
      ws?.close(); peer?.close(); stream?.getTracks().forEach(t => t.stop());
      unpatch();
      routerHook.removeRoute("/sharkord");
    },
    alwaysRender:true,
  };
  function routerCleanup() { /* Route is managed by Decky plugin lifecycle. */ }
});
