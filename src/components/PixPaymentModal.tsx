import { Dialog, DialogContent, DialogTitle } from "./ui/dialog"
import { useEffect, useState } from "react"
import { toast } from '@/hooks/use-toast'
import { copyText } from '@/lib/clipboard'
import { Button } from "./ui/button"
import { generatePix, checkPaymentStatus, GeneratePixResult } from '@/api/mercadopago'
import DevelopedBy from "@/components/DevelopedBy"

interface PixPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  total: number
  orderId: string
  orderData?: any
  onPaymentConfirmed?: () => void
}

export function PixPaymentModal({ isOpen, onClose, total, orderId, orderData, onPaymentConfirmed }: PixPaymentModalProps) {
  const [qrCodeData, setQRCodeData] = useState("")
  const [pixCode, setPixCode] = useState("")
  const [timeLeft, setTimeLeft] = useState(600)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "completed" | "expired">("pending")
  const [paymentId, setPaymentId] = useState<string | number | null>(null)
  const [checkIntervalId, setCheckIntervalId] = useState<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (isOpen) {
      console.log('🔍 DEBUG - PixPaymentModal - Props:', { total, orderId, orderData });
      generatePixPayment()
      const timer = startCountdown()
      return () => clearInterval(timer)
    }
  }, [isOpen])

  // WebSocket for real-time updates
  useEffect(() => {
    if (!isOpen) return
    let ws: WebSocket | null = null
    try {
      // Prefer environment variable (set at build/runtime)
      // @ts-ignore
      const envWs = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_WS_URL ? String(import.meta.env.VITE_WS_URL) : ''

      // If not provided, build a scheme-relative URL from current location and VITE_API_BASE
      let wsUrl = envWs
      if (!wsUrl) {
        // If VITE_API_BASE is provided and it's absolute, prefer it
        // @ts-ignore
        const apiBase = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE) ? String(import.meta.env.VITE_API_BASE) : ''
        if (apiBase) {
          // convert https://host to wss://host and http://host to ws://host
          wsUrl = apiBase.replace(/^https?:\/\//i, (m) => m.toLowerCase().startsWith('https') ? 'wss://' : 'ws://').replace(/\/$/, '')
        } else {
          // fallback to same host as current page using appropriate ws scheme
          const loc = window.location
          const scheme = loc.protocol === 'https:' ? 'wss:' : 'ws:'
          wsUrl = `${scheme}//${loc.host}`
        }
      }

      ws = new WebSocket(wsUrl)
      ws.addEventListener('open', () => console.log('WS connected for Pix updates'))
      ws.addEventListener('message', (evt) => {
        try {
          const msg = JSON.parse(evt.data)
          if (msg && msg.type === 'payment_update' && msg.payload && ((msg.payload.id && String(msg.payload.id) === String(paymentId)) || msg.payload.orderId === orderId)) {
            const st = String(msg.payload.status).toLowerCase()
            if (st === 'approved' || st === 'paid' || st === 'success') {
              setPaymentStatus('completed')
              try { onPaymentConfirmed && onPaymentConfirmed() } catch(e){}
              setTimeout(() => onClose(), 2000)
            } else if (st === 'rejected' || st === 'cancelled') {
              setError('Pagamento rejeitado ou cancelado')
            }
          }
        } catch (e) {
          // ignore
        }
      })
    } catch (e) {
      console.warn('WS connection failed, will fallback to polling', e)
    }
    return () => {
      try { ws && ws.close() } catch (e) {}
    }
  }, [isOpen, paymentId])

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
  }

  const startCountdown = () => {
    return setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setPaymentStatus("expired")
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  async function generatePixPayment() {
    try {
      setIsLoading(true)
      setError(null)

      const payload = {
        amount: Number(total),
        orderId: orderId,
        orderData: orderData || null,
        transaction_amount: Number(total),
        description: `Pedido #${orderId}`
      }

      console.log('📤 Enviando payload para generatePix:', {
        amount: payload.amount,
        orderId: payload.orderId,
        hasOrderData: !!payload.orderData,
        orderDataKeys: payload.orderData ? Object.keys(payload.orderData).join(', ') : 'N/A'
      })

      const data = await generatePix(Number(total), orderId, orderData) as GeneratePixResult
      console.log('📦 Dados recebidos do generatePix proxy:', {
        qrCodeBase64: data.qrCodeBase64 ? `Presente (${String(data.qrCodeBase64).length} chars)` : 'Ausente',
        pixCopiaECola: data.pixCopiaECola ? `Presente (${String(data.pixCopiaECola).length} chars)` : 'Ausente',
        paymentId: data.paymentId,
        status: data.status
      })

      // Verificar múltiplos formatos de resposta
      const qrBase64 = data.qrCodeBase64 || data.qr_code_base64 || null
      const qrCopy = data.pixCopiaECola || data.qr_code || data.qrCode || null

      console.log('🎯 QR Base64 final:', qrBase64 ? 'Presente' : 'Ausente')
      console.log('🎯 PIX Copy final:', qrCopy ? 'Presente' : 'Ausente')

      if (!qrBase64 && !qrCopy) {
        console.error('❌ Dados incompletos:', data)
        throw new Error('QR Code PIX não foi gerado corretamente')
      }

      // Garantir formato correto da imagem base64
      if (qrBase64) {
        const imageData = qrBase64.startsWith('data:image') 
          ? qrBase64 
          : `data:image/png;base64,${qrBase64}`
        setQRCodeData(imageData)
        console.log('✅ QR Code definido:', imageData.substring(0, 50) + '...')
      }

      if (qrCopy) {
        setPixCode(qrCopy)
        console.log('✅ PIX Code definido:', qrCopy.substring(0, 50) + '...')
      }

  const newPaymentIdRaw = data.paymentId || data.id || null
  const newPaymentId = newPaymentIdRaw != null ? String(newPaymentIdRaw) : null
  setPaymentId(newPaymentId)
      console.log('✅ Payment ID definido:', newPaymentId)

      // Iniciar verificação de status se temos um ID
      if (newPaymentId) {
        startPaymentCheck(newPaymentId)
      }

    } catch (error) {
      console.error('❌ Erro ao gerar PIX:', error)
      setError(error instanceof Error ? error.message : 'Erro ao gerar o PIX')
    } finally {
      setIsLoading(false)
    }
  }

  const startPaymentCheck = (idToCheck?: string | number | null) => {
    const id = idToCheck ?? paymentId
    if (!id) {
      console.error('ID do pagamento não disponível')
      return
    }

    // Limpar intervalo anterior se existir
    if (checkIntervalId) {
      clearInterval(checkIntervalId)
    }

    console.log(`🔍 Iniciando verificação de pagamento para ${id}...`)

    // Fazer uma verificação imediata quando o usuário clica no botão
    const checkNow = async () => {
      try {
        console.log(`🔄 Verificando pagamento ${id}...`)
        const status = await checkPaymentStatus(String(id))
        console.log(`📊 Status retornado: ${status}`)

        if (status === "approved" || status === 'paid' || status === 'success') {
          console.log('✅ PAGAMENTO CONFIRMADO!')
          setPaymentStatus("completed")
          
          // Enviar dados para webhook quando pagamento for confirmado
          if (orderData) {
            try {
              console.log('📤 Enviando pedido para webhook após confirmação de pagamento...')
              
              // Montar dados no mesmo formato que o CheckoutModal usa
              const orderDataForWebhook = {
                orderId: `PEDIDO-${Date.now()}`,
                items: orderData.items || [],
                subtotal: orderData.totals?.subtotal || 0,
                deliveryFee: orderData.totals?.deliveryFee || 0,
                total: orderData.totals?.total || 0,
                customer: orderData.customer || {},
                delivery: orderData.delivery || {},
                payment: { method: 'PIX' },
                observations: orderData.observations || '',
                timestamp: new Date().toISOString()
              }
              
              // Enviar via proxy do servidor para o webhook configurado (mais seguro e confiável)
              try {
                const controller = new AbortController();
                const to = setTimeout(() => controller.abort(), 8000);
                
                // Determine the correct backend URL
                let backendUrl = '/api/print-order'; // default for same-origin requests
                // @ts-ignore
                const apiBase = import.meta?.env?.VITE_API_BASE ? String(import.meta.env.VITE_API_BASE) : '';
                if (apiBase && (apiBase.startsWith('http://') || apiBase.startsWith('https://'))) {
                  // Use absolute URL if provided
                  backendUrl = `${apiBase}/api/print-order`;
                }
                
                console.log('[PRINT PROXY PIX] URL:', backendUrl, 'Payload size:', JSON.stringify(orderDataForWebhook).length);
                
                const resp = await fetch(backendUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(orderDataForWebhook),
                  signal: controller.signal
                });
                clearTimeout(to);
                if (!resp.ok) {
                  let body = null;
                  try { body = await resp.json(); } catch(e) { body = await resp.text().catch(()=>null); }
                  const msg = body && (body.error || body.detail) ? String(body.error || body.detail) : `status ${resp.status}`;
                  if (resp.status === 400 && String(msg).toLowerCase().includes('print_webhook_url')) {
                    toast({ title: 'Ative o webhook', description: 'PRINT_WEBHOOK_URL não está configurado no servidor. Ative-o.', variant: 'destructive' });
                  } else {
                    toast({ title: 'Falha no webhook', description: `Erro ao encaminhar pedido (${msg}).`, variant: 'destructive' });
                  }
                } else {
                  // Log proxy success body for debugging
                  try {
                    const txt = await resp.text().catch(() => null);
                    console.log('[PRINT PROXY] Success response (PIX):', txt);
                  } catch (e) {
                    console.log('[PRINT PROXY] Success response (PIX) - no body');
                  }
                  console.log('✅ Pedido enviado para webhook via proxy')
                }
              } catch (err) {
                console.error('❌ Erro ao enviar pedido para webhook via proxy:', err);
                toast({ title: 'Falha no webhook', description: 'Não foi possível contatar o servidor de proxy. Verifique a conexão.', variant: 'destructive' });
              }
            } catch (err) {
              console.error('❌ Erro ao enviar pedido para webhook:', err)
            }
          }
          
          // Chamar callback
          try { 
            onPaymentConfirmed && onPaymentConfirmed() 
          } catch(e){
            console.error('Erro ao chamar onPaymentConfirmed:', e)
          }
          
          // Limpar intervalo ANTES de fechar
          if (checkIntervalId) {
            clearInterval(checkIntervalId)
            setCheckIntervalId(null)
          }
          
          // Fechar modal após 2 segundos
          setTimeout(() => onClose(), 2000)
        } else if (status === 'rejected' || status === 'cancelled') {
          console.error('❌ Pagamento rejeitado ou cancelado')
          setError('Pagamento rejeitado ou cancelado')
          if (checkIntervalId) {
            clearInterval(checkIntervalId)
            setCheckIntervalId(null)
          }
        } else {
          console.log(`⏳ Status pendente: ${status}`)
        }
      } catch (error) {
        console.warn('⚠️ Erro ao verificar pagamento:', error)
      }
    }

    // Fazer verificação imediata
    checkNow()

    // Depois, fazer polling a cada 3 segundos
    const newInterval = setInterval(checkNow, 3000)

    setCheckIntervalId(newInterval)
  }

  // Limpar intervalo quando o modal fecha
  useEffect(() => {
    return () => {
      if (checkIntervalId) {
        clearInterval(checkIntervalId)
      }
    }
  }, [])

  const copyPixCode = async () => {
    try {
      const ok = await copyText(pixCode)
      if (ok) {
        alert('Código PIX copiado!')
      } else {
        // best-effort: inform user
        alert('Não foi possível copiar automaticamente. Segure o código para copiar manualmente.')
      }
    } catch (err) {
      console.error('Erro ao copiar PIX (util):', err)
      alert('Não foi possível copiar o código PIX.')
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="text-center text-lg font-bold">
          Tempo restante para pagamento
        </DialogTitle>
        
        <div className="flex flex-col items-center gap-4">
          <div className="text-2xl font-bold">
            {formatTime(timeLeft)}
          </div>

          {error ? (
            <div className="text-red-500 text-center p-4">
              <p>{error}</p>
              <Button onClick={generatePixPayment} className="mt-4">
                Tentar Novamente
              </Button>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
              <span className="ml-2">Gerando QR Code...</span>
            </div>
          ) : (
            <>
              <div className="bg-white p-4 rounded-lg border">
                {qrCodeData ? (
                  <img 
                    src={qrCodeData} 
                    alt="QR Code PIX" 
                    className="w-48 h-48 object-contain"
                    onError={(e) => {
                      console.error('❌ Erro ao carregar imagem QR:', e)
                      console.log('🔍 Dados da imagem:', qrCodeData.substring(0, 100))
                    }}
                    onLoad={() => console.log('✅ Imagem QR carregada com sucesso')}
                  />
                ) : (
                  <div className="w-48 h-48 bg-gray-200 flex items-center justify-center text-gray-500">
                    QR Code não disponível
                  </div>
                )}
              </div>
              
              <p className="text-sm text-center text-gray-600">
                Escaneie o QR Code com seu app de pagamento
              </p>

              {pixCode && (
                <div className="w-full bg-gray-100 p-3 rounded">
                  <p className="text-sm font-semibold mb-2">Código PIX</p>
                  <div className="flex gap-2">
                      <input
                        readOnly
                        value={pixCode}
                        className="flex-1 bg-white p-2 rounded text-xs font-mono text-black"
                      />
                    <Button onClick={copyPixCode} size="sm">
                      Copiar
                    </Button>
                  </div>
                </div>
              )}

              <div className="text-center">
                <p className="font-bold text-lg">
                  Valor a pagar
                </p>
                <p className="text-2xl font-bold text-orange-600">
                  R$ {total.toFixed(2)}
                </p>
              </div>

              {paymentStatus === "completed" ? (
                <div className="text-center text-green-500">
                  <p className="text-lg font-bold">Pagamento Confirmado!</p>
                  <p>Fechando...</p>
                </div>
              ) : paymentStatus === "expired" ? (
                <div className="text-center">
                  <p className="text-red-500 mb-4">Tempo expirado</p>
                  <Button 
                    onClick={generatePixPayment}
                    className="bg-orange-500 hover:bg-orange-600"
                  >
                    Gerar Novo PIX
                  </Button>
                </div>
              ) : (
                <div className="flex gap-4 w-full">
                  <Button 
                    onClick={() => {
                      // Forçar verificação imediata
                      if (paymentId) {
                        startPaymentCheck(paymentId)
                      }
                    }}
                    className="flex-1 bg-orange-500 hover:bg-orange-600"
                  >
                    Atualizar Status
                  </Button>
                  <Button 
                    onClick={onClose}
                    variant="outline" 
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
