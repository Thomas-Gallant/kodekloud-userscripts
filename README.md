# KodeKloud persistent fullscreen

`kodekloud-persistent-fullscreen.user.js` keeps a lesson video maximized when
KodeKloud autoplays the next lesson.

KodeKloud already remembers that fullscreen was enabled, but the replacement
Vimeo player cannot re-enter browser fullscreen without a new user gesture. The
userscript detects that specific lesson transition and uses a full-window CSS
fallback. Exiting fullscreen manually on the same lesson does not activate the
fallback.

## Install

1. Install Tampermonkey or Violentmonkey in the browser.
2. Open the userscript manager's dashboard and create a new script.
3. Replace its template with the contents of
   `kodekloud-persistent-fullscreen.user.js`, then save it.
4. Reload the KodeKloud lesson page.

Alternatively, serve this directory locally with:

```sh
python3 -m http.server 8000
```

Then open
`http://localhost:8000/kodekloud-persistent-fullscreen.user.js` and approve the
userscript manager's installation prompt.

## Behavior

- Enter fullscreen normally from the Vimeo controls.
- If autoplay navigates to another lesson, the replacement player fills the
  browser window automatically.
- Select **Exit fullscreen** in the upper-right corner to leave the CSS
  fallback.
- Pressing Escape to leave native fullscreen before navigation continues to
  work normally.

The script runs only on KodeKloud course lesson URLs and does not send or store
data.
