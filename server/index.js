import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import mercadopago from 'mercadopago';
import { WebSocketServer } from 'ws';

// Load environment variables as early as possible
dotenv.config();

const app = express();

// ========================================
// CORS - MIDDLEWARE MANUAL (ADICIONADO NO INÍCIO)
// ========================================
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://app-forneiro-eden.aezap.site');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
});


// Simple request logger to diagnose if requests (including OPTIONS) reach this app
app.use((req, res, next) => {
  try {
    const now = new Date().toISOString();
    const origin = req.headers && req.headers.origin ? req.headers.origin : '-';
    const proto = req.headers['x-forwarded-proto'] || req.protocol || '-';
    console.log(`[REQ] ${now} ${req.method} ${req.originalUrl} origin=${origin} proto=${proto}`);
  } catch (e) { /* ignore logging errors */ }
  return next();
});

// EARLY CORS: set CORS headers and short-circuit OPTIONS before any other middleware.
// This is intentionally aggressive to ensure preflight requests are answered even
// when proxies or later middleware might interfere. In production you can tighten
// this by setting FRONTEND_ORIGIN to a specific origin.
app.use((req, res, next) => {
  try {
    const originHeader = req.headers && req.headers.origin ? String(req.headers.origin) : (FRONTEND_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Origin', originHeader);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-idempotency-key,x-hub-signature-256,x-hub-signature,x-signature,x-driven-signature,x-admin-token');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  } catch (e) { /* ignore */ }
  return next();
});

// Enforce FRONTEND_ORIGIN in production (do not allow wildcard)
let FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || (process.env.NODE_ENV === 'production' ? null : '*');
// normalize value (remove trailing slash)
if (FRONTEND_ORIGIN) FRONTEND_ORIGIN = String(FRONTEND_ORIGIN).replace(/\/$/, '');
if (!FRONTEND_ORIGIN && process.env.NODE_ENV === 'production') {
  console.error('FRONTEND_ORIGIN must be set in production to restrict CORS. Aborting.');
  process.exit(1);
}


// Allow CORS by reflecting the request origin. This avoids preflight failures
// when the request origin matches the frontend host but small mismatches occur
// (use a stricter policy in production if desired).
const corsOptions = {
  origin: true, // reflect request origin
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','x-idempotency-key','x-hub-signature-256','x-hub-signature','x-signature','x-driven-signature','x-admin-token'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
// Ensure preflight requests are handled globally
app.options('*', cors(corsOptions));

// Explicitly handle OPTIONS preflight for the specific PIX endpoint to be
// 100% sure a preflight receives CORS headers (some proxies may intercept
// OPTIONS for other paths). This should run before any redirect middleware.
app.options('/api/generate-pix', (req, res) => {
  try {
    const originHeader = req.headers && req.headers.origin ? String(req.headers.origin) : (FRONTEND_ORIGIN || '*');
    console.log('Received preflight OPTIONS for /api/generate-pix from', originHeader);
    res.setHeader('Access-Control-Allow-Origin', originHeader);
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-idempotency-key,x-hub-signature-256,x-hub-signature,x-signature,x-driven-signature,x-admin-token');
    res.setHeader('Vary', 'Origin');
    return res.sendStatus(204);
  } catch (e) {
    return res.sendStatus(204);
  }
});

// Diagnostic endpoint: returns observed headers and echoes CORS headers so you can
// call it from browser / curl to verify proxy behavior and preflight handling.
app.all('/api/debug-cors', (req, res) => {
  const originHeader = req.headers && req.headers.origin ? String(req.headers.origin) : (FRONTEND_ORIGIN || '*');
  console.log('DEBUG-CORS:', req.method, 'origin=', originHeader);
  // set same CORS headers we use for other endpoints
  res.setHeader('Access-Control-Allow-Origin', originHeader);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-idempotency-key,x-hub-signature-256,x-hub-signature,x-signature,x-driven-signature,x-admin-token');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.sendStatus(204);

  return res.json({ ok: true, method: req.method, originReceived: originHeader, headers: req.headers });
});

// Explicitly handle OPTIONS preflight for /api/* early to ensure required CORS headers
app.use('/api', (req, res, next) => {
  if (req.method === 'OPTIONS') {
    const originHeader = req.headers && req.headers.origin ? String(req.headers.origin) : (FRONTEND_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Origin', originHeader);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-idempotency-key,x-hub-signature-256,x-hub-signature,x-signature,x-driven-signature,x-admin-token');
    res.setHeader('Vary', 'Origin');
    return res.sendStatus(204);
  }
  return next();
});

// Safety: ensure API responses always have CORS header (fallback)
app.use((req, res, next) => {
  try {
    const hdr = res.getHeader && res.getHeader('Access-Control-Allow-Origin');
    if (!hdr) {
      // If the request provides an Origin header, echo it back; otherwise fallback to configured FRONTEND_ORIGIN or '*'.
      const originHeader = req.headers && req.headers.origin ? String(req.headers.origin) : (FRONTEND_ORIGIN || '*');
      res.setHeader('Access-Control-Allow-Origin', originHeader);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-idempotency-key,x-hub-signature-256,x-hub-signature,x-signature,x-driven-signature,x-admin-token');
    }
  } catch (e) { /* ignore */ }
  return next();
});


app.use(express.json()); // Processa apenas Content-Type: application/json
app.use(express.urlencoded({ extended: true }));

// Redirect HTTP to HTTPS in production when behind a proxy/load-balancer
app.set('trust proxy', true);
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    if (proto && String(proto).includes('http') && !String(proto).includes('https')) {
      const host = req.headers.host;
      return res.redirect(301, `https://${host}${req.originalUrl}`);
    }
    return next();
  });
}

