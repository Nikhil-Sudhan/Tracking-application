// Temporary phone testing: expose only the authenticated device API.
// Keep the development dashboard and its local sign-in on the laptop.
import http from 'node:http';
import { appendFileSync } from 'node:fs';
const upstream = 'http://127.0.0.1:5173';
http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '') || '/';
  res.on('finish', () => appendFileSync('.sites-runtime/phone-requests.log', `${new Date().toISOString()} ${req.method} ${['/', '/health', '/api/device'].includes(pathname) ? pathname : '[other path]'} ${res.statusCode}\n`));
  res.setHeader('Cache-Control', 'no-store');
  if (pathname === '/' && req.method === 'GET') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>GroSuite test server</title><h1>GroSuite test server is reachable</h1><p>Use this page\'s address as the Company address in GroSuite Field. Do not add /health or /api/device.</p><p><a href="/health">Check server health</a></p>');
  }
  if (pathname === '/health' && req.method === 'GET') {
    try {
      const check = await fetch(upstream + '/api/device');
      res.writeHead(check.status === 401 ? 200 : 503, {'Content-Type': 'application/json'});
      return res.end(JSON.stringify({status: check.status === 401 ? 'ok' : 'unavailable'}));
    } catch { res.writeHead(503); return res.end(); }
  }
  if (pathname !== '/api/device' || !['GET', 'POST'].includes(req.method)) {
    res.writeHead(404); return res.end('Not found');
  }
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 262144) { res.writeHead(413); return res.end(); }
      chunks.push(chunk);
    }
    const response = await fetch(upstream + '/api/device', {
      method: req.method,
      headers: {'Content-Type': 'application/json', Authorization: req.headers.authorization || ''},
      ...(req.method === 'POST' ? {body: Buffer.concat(chunks)} : {}),
      redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    res.writeHead(response.status, {'Content-Type': 'application/json'});
    res.end(await response.text());
  } catch { res.writeHead(502); res.end('{"error":"Laptop test server unavailable"}'); }
}).listen(8788, '127.0.0.1', () => console.log('Phone test API: http://127.0.0.1:8788'));
