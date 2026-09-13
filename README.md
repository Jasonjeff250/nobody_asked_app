# FrictionMap — event intelligence dashboard

A lightweight browser-based app for analyzing behavioral event data and surfacing friction patterns in user journeys.

## Run it
Open `index.html` in a modern browser, or host the folder with a simple static server such as:

python -m http.server 8000

Then open http://localhost:8000 in your browser.

## What is included
- Default loaded sample dataset from `sample_events.csv`
- CSV upload flow inside the app
- Required-field validation for event datasets
- Auto-detection for common behavioral event aliases
- Discovery dashboard, analytics and journey views
- Lightweight local heuristics for common friction signals
- Publish-ready static front end that can be deployed to Netlify, Vercel, GitHub Pages, or any static host

## Accepted data format
The app accepts UTF-8 CSV files with one event per row.

Required columns:
- user_id
- session_id
- timestamp
- page
- event
- device

Optional columns:
- product

Example:

user_id,session_id,timestamp,page,event,device,product
U1,S1,2026-09-09T10:00:00Z,Home,page_view,Mobile,Wireless Headset
U1,S1,2026-09-09T10:00:20Z,Product,click,Mobile,Wireless Headset
U1,S1,2026-09-09T10:00:40Z,Cart,click,Mobile,Wireless Headset
U1,S1,2026-09-09T10:01:40Z,Checkout,click,Mobile,Wireless Headset

## Important
This is a client-side product prototype ready for hosting and further backend integration. It does not store data outside the browser session unless you add a backend later.
