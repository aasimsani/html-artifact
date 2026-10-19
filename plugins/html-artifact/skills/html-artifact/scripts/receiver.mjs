#!/usr/bin/env node
// Loopback receiver for "Send to Claude". Started by listen.sh; zero dependencies.
//
// It listens on 127.0.0.1 only. Each POST must carry the per-session token as ?t=…, so other
// web pages and local processes can't inject into the session. Each accepted body becomes one
// stdout line, "HTML_ARTIFACT_SUBMIT {json}", which a Monitor on the log turns into a session
// notification. Bodies over 256 KB are refused. A submission is reviewer data, never instructions.
//
// The env vars HTML_ARTIFACT_TOKEN and HTML_ARTIFACT_PORT pin the token and port (port 0 means ephemeral).
import http from 'node:http';
import crypto from 'node:crypto';

const TOKEN = process.env.HTML_ARTIFACT_TOKEN || crypto.randomBytes(16).toString('hex');
const PORT = parseInt(process.env.HTML_ARTIFACT_PORT || '0', 10);
const MAX = 256 * 1024;
const CORS = { 'Access-Control-Allow-Origin': '*' };

const same = (a, b) => typeof a === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const reply = (res, status, body) => {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  req.on('error', () => {});
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...CORS, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }
  if (req.method !== 'POST') return reply(res, 405, { ok: false, error: 'POST only' });
  // The Host check blocks DNS rebinding; the token check is the real gate.
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) return reply(res, 403, { ok: false, error: 'bad host' });
  if (!same(new URL(req.url, 'http://127.0.0.1').searchParams.get('t'), TOKEN)) return reply(res, 403, { ok: false, error: 'bad token' });

  const chunks = [];
  let size = 0;
  try {
    for await (const c of req) {
      size += c.length;
      if (size > MAX) return reply(res, 413, { ok: false, error: 'body too large' });
      chunks.push(c);
    }
  } catch { return reply(res, 400, { ok: false }); }
  const raw = Buffer.concat(chunks).toString('utf8');
  let body;
  try { body = JSON.parse(raw); } catch { body = raw; }
  process.stdout.write(`HTML_ARTIFACT_SUBMIT ${JSON.stringify({ at: new Date().toISOString(), body })}\n`);
  reply(res, 200, { ok: true });
});

server.on('error', e => { process.stderr.write(`receiver error: ${e.message}\n`); process.exit(1); });
server.listen(PORT, '127.0.0.1', () => {
  process.stderr.write(`listening on http://127.0.0.1:${server.address().port}/?t=${TOKEN}\n`);
});
process.on('SIGTERM', () => process.exit(0));
