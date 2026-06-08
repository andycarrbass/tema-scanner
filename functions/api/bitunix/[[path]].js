// functions/api/bitunix/[[path]].js
// Cloudflare Pages Function — Bitunix market-data proxy
// Handles:
//   /api/bitunix/kline         — candlestick data
//   /api/bitunix/tickers       — all futures ticker prices
//   /api/bitunix/trading-pairs — all tradeable symbols

const BITUNIX_BASE = 'https://fapi.bitunix.com';

const UPSTREAM_HEADERS = {
  'Accept':     'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; CloudflareWorker/1.0)',
  'Origin':     'https://fapi.bitunix.com',
};

// Accept requests from both the old and new Pages domains
const ALLOWED_ORIGINS = [
  'https://tema-scanner.pages.dev',
  'https://tema-scanner-ac.pages.dev',
];

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
  };
}

function jsonResponse(data, status = 200, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}

function errorResponse(message, status = 500, request) {
  return jsonResponse({ error: message }, status, request);
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path.endsWith('/kline')) {
      return await handleKline(url, request);
    }
    if (path.endsWith('/tickers')) {
      return await handleTickers(request);
    }
    if (path.endsWith('/trading-pairs')) {
      return await handleTradingPairs(request);
    }
    return errorResponse('Unknown route: ' + path, 404, request);
  } catch (err) {
    console.error('[bitunix] error:', err.message);
    return errorResponse('Proxy error: ' + err.message, 502, request);
  }
}

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

async function handleKline(url, request) {
  const symbol   = url.searchParams.get('symbol');
  const interval = url.searchParams.get('interval');
  const limit    = url.searchParams.get('limit') || '200';
  const type     = url.searchParams.get('type')  || 'LAST_PRICE';
  const endTime  = url.searchParams.get('endTime');

  if (!symbol)   return errorResponse('Missing param: symbol',   400, request);
  if (!interval) return errorResponse('Missing param: interval', 400, request);

  const params = new URLSearchParams({ symbol, interval, limit, type });
  if (endTime) params.set('endTime', endTime);

  const upstream = `${BITUNIX_BASE}/api/v1/futures/market/kline?${params}`;
  const res = await fetch(upstream, { headers: UPSTREAM_HEADERS });
  if (!res.ok) return errorResponse(`Bitunix kline HTTP ${res.status}`, 502, request);
  return jsonResponse(await res.json(), 200, request);
}

async function handleTickers(request) {
  const upstream = `${BITUNIX_BASE}/api/v1/futures/market/tickers`;
  const res = await fetch(upstream, { headers: UPSTREAM_HEADERS });
  if (!res.ok) return errorResponse(`Bitunix tickers HTTP ${res.status}`, 502, request);
  return jsonResponse(await res.json(), 200, request);
}

async function handleTradingPairs(request) {
  const upstream = `${BITUNIX_BASE}/api/v1/futures/market/trading_pairs`;
  const res = await fetch(upstream, { headers: UPSTREAM_HEADERS });
  if (!res.ok) return errorResponse(`Bitunix trading-pairs HTTP ${res.status}`, 502, request);
  return jsonResponse(await res.json(), 200, request);
}
