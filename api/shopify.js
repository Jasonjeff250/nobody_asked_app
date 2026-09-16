const crypto = require('crypto');

function validShop(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(value);
}

function oauthState(shop) {
  const issuedAt = String(Date.now());
  const value = `${shop}.${issuedAt}`;
  const signature = crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET).update(value).digest('hex');
  return Buffer.from(`${value}.${signature}`).toString('base64url');
}

function validOauthState(state, shop) {
  try {
    const value = Buffer.from(state, 'base64url').toString();
    const parts = value.split('.');
    const issuedAt = parts[1];
    const signature = parts[2];
    const expected = crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET).update(`${parts[0]}.${issuedAt}`).digest('hex');
    return parts[0] === shop && signature === expected && Date.now() - Number(issuedAt) < 10 * 60 * 1000;
  } catch {
    return false;
  }
}

function encryptToken(token) {
  const key = crypto.createHash('sha256').update(process.env.TOKEN_ENCRYPTION_KEY).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join(':');
}

async function saveConnection(shop, accessToken, scope) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.TOKEN_ENCRYPTION_KEY) {
    throw new Error('Supabase storage is not configured.');
  }

  const result = await fetch(`${process.env.SUPABASE_URL}/rest/v1/shopify_connections?on_conflict=shop_domain`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify({ shop_domain: shop, access_token_encrypted: encryptToken(accessToken), scopes: scope || '' })
  });

  if (!result.ok) throw new Error('Supabase could not save the Shopify connection.');
}

async function saveEvents(events) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase storage is not configured.');
  }

  const result = await fetch(`${process.env.SUPABASE_URL}/rest/v1/behavior_events`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(events.map((event) => ({
      source: event.source,
      shop_domain: event.source.replace('shopify:', ''),
      user_id: event.user_id,
      session_id: event.session_id,
      timestamp: event.timestamp,
      page: event.page,
      event: event.event,
      device: event.device,
      product: event.product
    })))
  });

  if (!result.ok) throw new Error('Supabase could not save Shopify events.');
}

function shopifyEvent(event, shop) {
  const properties = event.properties || event;
  return {
    user_id: String(event.userId || event.user_id || properties.customer_id || 'anonymous'),
    session_id: String(event.context?.sessionId || properties.session_id || event.anonymousId || 'shopify-session'),
    timestamp: event.timestamp || new Date().toISOString(),
    page: String(properties.path || properties.url || properties.product_title || event.name || 'Shopify'),
    event: String(event.name || event.type || 'shopify_event'),
    device: String(event.context?.device?.type || properties.device || 'Unknown'),
    product: String(properties.product_id || properties.product_title || ''),
    source: `shopify:${shop}`
  };
}

module.exports = async function handler(request, response) {
  const action = request.query?.action || 'events';
  if (action === 'install') {
    const shop = String(request.query?.shop || '').toLowerCase();
    if (!validShop(shop)) return response.status(400).send('Use a valid your-store.myshopify.com domain.');
    if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET || !process.env.APP_URL) return response.status(503).send('Shopify is not configured.');
    const params = new URLSearchParams({
      client_id: process.env.SHOPIFY_API_KEY,
      scope: process.env.SHOPIFY_SCOPES || 'read_products,read_orders',
      redirect_uri: `${process.env.APP_URL}/api/shopify?action=callback`,
      state: oauthState(shop)
    });
    return response.redirect(`https://${shop}/admin/oauth/authorize?${params}`);
  }

  if (action === 'callback') {
    const shop = String(request.query?.shop || '').toLowerCase();
    const code = request.query?.code;
    const state = String(request.query?.state || '');
    if (!validShop(shop) || !code || !validOauthState(state, shop) || !process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
      return response.status(400).send('Incomplete Shopify OAuth callback.');
    }
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: process.env.SHOPIFY_API_KEY, client_secret: process.env.SHOPIFY_API_SECRET, code })
    });
    if (!tokenResponse.ok) return response.status(502).send('Shopify authorization failed.');
    const token = await tokenResponse.json();
    try {
      await saveConnection(shop, token.access_token, token.scope);
    } catch (error) {
      console.error('Shopify connection storage failed:', error.message);
      return response.status(503).send('Shopify connected, but Supabase storage is not configured.');
    }
    return response.status(200).send('<h2>Shopify connected</h2><p>Your store connection was saved. FrictionMap can now receive storefront events.</p>');
  }

  if (request.method !== 'POST') return response.status(405).json({ ok: false, error: 'Use POST for Shopify events.' });
  const shop = String(request.headers['x-shopify-shop-domain'] || request.body?.shop || 'unknown');
  const events = Array.isArray(request.body) ? request.body : [request.body || {}];
  const normalizedEvents = events.slice(0, 100).map((event) => shopifyEvent(event, shop));
  try {
    await saveEvents(normalizedEvents);
  } catch (error) {
    console.error('Shopify event storage failed:', error.message);
    return response.status(503).json({ ok: false, error: 'Shopify connected, but event storage is not configured.' });
  }
  return response.status(200).json({ ok: true, stored: normalizedEvents.length });
};