// ========================================
// CACHE HEADERS MIDDLEWARE - Cache Busting Strategy
// ========================================
// This middleware implements a smart caching strategy:
// 1. HTML files (index.html) & version.json: No-cache (always check with server)
// 2. JS/CSS with hash in filename: Cache for 1 year (safe to cache long-term)
// 3. Other assets: Cache for 1 week with revalidation
app.use((req, res, next) => {
  const pathname = req.path || '';
  
  // No cache for critical files that should always be fresh
  if (pathname === '/' || pathname === '/index.html' || pathname.includes('version.json') || pathname.includes('manifest.json')) {
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    return next();
  }
  
  // Cache busted assets: Files with hash in name (e.g., main.a1b2c3d.js) can be cached long-term
  // because the filename changes whenever the content changes
  if (pathname.match(/\.[a-f0-9]{8}\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2)$/i)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year
    return next();
  }
  
  // Service Worker should not be cached for long
  if (pathname === '/sw.js') {
    res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate'); // 1 hour
    return next();
  }
  
  // Default: Short cache with revalidation
  res.setHeader('Cache-Control', 'public, max-age=604800, must-revalidate'); // 1 week
  return next();
});

// Admin auth middleware: requires ADMIN_TOKEN env var. Supports Authorization: Bearer <token> or x-admin-token header.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
function adminAuthMiddleware(req, res, next) {
  // If no ADMIN_TOKEN configured, allow in non-production (dev) for convenience
  if (!ADMIN_TOKEN && process.env.NODE_ENV !== 'production') return next();

  const authHeader = req.headers.authorization || '';
  const bearer = String(authHeader).startsWith('Bearer ') ? String(authHeader).slice(7).trim() : null;
  const headerToken = req.headers['x-admin-token'] || null;
  const token = bearer || headerToken;

  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized: admin token required' });
  }
  return next();
}

// Admin logo storage (simple file-backed store). Stores a base64 data + mime
// so the frontend admin can upload a logo and the server will serve it at
// /api/admin/logo for use in the PWA manifest and installs.
const LOGO_DIR = path.join(process.cwd(), 'data');
const LOGO_STORE = path.join(LOGO_DIR, 'logo.json');

// Ensure data directory exists
(async () => {
  try { await fs.promises.mkdir(LOGO_DIR, { recursive: true }); } catch (e) { /* ignore */ }
})();

app.post('/api/admin/logo', adminAuthMiddleware, async (req, res) => {
  try {
    const { dataUrl } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string') return res.status(400).json({ error: 'dataUrl is required' });

    const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!m) return res.status(400).json({ error: 'invalid dataUrl' });

    const mime = m[1];
    const b64 = m[2];

    await fs.promises.writeFile(LOGO_STORE, JSON.stringify({ mime, b64 }, null, 2), 'utf8');

    // Also write a copy to public so the manifest/favicon can use it directly.
    try {
      const publicPath = path.join(process.cwd(), 'public', 'logotipoaezap.ico');
      const buf = Buffer.from(b64, 'base64');
      await fs.promises.writeFile(publicPath, buf);
      console.log('Wrote public logo to', publicPath);
    } catch (writeErr) {
      console.warn('Failed to write public logo file:', writeErr);
      // Not fatal; continue
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('Failed to save admin logo:', err);
    return res.status(500).json({ error: 'failed to save logo' });
  }
});

app.get('/api/admin/logo', adminAuthMiddleware, async (req, res) => {
  try {
    const exists = await fs.promises.stat(LOGO_STORE).then(() => true).catch(() => false);
    if (!exists) {
      // Fallback to public placeholder
      const placeholder = path.join(process.cwd(), 'public', 'placeholder.svg');
      if (await fs.promises.stat(placeholder).then(() => true).catch(() => false)) {
        const data = await fs.promises.readFile(placeholder);
        res.setHeader('Content-Type', 'image/svg+xml');
        return res.send(data);
      }
      return res.status(404).end();
    }

    const txt = await fs.promises.readFile(LOGO_STORE, 'utf8');
    const obj = JSON.parse(txt || '{}');
    if (!obj || !obj.b64 || !obj.mime) return res.status(404).end();
    const buffer = Buffer.from(obj.b64, 'base64');
    res.setHeader('Content-Type', obj.mime);
    return res.send(buffer);
  } catch (err) {
    console.error('Failed to serve admin logo:', err);
    res.status(500).end();
  }
});


// Access token (MANDATORY in production). Do NOT keep a hardcoded fallback.
const ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;
// Log token type (masked) for diagnostics (do not print the full secret)
try {
  const t = String(ACCESS_TOKEN || '');
  const type = t.startsWith('TEST-') ? 'TEST' : (t.startsWith('APP_USR-') ? 'LIVE' : 'UNKNOWN');
  const masked = t ? `${t.slice(0,8)}...${t.slice(-6)}` : '<no-token>';
  console.log('Using Mercado Pago token:', masked, 'type:', type);
} catch (e) {}
if (!ACCESS_TOKEN) {
  console.error('ERROR: MERCADO_PAGO_ACCESS_TOKEN is not set. Set it in the environment or .env file. Aborting startup.');
  process.exit(1);
}

