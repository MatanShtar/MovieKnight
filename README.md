# 🎬 MovieKnight — Client

The frontend for [MovieKnight](https://movieknight.site): a gamified movie
organizer that fights "what should we watch?" decision paralysis. Browse and
filter movies, sort them into collections, and pick one with **Spin the Wheel**,
the **Chopping Block**, or **Let AI Choose**.

A multi-page **vanilla** app — plain HTML, CSS, and ES6+ JavaScript. **No
framework, no bundler, no build step, no `node_modules`.** It talks to the
[MovieKnight server](https://github.com/niv1999/MovieKnight-server) for all data.

## Run locally

There's nothing to install — but the app **must be served over HTTP**, not opened
as a `file://` URL (it uses `fetch` and `localStorage`).

```bash
# from this folder:
python -m http.server 8000      # then open http://localhost:8000/index.html
```

Or use VS Code's **Live Server** on `index.html`.

**Which backend it hits** is automatic (see [`js/core/api.js`](js/core/api.js)):
on `localhost`/`127.0.0.1` it calls the local dev server at
`http://localhost:3000` (run `npm run dev` in the server repo first); anywhere
else it calls the deployed Render API. To force one, set `localStorage["mk:apiBase"]`.

## Pages

No router — each page is its own `*.html` at the root, pulling in its scripts and
styles via `<script defer>` / `<link>`.

| Page | Purpose |
| --- | --- |
| `index.html` | Home / explore — the filterable movie feed. |
| `movie.html` | Single-movie detail. |
| `collection.html` | One collection's movies (grid + sorting). |
| `profile.html` | User profile, bio/avatar, badges, and their collections. |
| `picker.html` | Setup hub for the picker games (pick a collection + filters). |
| `wheel.html` | Spin the Wheel (`<canvas>` roulette). |
| `chopping.html` | Chopping Block — eliminate movies two at a time until one wins. |
| `ai-suggestions.html` | "Let AI Choose" results. |
| `login.html` · `signup.html` | Real auth (JWT). |
| `about.html` · `coming-soon.html` · `404.html` | Static / fallback pages. |

## Project structure

JS and CSS share the same three-tier layout under `js/` and `css/`:

```
js/
  core/          loaded on (almost) every page
    api.js         window.MovieAPI — the ONLY place the app talks to the backend
    common.js      shared shell: sidebar/nav, mobile drawer, header dropdown, auth state
    toast.js       toast wrapper around the vendored Toastify
  components/    reusable cross-page widgets
    library-buttons.js          heart → Favorites / eye → Already Watched (optimistic toggle)
    collection-modal.js         one movie → many lists
    add-to-collection-modal.js  one list → many movies
    enhance-modal.js            AI "enhance this collection" flow
  pages/<page>/  page logic, split into cohesive files (home, profile, collection, picker, …)

css/             mirrors js/ — core/ (tokens, common, error) · components/ · pages/<page>/
data/            filterMenuData.json — static dropdown options with no backend endpoint yet
vendor/toastify/ the embedded notification library
assets/          images, icons, fonts
```

**Globals & load order matter.** Files share state through `window.*` and bare
top-level declarations rather than imports, so a script must not reference a
global that a later-loaded file declares. Always load `api.js` (defer) **before**
any page script that uses it.

### `js/core/api.js` — the single backend boundary

Everything network-related lives here (`window.MovieAPI`):

- Picks the API base URL (local vs deployed) automatically.
- Manages the **auth session** — stores the JWT + cached `currentUser` in `localStorage` and attaches `Authorization: Bearer` to requests.
- Normalises raw TMDB objects into the app's shape (`{ title, rating, popularity, releaseYear, posterPath }`) and prefixes bare image paths with the TMDB CDN base.
- Exposes the collections API (`getLibrary`, `listCollections`, `getCollection`, add/remove movie, create/rename/delete, …).

To point the whole app at a different backend, that's the one file to touch.

## Conventions

- **No frameworks or build tools.** Don't add React/Vite/Bootstrap/TypeScript.
- **Never use `alert` / `confirm` / `prompt`** — use toasts and in-page UI (a submission quality gate).
- Keep it responsive (mobile + desktop), avoid inline `style=""` and unjustified `!important`, and ship with no console errors in normal use.

## Deploy

Hosted on **GitHub Pages** at [`movieknight.site`](https://movieknight.site) (see
`CNAME`). It's static — pushing to the default branch publishes. GitHub Pages
auto-serves the root `404.html` for unknown paths.
