# Deckshark

Sharkord in Steam Deck Game Mode, based on [Deckcord](https://github.com/marios8543/Deckcord).

## Features
- Loads your existing Sharkord server in a Steam browser view (not a recreated client).
- Steam menu entry and Decky shortcut.
- HTTPS server URL setting.
- Experimental microphone relay from Steam's main UI context into the Sharkord browser tab.

## Status
**Experimental / hardware testing required.** SteamOS's embedded Chromium behavior and Sharkord's voice handling may need further fixes. Do not assume background microphone operation has been verified.

## Setup
Build using `pnpm install && pnpm build`, install through Decky developer mode, enter your HTTPS Sharkord URL, and open Sharkord from the Steam menu.

The original Deckcord license is retained. The original Discord/Vencord code remains in the repository as unused reference files for now.