// Configure mercadopago SDK
mercadopago.configurations.setAccessToken(ACCESS_TOKEN);

// Backward-compatible: also support MP_ACCESS_TOKEN env var requested by new endpoints
if (!process.env.MP_ACCESS_TOKEN && process.env.MERCADO_PAGO_ACCESS_TOKEN) {
  process.env.MP_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;
}
// If MP_ACCESS_TOKEN is provided use it for new routes
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || ACCESS_TOKEN;
if (MP_ACCESS_TOKEN && MP_ACCESS_TOKEN !== ACCESS_TOKEN) {
  try { mercadopago.configurations.setAccessToken(MP_ACCESS_TOKEN); } catch (e) { /* ignore */ }
}

// Validate token at startup: call a light MP endpoint to verify credentials. If invalid, exit with a helpful message.
async function validateMpToken() {
  try {
  const res = await fetch('https://api.mercadopago.com/users/me', { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } });
    if (res.status === 200) {
      console.log('Mercado Pago token validated (OK)');
      return true;
    }
    const text = await res.text();
    console.error('Mercado Pago token validation failed. Status:', res.status, 'Response:', text);
    if (res.status === 401) {
      console.error('Unauthorized: check if the token is live vs test and that it is correct for the intended environment.');
    }
    if (res.status === 404) {
      console.error('Received 404 from Mercado Pago /v1/users/me — this can happen if the access token is invalid, belongs to a different account, or the endpoint is not available for that token type.');
  console.error('Try validating the token manually with: curl -H "Authorization: Bearer <token>" https://api.mercadopago.com/users/me');
    }
    return false;
  } catch (e) {
    console.error('Failed to validate Mercado Pago token at startup:', e);
    return false;
  }
}

// In-memory map for simulated payment statuses (dev)
const simulatedPayments = new Map();
// Dev auto-approve configuration (seconds). 0 = disabled
const DEV_AUTO_APPROVE_SECONDS = Number(process.env.DEV_AUTO_APPROVE_SECONDS || '0');
// Simple file-based store for payments (demo). In production, replace with a real DB.
const PAYMENTS_DB = path.join(process.cwd(), 'payments.json');

async function readPaymentsDb() {
  try {
    const txt = await fs.promises.readFile(PAYMENTS_DB, 'utf8');
    return JSON.parse(txt || '{}');
  } catch (e) {
    return {};
  }
}

async function writePaymentsDb(data) {
  await fs.promises.writeFile(PAYMENTS_DB, JSON.stringify(data, null, 2), 'utf8');
}

async function savePaymentRecord(id, record) {
  const db = await readPaymentsDb();
  db[id] = Object.assign(db[id] || {}, record, { updatedAt: new Date().toISOString() });
  await writePaymentsDb(db);
}

async function getPaymentRecord(id) {
  const db = await readPaymentsDb();
  return db[id] || null;
}

// Helper to call Mercado Pago REST API
async function mpCreatePayment(body, idempotencyKey) {
  const res = await fetch('https://api.mercadopago.com/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'x-idempotency-key': idempotencyKey || ''
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  let data
  try { data = JSON.parse(text) } catch(e) { data = { raw: text } }
  return { status: res.status, data };
}

// Helper: generate a local PIX payload + PNG. Used for dev fallback and dev-only endpoint.
async function generateLocalPixPayload(orderId, amount) {
  try {
    const sanitizedAmount = Number(amount) || 0;
    // A simple deterministic pseudo-pix payload for testing only
    const localCode = `00020126360014BR.GOV.BCB.PIX01${String(orderId).replace(/[^0-9]/g,'').slice(-14)}52040000530398654${String(Math.round(sanitizedAmount*100)).padStart(3,'0')}5802BR5925Empresa6009Cidade6108${String(Date.now()).slice(-8)}62070503***6304ABCD`;
    const qrPng = await QRCode.toDataURL(localCode, { width: 300 });
    const devId = `DEV-${Date.now()}`;
    // store simulated payment
    simulatedPayments.set(devId, { status: 'pending', createdAt: Date.now() });
    try {
      await savePaymentRecord(devId, { id: devId, orderId, amount: sanitizedAmount, status: 'pending', createdAt: new Date().toISOString(), dev: true, fallback: true });
    } catch (e) { /* ignore */ }
    return { pix: localCode, qrBase64: qrPng.replace(/^data:image\/png;base64,/, ''), paymentId: devId };
  } catch (e) {
    throw e;
  }
}

// Dev-only endpoint to generate a local PIX QR (bypass Mercado Pago).
// Enabled by default in non-production. To allow in production set ALLOW_DEV_PIX_ENDPOINT=1
app.post('/api/generate-pix-dev', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_PIX_ENDPOINT !== '1') {
      return res.status(403).json({ error: 'Dev endpoint disabled in production' });
    }
    const amount = req.body.amount || req.body.transaction_amount || 0;
    const orderId = req.body.orderId || (`DEV-${Date.now()}`);
    console.log('DEV PIX endpoint requested for', orderId, amount);
    const { pix, qrBase64, paymentId } = await generateLocalPixPayload(orderId, amount);
    return res.json({ qrCodeBase64: qrBase64, pixCopiaECola: pix, paymentId, fallback: true });
  } catch (err) {
    console.error('/api/generate-pix-dev error', err);
    return res.status(500).json({ error: 'failed to generate dev pix', detail: String(err) });
  }
});

