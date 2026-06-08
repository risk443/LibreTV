const ONLINE_KEY_PREFIX = 'online_device:';
const ONLINE_INDEX_KEY = 'online_devices_index';
const ONLINE_TTL_SECONDS = 150;
const ONLINE_WINDOW_MS = 120000;
const MAX_DEVICES = 200;

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-admin-password'
    }
  });
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function parseUserAgent(userAgent) {
  const ua = userAgent || '';
  const os = ua.match(/Android\s+([\d.]+)/i)
    ? `Android ${ua.match(/Android\s+([\d.]+)/i)[1]}`
    : ua.includes('iPhone') || ua.includes('iPad')
      ? 'iOS'
      : ua.includes('Windows')
        ? 'Windows'
        : ua.includes('Mac OS X')
          ? 'macOS'
          : ua.includes('Linux')
            ? 'Linux'
            : '未知系统';

  const browser = ua.includes('XueTvAndroid')
    ? '雪雪App WebView'
    : ua.includes('Edg/')
      ? 'Edge'
      : ua.includes('Chrome/')
        ? 'Chrome/WebView'
        : ua.includes('Safari/')
          ? 'Safari/WebView'
          : '未知浏览器';

  const deviceMatch = ua.match(/;\s*([^;()]+\sBuild\/[^;)]+)/i);
  const device = deviceMatch ? deviceMatch[1].replace(/\sBuild\/.*/, '').trim() : '未知设备';

  return { os, browser, device };
}

function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
}

function maskIp(ip) {
  if (!ip) return '';
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + ':***';
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.*`;
  return ip;
}

async function deviceIdFromRequest(request, body) {
  const ip = clientIp(request);
  const userAgent = request.headers.get('user-agent') || '';
  const clientId = body && typeof body.clientId === 'string' ? body.clientId.slice(0, 80) : '';
  return await sha256Hex(`${clientId}|${ip}|${userAgent}`);
}

async function getIndex(kv) {
  const raw = await kv.get(ONLINE_INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_DEVICES) : [];
  } catch {
    return [];
  }
}

async function putIndex(kv, ids) {
  const unique = [...new Set(ids)].slice(0, MAX_DEVICES);
  await kv.put(ONLINE_INDEX_KEY, JSON.stringify(unique), { expirationTtl: 86400 });
}

async function handleHeartbeat(context) {
  const { request, env } = context;
  const kv = env.LIBRETV_PROXY_KV;
  if (!kv) return jsonResponse({ ok: false, error: '未绑定 LIBRETV_PROXY_KV' }, 500);

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const now = Date.now();
  const userAgent = request.headers.get('user-agent') || '';
  const parsed = parseUserAgent(userAgent);
  const id = await deviceIdFromRequest(request, body);
  const existingRaw = await kv.get(`${ONLINE_KEY_PREFIX}${id}`);
  let existing = {};
  try {
    existing = existingRaw ? JSON.parse(existingRaw) : {};
  } catch {
    existing = {};
  }

  const record = {
    id,
    name: body.name || existing.name || parsed.device,
    device: body.device || existing.device || parsed.device,
    os: body.os || existing.os || parsed.os,
    browser: body.browser || existing.browser || parsed.browser,
    screen: body.screen || existing.screen || '',
    language: body.language || existing.language || '',
    path: body.path || '/',
    referrer: body.referrer || '',
    ip: maskIp(clientIp(request)),
    country: request.cf?.country || existing.country || '',
    city: request.cf?.city || existing.city || '',
    timezone: request.cf?.timezone || existing.timezone || '',
    userAgent: userAgent.slice(0, 300),
    firstSeen: existing.firstSeen || now,
    lastSeen: now,
    online: true
  };

  await kv.put(`${ONLINE_KEY_PREFIX}${id}`, JSON.stringify(record), { expirationTtl: ONLINE_TTL_SECONDS });
  const index = await getIndex(kv);
  await putIndex(kv, [id, ...index]);

  return jsonResponse({ ok: true, id, serverTime: now, ttl: ONLINE_TTL_SECONDS });
}

async function handleList(context) {
  const { request, env } = context;
  const kv = env.LIBRETV_PROXY_KV;
  if (!kv) return jsonResponse({ ok: false, error: '未绑定 LIBRETV_PROXY_KV' }, 500);

  const adminPassword = env.ADMIN_PASSWORD || env.PASSWORD || '';
  const provided = request.headers.get('x-admin-password') || new URL(request.url).searchParams.get('password') || '';
  if (adminPassword && provided !== adminPassword) {
    return jsonResponse({ ok: false, error: '密码错误' }, 401);
  }

  const now = Date.now();
  const index = await getIndex(kv);
  const records = [];
  const aliveIds = [];

  for (const id of index) {
    const raw = await kv.get(`${ONLINE_KEY_PREFIX}${id}`);
    if (!raw) continue;
    try {
      const record = JSON.parse(raw);
      record.online = now - record.lastSeen <= ONLINE_WINDOW_MS;
      record.lastSeenAgoSeconds = Math.max(0, Math.round((now - record.lastSeen) / 1000));
      records.push(record);
      aliveIds.push(id);
    } catch {}
  }

  await putIndex(kv, aliveIds);
  records.sort((a, b) => b.lastSeen - a.lastSeen);

  return jsonResponse({
    ok: true,
    serverTime: now,
    onlineWindowSeconds: Math.round(ONLINE_WINDOW_MS / 1000),
    onlineCount: records.filter(record => record.online).length,
    totalCount: records.length,
    devices: records
  });
}

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === 'OPTIONS') return jsonResponse({ ok: true });
  if (method === 'POST') return handleHeartbeat(context);
  if (method === 'GET') return handleList(context);
  return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
}
