// Client-side proxy for Mercado Pago endpoints hosted on the server
// This file intentionally avoids importing the Mercado Pago SDK so it won't be bundled
// into the browser build. The server (server/index.js) holds the SDK and credentials.

// Runtime config strategy:
// 1) Try to load /config.json (deployed and editable without rebuilding)
// 2) Fallback to build-time `import.meta.env.VITE_API_BASE` (for normal Vite builds)

let runtimeConfig: { VITE_API_BASE?: string; VITE_WS_URL?: string } | null = null;

async function loadRuntimeConfig(): Promise<void> {
  if (runtimeConfig !== null) return;
  try {
    const res = await fetch('/config.json', { cache: 'no-store' });
    if (res.ok) {
      runtimeConfig = await res.json();
      return;
    }
  } catch (e) {
    // ignore and fallback
  }
  // fallback to build-time env
  // @ts-ignore
  const buildApiBase = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE) ? String(import.meta.env.VITE_API_BASE) : '';
  // @ts-ignore
  const buildWs = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_WS_URL) ? String(import.meta.env.VITE_WS_URL) : '';
  runtimeConfig = { VITE_API_BASE: buildApiBase, VITE_WS_URL: buildWs };
}

function getApiBase(): string {
  if (runtimeConfig && runtimeConfig.VITE_API_BASE) return runtimeConfig.VITE_API_BASE.replace(/\/$/, '');
  return '';
}

export type GeneratePixResult = {
  qrCodeBase64?: string | null;
  qr_code_base64?: string | null;
  qr_code?: string | null;
  qrCode?: string | null;
  pixCopiaECola?: string | null;
  paymentId?: string | number | null;
  id?: string | number | null;
  status?: string | null;
  [key: string]: any;
}

export async function generatePix(amount: number, orderId: string): Promise<GeneratePixResult> {
  try {
    await loadRuntimeConfig();
    const apiBase = getApiBase();
    // Use application/x-www-form-urlencoded to avoid CORS preflight in many cases
    const params = new URLSearchParams();
    params.set('amount', String(amount));
    params.set('orderId', String(orderId));
    const res = await fetch(`${apiBase}/api/generate-pix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error('generatePix error', res.status, txt);
      throw new Error(`Erro ao gerar PIX: ${res.status}`);
    }

    const data = await res.json();
    // Normalize common alias fields so callers can use different conventions
    const qrCodeBase64 = data.qrCodeBase64 || data.qr_code_base64 || data.qrCode || null;
    const pixCopiaECola = data.pixCopiaECola || data.qr_code || data.qrCode || null;
    const paymentId = data.paymentId || data.id || null;

    return {
      // provide both canonical and alternative fields
      qrCodeBase64,
      qr_code_base64: qrCodeBase64,
      qrCode: qrCodeBase64,
      pixCopiaECola,
      qr_code: pixCopiaECola,
      paymentId,
      id: paymentId,
      status: data.status || null,
      // include original payload for debugging
      raw: data
    };
  } catch (err) {
    console.error('Erro ao gerar pagamento PIX (client proxy):', err);
    throw err;
  }
}

export async function checkPaymentStatus(paymentId: string) {
  try {
    await loadRuntimeConfig();
    const apiBase = getApiBase();
    console.log(`🔍 checkPaymentStatus: chamando ${apiBase}/api/check-payment/${paymentId}`);
    
    const res = await fetch(`${apiBase}/api/check-payment/${encodeURIComponent(paymentId)}`);
    if (!res.ok) {
      const txt = await res.text();
      console.error('❌ checkPaymentStatus error', res.status, txt);
      throw new Error(`Erro ao verificar status: ${res.status}`);
    }
    const data = await res.json();
    console.log('✅ checkPaymentStatus resposta completa:', data);
    console.log('📊 Status extraído:', data.status);
    return data.status;
  } catch (err) {
    console.error('❌ Erro ao verificar pagamento (client proxy):', err);
    throw err;
  }
}