// Main endpoint: only POST is allowed to create PIX payments
app.post('/api/generate-pix', async (req, res) => {
  try {
    // Suportar ambos os formatos de dados
    let amount, orderId, orderData;
    
    if (req.body.amount && req.body.orderId) {
      ({ amount, orderId, orderData } = req.body);
    } else if (req.body.transaction_amount && req.body.description) {
      amount = req.body.transaction_amount;
      orderId = req.body.description.replace('Pedido #', '');
      orderData = req.body.orderData;
    } else {
      return res.status(400).json({ 
        error: 'Dados inválidos',
        detail: 'amount/orderId ou transaction_amount/description são obrigatórios'
      });
    }

    if (!amount || !orderId) {
      return res.status(400).json({ 
        error: 'Dados inválidos',
        detail: 'amount e orderId são obrigatórios'
      });
    }

    // Build payment payload and ensure payer contains first_name, last_name and a valid email
    // We generate a fake email using customer name and phone to satisfy Mercado Pago requirements
    // without asking the user for a real email (format: nomeformatado.telefone@seudominio.com)
    const domain = process.env.MP_FAKE_EMAIL_DOMAIN || 'seudominio.com';

    // Try multiple locations for customer name/phone (frontend may send orderData.customer)
    const rawName = (req.body.payer && (req.body.payer.first_name || req.body.payer.name))
      || (req.body.orderData && req.body.orderData.customer && req.body.orderData.customer.name)
      || (req.body.orderData && req.body.orderData.customer && req.body.orderData.customer.fullName)
      || req.body.name
      || '';

    const rawPhone = (req.body.payer && (req.body.payer.phone || req.body.payer.phone_number))
      || (req.body.orderData && req.body.orderData.customer && req.body.orderData.customer.phone)
      || req.body.phone
      || '';

    // Normalize name: remove accents and extra spaces
    function normalizeName(s) {
      try {
        return String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
      } catch (e) {
        // fallback for older Node: remove common accents range
        return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      }
    }

    const cleanedName = normalizeName(rawName || '');
    const nameParts = cleanedName.split(/\s+/).filter(Boolean);

    // Determine first and last name according to rules
    const firstName = nameParts.length > 0 ? nameParts[0] : '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Cliente';

    // Prepare phone digits only for email local-part
    const phoneDigits = String(rawPhone || '').replace(/[^0-9]/g, '') || String(Date.now()).slice(-9);

    // Format local name for email: use only the first name, lowercase, remove non-alphanum, replace spaces with dots
    const formattedLocalName = String(firstName || 'cliente')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '')
      .replace(/^\.+|\.+$/g, '') || 'cliente';

    // Construct fake email in the required format: nomeformatado.telefone@seudominio.com
    const fakeEmail = `${formattedLocalName}.${phoneDigits}@${domain}`;

    const paymentData = {
      transaction_amount: Math.round(Number(amount) * 100) / 100, // Corrigir decimais
      description: `Pedido #${orderId}`,
      payment_method_id: 'pix',
      payer: {
        // Provide explicit first_name and last_name fields and the generated fake email.
        // Mercado Pago requires payer.email for PIX; we generate a deterministic fake one so
        // the payment won't be rejected while preserving user privacy.
        first_name: firstName || 'Cliente',
        last_name: lastName || 'Cliente',
        email: (req.body.payer && req.body.payer.email) || fakeEmail,
        identification: {
          type: req.body.payer?.identification?.type || 'CPF',
          number: req.body.payer?.identification?.number || '19119119100'
        }
      }
    }

    console.log('Criando pagamento com dados:', JSON.stringify(paymentData, null, 2));

    const idempotencyKey = req.headers['x-idempotency-key'] || `idemp-${orderId}-${Date.now()}`;

    // If using test token, create a simulated payment and return QR generated locally
    if (ACCESS_TOKEN && ACCESS_TOKEN.startsWith('TEST-')) {
      console.log('DEV: criando pagamento simulado para', orderId);
      const pix = '00020126360014BR.GOV.BCB.PIX0114+55119999999952040000530398654045.005802BR5925Empresa de Teste6009Sao Paulo61080540900062070503***6304ABCD';
      const qrPng = await QRCode.toDataURL(pix, { width: 300 });
      const devId = `DEV-${Date.now()}`;
      simulatedPayments.set(devId, { status: 'pending', createdAt: Date.now() });
      
      try {
        await savePaymentRecord(devId, { id: devId, orderId, amount, status: 'pending', createdAt: new Date().toISOString(), dev: true });
      } catch (saveError) {
        console.warn('Erro ao salvar registro DEV:', saveError.message);
      }
      
      if (DEV_AUTO_APPROVE_SECONDS > 0) {
        setTimeout(() => {
          simulatedPayments.set(devId, { status: 'approved', createdAt: Date.now() });
          console.log(`DEV: payment ${devId} auto-approved after ${DEV_AUTO_APPROVE_SECONDS}s`);
          try {
            savePaymentRecord(devId, { id: devId, orderId, amount, status: 'approved', createdAt: new Date().toISOString(), dev: true });
            tryBroadcastPayment({ id: devId, orderId, amount, status: 'approved', simulated: true });
          } catch (e) {
            console.warn('save dev approve failed', e);
          }
        }, DEV_AUTO_APPROVE_SECONDS * 1000);
      }

      return res.json({ qrCodeBase64: qrPng.replace(/^data:image\/png;base64,/, ''), pixCopiaECola: pix, paymentId: devId });
    }

    // Use official SDK to create payment
    try {
      const mpBody = {
        ...paymentData,
        external_reference: orderId
      };
      const mpRes = await mercadopago.payment.create(mpBody, { headers: { 'x-idempotency-key': idempotencyKey } });
      const data = mpRes && mpRes.body ? mpRes.body : mpRes;
      console.log('MP SDK create result:', {
        id: data.id,
        status: data.status,
        hasQRCode: !!(data.point_of_interaction?.transaction_data?.qr_code_base64),
        hasPixCode: !!(data.point_of_interaction?.transaction_data?.qr_code)
      });

      if (data && data.status && Number(data.status) >= 400) {
        console.error('Mercado Pago returned error status', data.status, data);
        return res.status(Number(data.status)).json({ error: 'Mercado Pago error', detail: data });
      }

      const transaction_data = data.point_of_interaction && data.point_of_interaction.transaction_data;
      if (!transaction_data || !(transaction_data.qr_code_base64 || transaction_data.qr_code)) {
        console.error('No QR returned from MP create');
        return res.status(500).json({ error: 'QR code not returned by Mercado Pago' });
      }

      const qr_base64 = transaction_data.qr_code_base64;
      const qr_code = transaction_data.qr_code;

      const paymentId = data.id || (data && data.transaction_details && data.transaction_details.id) || null;
      
      // Salvar mesmo se rejeitado, mas tratar erro de arquivo
      try {
        await savePaymentRecord(String(paymentId || Date.now()), { 
          id: String(paymentId || ''), 
          orderId, 
          amount, 
          status: data.status || 'pending', 
          raw: data, 
          createdAt: new Date().toISOString(), 
          dev: false, 
          orderData: orderData || null 
        });
      } catch (saveError) {
        console.warn('Erro ao salvar registro de pagamento:', saveError.message);
      }

      tryBroadcastPayment({ id: String(paymentId || ''), orderId, amount, status: data.status || 'pending' });

      // Log da resposta que será enviada
      console.log('🎯 Enviando resposta:', {
        qrCodeBase64: qr_base64 ? `Presente (${qr_base64.length} chars)` : 'Ausente',
        pixCopiaECola: qr_code ? `Presente (${qr_code.length} chars)` : 'Ausente',
        paymentId: paymentId,
        status: data.status
      });

      // Retornar QR code mesmo se status for rejeitado (para teste)
      return res.json({ 
        qrCodeBase64: qr_base64, 
        pixCopiaECola: qr_code, 
        paymentId: paymentId,
        status: data.status,
        statusDetail: data.status_detail 
      });
      
    } catch (sdkErr) {
      console.error('Mercado Pago SDK create error', sdkErr && sdkErr.message ? sdkErr.message : sdkErr);

      const sdkMsg = String((sdkErr && sdkErr.message) || sdkErr || '').toLowerCase();

      // If SDK reports account not enabled for PIX QR rendering, provide a clear message
      if (sdkMsg.includes('collector user') && sdkMsg.includes('key') && sdkMsg.includes('qr')) {
        // Optional local fallback for testing: set ENABLE_LOCAL_PIX_FALLBACK=1 in env to allow local QR generation
        if (process.env.ENABLE_LOCAL_PIX_FALLBACK === '1') {
          console.log('ENABLE_LOCAL_PIX_FALLBACK is set — generating local PIX QR as fallback');
          try {
            const pix = `00020126360014BR.GOV.BCB.PIX01${String(orderId).slice(-14)}520400005303986540${String(paymentData.transaction_amount).replace('.','')}5802BR5925Empresa6009Cidade6108${String(Date.now()).slice(-8)}62070503***6304ABCD`;
            const qrPng = await QRCode.toDataURL(pix, { width: 300 });
            const devId = `DEV-${Date.now()}`;
            simulatedPayments.set(devId, { status: 'pending', createdAt: Date.now() });
            try { await savePaymentRecord(devId, { id: devId, orderId, amount, status: 'pending', createdAt: new Date().toISOString(), dev: true, fallback: true }); } catch(e){}
            return res.json({ qrCodeBase64: qrPng.replace(/^data:image\/png;base64,/, ''), pixCopiaECola: pix, paymentId: devId, fallback: true });
          } catch (e) {
            console.warn('Local PIX fallback failed', e);
            return res.status(500).json({ error: 'Local PIX fallback failed', detail: String(e) });
          }
        }

        return res.status(400).json({
          error: 'Mercado Pago configuration error',
          detail: 'Collector account is not enabled for PIX QR generation. Enable PIX keys / QR for your Mercado Pago account. See: https://www.mercadopago[.]com.br/developers/pt/guides/online-payments/pix/overview'
        });
      }

      if (String(sdkErr).toLowerCase().includes('unauthorized') || (sdkErr && sdkErr.status === 401)) {
        return res.status(401).json({ error: 'Unauthorized', detail: 'Check your MERCADO_PAGO_ACCESS_TOKEN and environment (live vs test credentials).' });
      }

      // Fallback: try REST endpoint
      const body = Object.assign({}, paymentData, { external_reference: orderId });
      const { status, data } = await mpCreatePayment(body, idempotencyKey);
      console.log('MP fallback create status', status, 'data keys:', Object.keys(data));

      if (status >= 400) {
        // Provide more helpful error detail when Mercado Pago REST returns an error
        return res.status(status).json({ error: 'Mercado Pago error', detail: data });
      }
      
      const transaction_data = data.point_of_interaction && data.point_of_interaction.transaction_data;
      if (!transaction_data || !(transaction_data.qr_code_base64 || transaction_data.qr_code)) {
        return res.status(500).json({ error: 'QR code not returned by Mercado Pago', detail: data });
      }
      
      const qr_base64 = transaction_data.qr_code_base64;
      const qr_code = transaction_data.qr_code;
      
      try {
        await savePaymentRecord(String(data.id), { 
          id: String(data.id), 
          orderId, 
          amount, 
          status: data.status || 'pending', 
          raw: data, 
          createdAt: new Date().toISOString(), 
          dev: false, 
          orderData: orderData || null 
        });
      } catch (saveError) {
        console.warn('Erro ao salvar registro fallback:', saveError.message);
      }
      
      tryBroadcastPayment({ id: String(data.id), orderId, amount, status: data.status || 'pending' });
      
      return res.json({ qrCodeBase64: qr_base64, pixCopiaECola: qr_code, paymentId: data.id });
    }
  } catch (err) {
    console.error('generate-pix error', err)
    res.status(500).json({ error: 'Falha ao gerar PIX', detail: String(err) })
  }
})

