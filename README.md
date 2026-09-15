# KodeKloud userscripts

These are independent userscripts. Install either or both.

## Course overview

`kodekloud-course-overview.user.js` adds a **Course Overview** tab to
`https://learn.kodekloud.com/learn/dashboard`.

- Browse the complete KodeKloud catalog, rather than only enrolled courses.
- Switch between **All courses**, **My courses**, and **Favorites / next up**.
- Search and filter by category, difficulty, or plan.
- Favorite any number of courses using Violentmonkey storage.
- Use **Up** and **Down** in the favorites view to set your next-course order.
- Open any course directly from its card.

The overview script runs only on `/learn/dashboard`. It does not add controls or
observers to KodeKloud lesson pages. Account enrollment and progress are fetched
using the session already loaded by the dashboard; the temporary authentication
token is never stored.

Favorite data uses Violentmonkey's `GM.getValue` and `GM.setValue` storage. It does
not use KodeKloud's local storage, so clearing LibreWolf site data does not clear
the queue. Clearing Violentmonkey's extension data or this script's stored data
will clear it.

## Persistent fullscreen

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
3. Replace its template with the contents of the `.user.js` file you want, then
   save it. Create a separate Violentmonkey script for each file.
4. Reload the KodeKloud lesson page.

Alternatively, serve this directory locally with:

```sh
python3 -m http.server 8000
```

Then open either of these URLs and approve the userscript manager's installation
prompt:

- `http://localhost:8000/kodekloud-course-overview.user.js`
- `http://localhost:8000/kodekloud-persistent-fullscreen.user.js`

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
