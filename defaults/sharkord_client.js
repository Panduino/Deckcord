// Runs in Sharkord's browser tab, independently of its UI/framework.
(() => {
    if (window.__decksharkInstalled) return;
    window.__decksharkInstalled = true;
    const original = navigator.mediaDevices && navigator.mediaDevices.getUserMedia?.bind(navigator.mediaDevices);
    if (!original) return;
    let activeStream = null;
    let pending = null;
    let peer = null;
    let socket = null;
    const connect = () => {
        socket = new WebSocket("ws://127.0.0.1:65123/signal?role=browser");
        socket.onmessage = async e => {
            const message = JSON.parse(e.data);
            if (message.type === "answer" && peer) await peer.setRemoteDescription(message.sdp);
            if (message.type === "ice" && peer) await peer.addIceCandidate(message.candidate);
        };
    };
    connect();
    navigator.mediaDevices.getUserMedia = async constraints => {
        if (!constraints?.audio) return original(constraints);
        if (activeStream && activeStream.getAudioTracks().some(t => t.readyState === "live")) return activeStream;
        if (pending) return pending;
        pending = new Promise(async (resolve, reject) => {
            try {
                if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error("Sharkord microphone bridge not connected");
                peer = new RTCPeerConnection();
                peer.onicecandidate = e => {
                    if (e.candidate && socket.readyState === WebSocket.OPEN)
                        socket.send(JSON.stringify({type:"ice", candidate:e.candidate}));
                };
                peer.ontrack = e => {
                    activeStream = e.streams[0] || new MediaStream([e.track]);
                    resolve(activeStream);
                };
                peer.addTransceiver("audio", {direction:"recvonly"});
                const offer = await peer.createOffer();
                await peer.setLocalDescription(offer);
                socket.send(JSON.stringify({type:"offer", sdp:peer.localDescription}));
                setTimeout(() => { if (!activeStream) reject(new Error("Microphone bridge timed out")); }, 15000);
            } catch (err) { reject(err); }
        }).finally(() => { pending = null; });
        return pending;
    };
    // Steam's virtual keyboard is required for typing in the browser view.
    document.addEventListener("click", e => {
        if (e.target.closest('input, textarea, [contenteditable="true"], [role="textbox"]'))
            fetch("http://127.0.0.1:65123/openkb", {mode:"no-cors"}).catch(() => {});
    }, true);
})();