app.get('/api/check-payment/:id', async (req, res) => {
  try {
    const id = req.params.id
    
    // Se é um ID simulado DEV
    if (id && id.startsWith('DEV-')) {
      const entry = simulatedPayments.get(id);
      const status = entry ? entry.status : 'pending';
      return res.json({ status });
    }

    // Consultar Mercado Pago
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
    });
    
    if (!mpRes.ok) {
      return res.status(mpRes.status).json({ error: 'Erro ao consultar pagamento' });
    }
    
    const data = await mpRes.json();
    console.log('Status consultado:', data.status);
    
    res.json({ status: data.status, raw: data });
  } catch (err) {
    console.error('Erro ao consultar pagamento:', err);
    res.status(500).json({ error: 'Falha ao consultar pagamento' });
  }
});

// Return helpful JSON for other HTTP methods on this path instead of HTML "Cannot GET" page
app.all('/api/generate-pix', (req, res) => {
  if (req.method === 'POST') return res.status(405).json({ error: 'Invalid method' });
  return res.status(405).json({ error: 'Method Not Allowed', detail: 'Use POST on this endpoint to create a PIX payment' });
});

// New endpoint: check payment status by id (calls Mercado Pago)
app.get('/status-pagamento/:id', async (req, res) => {
  try {
    const id = req.params.id

    if (!id) return res.status(400).json({ error: 'payment id é obrigatório' })

    // Call Mercado Pago API to fetch payment
    const ACCESS = process.env.MP_ACCESS_TOKEN || process.env.MERCADO_PAGO_ACCESS_TOKEN || ''
    if (!ACCESS) return res.status(500).json({ error: 'MP access token não configurado' })

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: { 'Authorization': `Bearer ${ACCESS}` }
    })

    const text = await mpRes.text()
    let data
    try { data = JSON.parse(text) } catch (e) { data = { raw: text } }

    if (mpRes.status >= 400) {
      return res.status(mpRes.status).json({ error: 'Erro ao consultar Mercado Pago', detail: data })
    }

    const status = data.status || null
    const status_detail = data.status_detail || null
    const date_approved = data.date_approved || null

    const result = { status, status_detail }
    if (date_approved && (String(status).toLowerCase() === 'approved' || String(status).toLowerCase() === 'paid' || String(status).toLowerCase() === 'success')) {
      result.date_approved = date_approved
    }

    // Persist and broadcast like webhook did
    try { await savePaymentRecord(String(id), { status: status, raw: data }); tryBroadcastPayment({ id: String(id), status, raw: data }); } catch (e) { /* ignore */ }

    return res.json(result)
  } catch (err) {
    console.error('/status-pagamento error', err)
    return res.status(500).json({ error: 'Falha ao consultar status do pagamento', detail: String(err) })
  }
})

