# FrictionMap — event intelligence dashboard

A lightweight browser-based app for analyzing behavioral event data and surfacing friction patterns in user journeys.

## Run it
Open `index.html` in a modern browser, or host the folder with a simple static server such as:

python -m http.server 8000

Then open http://localhost:8000 in your browser.

For a deployed backend, this project is configured for Netlify. Netlify uses the functions in `netlify/functions/`; the `/api/*` redirect keeps the Shopify URLs working.

## What is included
- Default loaded sample dataset from `sample_events.csv`
- CSV upload flow inside the app
- Required-field validation for event datasets
- Auto-detection for common behavioral event aliases
- Discovery dashboard, analytics and journey views
- Lightweight local heuristics for common friction signals
- Shopify connection in the Systems view
- Netlify backend for Shopify OAuth and event ingestion

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

## Shopify setup

In Netlify, open **Site configuration → Environment variables** and add:

- `APP_URL`: your deployed Netlify URL
- `SHOPIFY_API_KEY`: Shopify Partner app client ID
- `SHOPIFY_API_SECRET`: Shopify Partner app secret
- `SHOPIFY_SCOPES`: for example `read_products,read_orders`
- `SUPABASE_URL`: your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: server-only Supabase secret
- `TOKEN_ENCRYPTION_KEY`: a private encryption secret

Create the `shopify_connections` table in Supabase before connecting a store. Set the Shopify app callback URL to:

`https://your-site.netlify.app/api/shopify?action=callback`

Then open Systems in FrictionMap, enter the store domain, and click **Connect Shopify**. Shopify will ask the store owner to approve access. After approval, the encrypted token is saved in Supabase.

Create this event table before enabling Shopify storefront events:

```sql
create table behavior_events (
	id uuid primary key default gen_random_uuid(),
	source text not null,
	shop_domain text,
	user_id text,
	session_id text,
	timestamp timestamptz not null,
	page text,
	event text,
	device text,
	product text,
	created_at timestamptz default now()
);
```

Shopify storefront events posted to `/api/shopify` are stored in `behavior_events`.

### Netlify setup

Deploy the repository with `netlify.toml` at the project root. After deployment, use `https://your-site.netlify.app/api/shopify?action=install&shop=your-store.myshopify.com` for Shopify installation.

For sign-up confirmation emails, add these variables in Netlify under **Site configuration → Environment variables**. They are used by the `auth` function and must not be committed to the repository:

- `SMTP_USER`: the email account used to send messages
- `SMTP_PASS`: an SMTP password or Gmail app password
- `SMTP_HOST`: optional, defaults to `smtp.gmail.com`
- `SMTP_PORT`: optional, defaults to `587`
- `SMTP_SECURE`: optional, set to `true` only for TLS-on-connect SMTP servers
- `SENDER_EMAIL`: optional, the verified From address (defaults to `SMTP_USER`)

Shopify credentials and Supabase secrets must remain server-side. The CSV workflow remains local and unchanged.
