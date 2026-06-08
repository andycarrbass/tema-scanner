// Cloudflare Pages Function — /sheets proxy
//
// Two roles:
// 1. Legacy: pass-through for Apps Script JSONP (called by sheetsJsonp() in index.html)
// 2. Market data: proxy for Bitunix API (called by BitunixAdapter._fetchMarket())
//
// For Bitunix calls: client passes ?url=<encoded Bitunix URL>
// Allowlist guard: only fapi.bitunix.com/api/v1/futures/market/* is permitted.
// This prevents /sheets becoming an open proxy.

const BITUNIX_HOST         = 'fapi.bitunix.com';
const BITUNIX_PATH_PREFIX  = '/api/v1/futures/market/';

function isAllowedBitunixUrl(target) {
  try {
    const u = new URL(target);
    return u.hostname === BITUNIX_HOST &&
           u.pathname.startsWith(BITUNIX_PATH_PREFIX);
  } catch (_) {
    return false;
  }
}

export async function onRequest(context) {
  const url    = new URL(context.request.url);
  const target = url.searchParams.get('url');

  // No ?url= param — this is a bare /sheets request (not used by the app)
  if (!target) {
    return new Response(JSON.stringify({ error: 'missing url param' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Allowlist check — only Bitunix market endpoints may be proxied
  if (!isAllowedBitunixUrl(target)) {
    console.error('[CF/sheets] blocked proxy attempt to:', target);
    return new Response(JSON.stringify({ error: 'url_not_allowed', message: 'Only Bitunix market endpoints may be proxied via /sheets' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const resp = await fetch(target, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'TEMA-Desk/3.0' },
      cf: { cacheTtl: 0 },
    });

    const body = await resp.json();

    // Surface Bitunix API-level errors
    if (body?.code !== undefined && body.code !== 0) {
      console.error('[CF/sheets] Bitunix API error:', JSON.stringify(body).slice(0, 500));
      return new Response(
        JSON.stringify({ error: 'bitunix_api_error', code: body.code, msg: body.msg || body.message || 'unknown' }),
        { status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (e) {
    console.error('[CF/sheets] proxy error:', e.message, 'target:', target);
    return new Response(
      JSON.stringify({ error: 'proxy_error', message: e.message }),
      { status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
}