// Dev helper: manually approve a DEV payment
app.post('/api/dev-approve/:id', (req, res) => {
  const id = req.params.id
  if (!id || !id.startsWith('DEV-')) return res.status(400).json({ error: 'Invalid dev id' })
  if (!simulatedPayments.has(id)) return res.status(404).json({ error: 'Dev id not found' })
  simulatedPayments.set(id, { status: 'approved', createdAt: Date.now() })
  console.log(`DEV: payment ${id} manually approved`)
  // persist and notify
  savePaymentRecord(id, { id, status: 'approved', updatedAt: new Date().toISOString(), dev: true }).catch(e=>console.warn('save dev approve failed', e));
  tryBroadcastPayment({ id, status: 'approved', simulated: true });
  res.json({ ok: true, id, status: 'approved' })
})

// Webhook endpoint for Mercado Pago notifications
// If WEBHOOK_SECRET is set, the request will be validated via HMAC-SHA256
const WEBHOOK_SECRET = (process.env.WEBHOOK_SECRET || '').trim();

app.post('/api/webhook', express.json({ type: '*/*' }), async (req, res) => {
  try {
    const raw = JSON.stringify(req.body || {})

    console.log('🎯 WEBHOOK RECEBIDO');
    console.log('📦 Headers:', Object.keys(req.headers));
    console.log('🔑 WEBHOOK_SECRET configurado:', !!WEBHOOK_SECRET, 'Length:', WEBHOOK_SECRET.length);

    if (WEBHOOK_SECRET) {
      // Mercado Pago may send signature in different headers; try common ones
      const sig = req.headers['x-hub-signature-256'] || req.headers['x-hub-signature'] || req.headers['x-signature'] || req.headers['x-driven-signature'] || '';
      console.log('✍️ Signature recebida:', sig ? `${sig.substring(0, 20)}...` : 'NENHUMA');
      
      if (!sig) {
        console.warn('⚠️ Webhook received without signature while WEBHOOK_SECRET is set');
        console.log('❌ Headers disponíveis:', req.headers);
        return res.status(400).send('Missing signature');
      }
      // signature may be 'sha256=...' or raw; normalize
      const incoming = String(sig).replace(/^sha256=/i, '');
      const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
      
      console.log('🔍 Comparação de assinatura:');
      console.log('  Esperado (hmac):', hmac);
      console.log('  Recebido:', incoming);
      
      if (hmac !== incoming) {
        console.warn('❌ Webhook signature mismatch');
        console.warn('  Secret length:', WEBHOOK_SECRET.length);
        console.warn('  Secret (first 20):', WEBHOOK_SECRET.substring(0, 20));
        // TEMP: Log a erro mas aceita mesmo assim para debug
        console.log('⚠️ ACEITANDO WEBHOOK MESMO COM ASSINATURA INVÁLIDA (modo debug)');
      } else {
        console.log('✅ Assinatura válida!');
      }
    }

    // Process payload
    const payload = req.body;
    console.log('Webhook payload:', payload);

    // Try to extract resource id(s). Mercado Pago sends different shapes; handle common ones
    let paymentId = null;
    if (payload.data && payload.data.id) paymentId = String(payload.data.id);
    if (!paymentId && payload['id']) paymentId = String(payload['id']);

    if (!paymentId) {
      console.warn('Webhook has no payment id');
      return res.status(200).send('no-op');
    }

    // Fetch payment status from Mercado Pago and update local record
  const mpRes = await fetch(`https://api.mercadopago.com/payments/${paymentId}`, { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } });
    const text = await mpRes.text();
    let data
    try { data = JSON.parse(text) } catch(e) { data = { raw: text } }

    if (mpRes.status >= 400) {
      console.error('Error fetching payment from MP in webhook:', data);
      return res.status(500).send('mp-error');
    }

    await savePaymentRecord(paymentId, { status: data.status, raw: data });
    console.log('Webhook processed payment', paymentId, 'status', data.status);
  // notify frontend via websocket
  tryBroadcastPayment({ id: String(paymentId), status: data.status, raw: data });
    // If payment is approved/paid, forward stored orderData to printing webhook if configured
    const printUrl = process.env.PRINT_WEBHOOK_URL;
    if (printUrl && (String(data.status).toLowerCase() === 'approved' || String(data.status).toLowerCase() === 'paid' || String(data.status).toLowerCase() === 'success')) {
      try {
        const rec = await getPaymentRecord(paymentId);
        if (rec && rec.orderData) {
          // Post to print webhook (non-blocking but log result)
          try {
            const pRes = await fetch(printUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(rec.orderData)
            });
            if (!pRes.ok) {
              const pText = await pRes.text().catch(()=>'<no-text>');
              console.warn('Print webhook returned non-OK:', pRes.status, pText);
            } else {
              console.log('Order summary posted to print webhook for payment', paymentId);
            }
          } catch (e) {
            console.warn('Failed to post order to print webhook:', e);
          }
        } else {
          console.log('No orderData found for payment', paymentId);
        }
      } catch (e) {
        console.warn('Error looking up payment record for print forwarding', e);
      }
    }
    res.status(200).send('ok');
  } catch (e) {
    console.error('Webhook processing error', e);
    res.status(500).send('error');
  }
});

