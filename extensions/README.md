# SU Schedule Bannerweb Companion

This extension bridges the static SU Schedule website and Bannerweb.

## Safety changes

- One Banner login request per explicit click.
- No retry/brute-force loop.
- No automatic script injection on every page load.
- The content bridge runs only on `lastpotatos.github.io`, localhost, and 127.0.0.1.
- Credentials are entered on `login.html`, an extension-owned page, and are not stored.

## Install

1. Open `chrome://extensions` or `brave://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select this `extension` folder.

If the website later moves to another domain, add that origin to `content_scripts.matches` in `manifest.json`.
