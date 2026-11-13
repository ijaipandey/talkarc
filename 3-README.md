# Talkarc website source

This folder contains the Talkarc homepage and the local client project desk.

## Run locally

1. Install Node.js if it is not already installed.
2. Open a terminal in this folder.
3. Run `node preview.mjs`.
4. Open `http://127.0.0.1:3030/` in your browser.

The project desk saves client briefs in the current browser. Generated websites download as standalone HTML files.

## Included

- `index.html` — Talkarc agency website and ₹499 plan information.
- `agency.html` — client brief, website preview, FAQ helper preview, and project list.
- `assets/` — logo, styles, and browser scripts used by the site.
- `preview.mjs` — small local static-file server using only Node.js built-ins.

The generated FAQ helper answers from details entered in the brief. It is not an AI chatbot. Client data is local to the browser; this source does not include hosted storage, user accounts, domain setup, or deployment credentials.