// Proxy endpoint to forward print requests to the configured print webhook.
// This allows the browser to POST to the same origin and avoids CORS/preflight
// issues when the external webhook doesn't set Access-Control-Allow-Origin.
app.post('/api/print-order', express.json({ type: '*/*' }), async (req, res) => {
  try {
    const printUrl = process.env.PRINT_WEBHOOK_URL;
    console.log('='.repeat(60));
    console.log('[PRINT PROXY] /api/print-order called');
    console.log('[PRINT PROXY] PRINT_WEBHOOK_URL env var:', printUrl ? '✓ SET' : '✗ NOT SET');
    console.log('[PRINT PROXY] PRINT_WEBHOOK_URL value:', printUrl || 'undefined');
    console.log('='.repeat(60));
    
    if (!printUrl) {
      console.error('[PRINT PROXY] ❌ PRINT_WEBHOOK_URL is not set - CANNOT FORWARD');
      return res.status(400).json({ error: 'PRINT_WEBHOOK_URL not configured on server' });
    }

    // Log incoming request for diagnostics (avoid logging huge payloads)
    try {
      const bodyPreview = JSON.stringify(req.body || {}).slice(0, 2000);
      console.log(`[PRINT PROXY] 📦 Forwarding order to: ${printUrl}`);
      console.log(`[PRINT PROXY] 📊 Body preview: ${bodyPreview}`);
    } catch (e) {
      console.log('[PRINT PROXY] Forwarding order (could not serialize body preview)');
    }

    // Forward the body to the configured print webhook
    let pRes;
    let text = '';
    try {
      console.log(`[PRINT PROXY] 🔄 Sending POST to webhook...`);
      const startTime = Date.now();
      pRes = await fetch(String(printUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {})
      });
      const elapsed = Date.now() - startTime;
      text = await pRes.text().catch(() => '');
      console.log(`[PRINT PROXY] ✅ Webhook response received in ${elapsed}ms, status=${pRes.status}`);
    } catch (fetchErr) {
      console.error('[PRINT PROXY] ❌ FETCH FAILED - Error details:');
      console.error('[PRINT PROXY] Error message:', fetchErr.message);
      console.error('[PRINT PROXY] Error code:', fetchErr.code);
      console.error('[PRINT PROXY] Stack:', fetchErr && fetchErr.stack ? fetchErr.stack : 'no stack');
      return res.status(500).json({ error: 'Failed to reach print webhook', detail: String(fetchErr.message || fetchErr) });
    }

    // Log proxied response for diagnostics
    console.log(`[PRINT PROXY] 📄 Webhook response status=${pRes.status}`);
    console.log(`[PRINT PROXY] 📄 Webhook response body: ${String(text || '').slice(0, 500)}`);

    if (!pRes.ok) {
      console.log(`[PRINT PROXY] ⚠️ Webhook returned error status ${pRes.status}`);
      // Respond with upstream status and body for easier debugging
      return res.status(502).json({ error: 'Print webhook error', status: pRes.status, detail: text });
    }

    console.log('[PRINT PROXY] ✅ SUCCESS - Order forwarded to webhook');
    // Return the proxied text (or empty) so client can inspect result if needed
    try {
      const json = JSON.parse(text || 'null');
      return res.json({ ok: true, proxied: json });
    } catch (e) {
      return res.send(text || 'ok');
    }
  } catch (err) {
    console.error('[PRINT PROXY] ❌ Unexpected error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Failed to proxy print webhook', detail: String(err) });
  }
});


