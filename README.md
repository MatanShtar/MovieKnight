# MovieKnight

A movie-discovery web app - browse a grid of films, filter and sort them, and organize movies into collections on a profile page.

Built as a static site with plain HTML, CSS, and vanilla JavaScript. No framework, no build step. This is a school project and is **front-end only** for now: data comes from static JSON files and login is mocked with `localStorage`.

## Running it

Serve the folder over HTTP (opening the files directly won't work, since the pages load data with `fetch()`):

```powershell
python -m http.server 8000   # then visit http://localhost:8000/index.html
```

The entry point is `index.html`. Other pages: `login.html`, `signup.html`, `profile.html`.

To log in, use **`admin` / `1234`**, or click "continue as guest".

## Structure

```
*.html        # one file per page (home, login, signup, profile)
css/          # common.css + one stylesheet per page
js/           # common.js + one script per page, plus toast.js & validation.js
data/         # movies, collections, and filter options as JSON
assets/       # fonts, logos, icons, posters
vendor/       # Toastify.js (toast notifications)
```