// New route: create payment via Mercado Pago PIX using MP_ACCESS_TOKEN
async function createPaymentHandler(req, res) {
  try {
    const { transaction_amount, description, email, identificationType, identificationNumber } = req.body || {};

    if (!transaction_amount || !description || !email) {
      return res.status(400).json({ error: 'Dados inválidos. transaction_amount, description e email são obrigatórios.' });
    }

    // Ensure we have an access token
    const token = process.env.MP_ACCESS_TOKEN || process.env.MERCADO_PAGO_ACCESS_TOKEN || '';
    if (!token) {
      return res.status(500).json({ error: 'MP access token não configurado no servidor (env MP_ACCESS_TOKEN).' });
    }

    // Generate a random idempotency key
    const idempotencyKey = `idemp-${crypto.randomBytes(12).toString('hex')}`;

    // Build payment body
    const paymentBody = {
      transaction_amount: Number(transaction_amount),
      description: String(description),
      payment_method_id: 'pix',
      payer: {
        email: String(email),
        identification: {
          type: identificationType || 'CPF',
          number: identificationNumber || ''
        }
      }
    };

    // Use mercadopago SDK to create payment
    const mpRes = await mercadopago.payment.create(paymentBody, { headers: { 'x-idempotency-key': idempotencyKey } });
    const data = mpRes && mpRes.body ? mpRes.body : mpRes;

    // Extract useful fields
    const paymentId = data.id || (data && data.transaction_details && data.transaction_details.id) || null;
    const status = data.status || null;
    const transaction_data = data.point_of_interaction && data.point_of_interaction.transaction_data;
    const qr_code_base64 = transaction_data && (transaction_data.qr_code_base64 || transaction_data.qr_code_base64);
    const qr_code = transaction_data && (transaction_data.qr_code || transaction_data.qr_code);
    const ticket_url = data.transaction_details && data.transaction_details.ticket_url ? data.transaction_details.ticket_url : (data.sandbox_init_point || data.init_point || null);

    return res.json({ id: paymentId, status, qr_code_base64, qr_code, ticket_url });
  } catch (err) {
    console.error('/criar-pagamento error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Falha ao criar pagamento', detail: String(err) });
  }
}

// Register both legacy and proxied paths
app.post('/criar-pagamento', createPaymentHandler);
app.post('/api/criar-pagamento', createPaymentHandler);

const port = process.env.PORT || 3000
const host = process.env.HOST || '0.0.0.0' // listen on IPv6 any (will accept IPv4 on dual-stack systems)

// Create HTTP server so we can attach WebSocket server to the same listener
import http from 'http';
const server = http.createServer(app);

// Setup WebSocket server
const wss = new WebSocketServer({ server });
const wsClients = new Set();

wss.on('connection', (socket) => {
  console.log('WebSocket client connected');
  wsClients.add(socket);
  socket.on('close', () => {
    wsClients.delete(socket);
    console.log('WebSocket client disconnected');
  });
  socket.on('message', (msg) => {
    // simple ping handling
    if (String(msg) === 'ping') socket.send('pong');
  });
});

function tryBroadcastPayment(payload) {
  const message = JSON.stringify({ type: 'payment_update', payload });
  for (const c of wsClients) {
    if (c.readyState === c.OPEN) {
      try { c.send(message); } catch (e) { console.warn('Failed to send ws message', e); }
    }
  }
}

// Update check-payment endpoint to broadcast
// ...existing code...

// Start server
(async () => {
  // Production: always validate Mercado Pago token at startup. Exit if invalid.
  const ok = await validateMpToken();
  if (!ok) {
    console.error('Mercado Pago token invalid — server will not start. Fix MERCADO_PAGO_ACCESS_TOKEN and restart.');
    process.exit(1);
  }
  server.listen(port, host, () => console.log(`Server running on http://localhost:${port} (listening on ${host})`));
})();
