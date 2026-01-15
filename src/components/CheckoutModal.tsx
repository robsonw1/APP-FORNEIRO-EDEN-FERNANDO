import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import DevelopedBy from '@/components/DevelopedBy';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Check, MapPin, CreditCard, Clock, Loader2 } from "lucide-react";
import { CartItem } from "@/hooks/useCart";
import { useProducts } from '@/hooks/useProducts';
import { PixPaymentModal } from "./PixPaymentModal";

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  subtotal: number;
  onOrderComplete: () => void;
  // Called when the order was successfully sent to the print webhook
  onPrintSuccess?: () => void;
}

type DeliveryType = 'entrega' | 'retirada' | 'local';
type PaymentMethod = 'pix' | 'dinheiro' | 'debito' | 'credito';

const CheckoutModal = ({ isOpen, onClose, items, subtotal, onOrderComplete, onPrintSuccess }: CheckoutModalProps) => {
  const [step, setStep] = useState(1);
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('entrega');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [isCalculatingDelivery, setIsCalculatingDelivery] = useState(false);
  const [isLoadingConfirmation, setIsLoadingConfirmation] = useState(false);
  const [isPixModalOpen, setIsPixModalOpen] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [currentOrderData, setCurrentOrderData] = useState<any>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [customerData, setCustomerData] = useState({
    name: '',
    phone: '',
    address: '',
    neighborhood: '',
    reference: '',
    changeFor: '',
    observations: ''
  });

  const [neighborhoodsList, setNeighborhoodsList] = useState<{ key: string; label: string }[]>([]);
  const [neighborhoodMode, setNeighborhoodMode] = useState<'select' | 'other'>('select');
  const [previousNeighborhoodSelection, setPreviousNeighborhoodSelection] = useState<string>('');

  // Load saved customer data from localStorage
  useEffect(() => {
    const savedCustomerData = localStorage.getItem('forneiro-customer-data');
    if (savedCustomerData) {
      try {
        const parsedData = JSON.parse(savedCustomerData);
        setCustomerData(parsedData);
      } catch (error) {
        console.error('Error loading saved customer data:', error);
      }
    }
    // load neighborhood options (from admin storage if present)
    (async () => {
      try {
        const mod = await import('@/services/deliveryNeighborhoods');
        const loaded = (mod.loadAdminNeighborhoods ? mod.loadAdminNeighborhoods() : (mod.default || mod.NEIGHBORHOOD_OPTIONS));
        const opts = (loaded || []).map((o: any) => ({ key: o.key, label: o.label }));
        setNeighborhoodsList(opts);

        // listen for updates (custom event and storage event)
        const onUpdate = (e: any) => {
          try {
            const next = (mod.loadAdminNeighborhoods ? mod.loadAdminNeighborhoods() : (mod.default || mod.NEIGHBORHOOD_OPTIONS));
            setNeighborhoodsList((next || []).map((o: any) => ({ key: o.key, label: o.label })));
          } catch (err) {
            console.warn('Failed to reload neighborhoods on update', err);
          }
        };

        window.addEventListener('forneiro:neighborhoods-updated', onUpdate as any);
        window.addEventListener('storage', onUpdate as any);

        // cleanup on unmount
        return () => {
          window.removeEventListener('forneiro:neighborhoods-updated', onUpdate as any);
          window.removeEventListener('storage', onUpdate as any);
        };

      } catch (e) {
        console.warn('Could not load neighborhood options', e);
      }
    })();
  }, []);

  // Save customer data to localStorage whenever it changes
  useEffect(() => {
    if (customerData.name || customerData.phone || customerData.address) {
      localStorage.setItem('forneiro-customer-data', JSON.stringify(customerData));
    }
  }, [customerData]);

  const total = subtotal + deliveryFee;
  const { products: storeProducts } = useProducts();

  // Use server proxy `/api/print-order` to forward to configured print webhook.
  const sendToProxy = async (payload: any) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const resp = await fetch('/api/print-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);
      return resp;
    } catch (err: any) {
      clearTimeout(timeout);
      throw err;
    }
  };

  const calculateDeliveryFee = async (address: string, neighborhood: string, reference: string) => {
    if (deliveryType !== 'entrega') {
      setDeliveryFee(0);
      return;
    }

    setIsCalculatingDelivery(true);
    
    try {
      const { calculateDeliveryFee: calcFee } = await import('@/services/googleMaps');
      console.debug('Calculating delivery fee for', { address, neighborhood, reference });
      const result = await calcFee(address, neighborhood, reference);
      
      setDeliveryFee(result.fee);

      // Mostrar informações da entrega
      toast({
        title: "Taxa calculada com sucesso!",
        description: `Distância: ${result.distance} | Tempo: ${result.duration} | Taxa: R$ ${result.fee.toFixed(2).replace('.', ',')}`,
      });

    } catch (error: any) {
      console.error('Erro ao calcular taxa de entrega:', error);
      setDeliveryFee(8.00); // Taxa padrão em caso de erro
      toast({
        title: "Erro ao calcular entrega",
        description: error.message || "Usando taxa padrão de R$ 8,00. Verifique o endereço.",
        variant: "destructive",
      });
    } finally {
      setIsCalculatingDelivery(false);
    }
  };

  const handleStep1Next = async () => {
    if (!customerData.name || !customerData.phone) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha nome e telefone.",
        variant: "destructive",
      });
      return;
    }

    if (deliveryType === 'entrega' && (!customerData.address || !customerData.neighborhood)) {
      toast({
        title: "Endereço obrigatório",
        description: "Preencha o endereço completo para entrega.",
        variant: "destructive",
      });
      return;
    }

    if (deliveryType === 'entrega') {
      // If the user selected a neighborhood from the select, prefer the admin-saved fixed fee
      try {
        if (neighborhoodMode === 'select' && customerData.neighborhood) {
          const mod = await import('@/services/deliveryNeighborhoods');
          // Use admin-saved list directly to avoid any mismatch between environments
          const adminList = (mod.loadAdminNeighborhoods && typeof window !== 'undefined') ? mod.loadAdminNeighborhoods() : null;
          const normalize = (s: string) => s ? s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9 ]/g, '').trim() : '';
          const target = normalize(customerData.neighborhood || '');
          if (Array.isArray(adminList) && adminList.length) {
            const found = adminList.find((opt: any) => {
              const label = String(opt.label || '');
              const key = String(opt.key || '');
              const aliases = Array.isArray(opt.aliases) ? opt.aliases : [];
              if (normalize(label) === target) return true;
              if (key === customerData.neighborhood) return true;
              if (aliases.some((a: string) => normalize(a) === target)) return true;
              if (target.includes(normalize(label))) return true;
              return false;
            });
            if (found) {
              setDeliveryFee(Number(found.fee));
              toast({ title: 'Taxa aplicada', description: `Taxa fixa aplicada: R$ ${Number(found.fee).toFixed(2).replace('.', ',')}` });
            } else {
              // fallback to calculate by address (Google Maps)
              await calculateDeliveryFee(customerData.address, customerData.neighborhood, customerData.reference);
            }
          } else {
            // no admin list available: fallback to calculate
            await calculateDeliveryFee(customerData.address, customerData.neighborhood, customerData.reference);
          }
        } else {
          // 'other' mode: use admin-configured default fee if available
          try {
            const mod = await import('@/services/deliveryNeighborhoods');
            const defaultFee = (mod.loadDefaultOtherFee && typeof window !== 'undefined') ? mod.loadDefaultOtherFee() : 9;
            setDeliveryFee(Number(defaultFee));
            toast({ title: 'Taxa aplicada', description: `Taxa padrão aplicada: R$ ${Number(defaultFee).toFixed(2).replace('.', ',')}` });
          } catch (e) {
            // fallback
            await calculateDeliveryFee(customerData.address, customerData.neighborhood, customerData.reference);
          }
        }
      } catch (err) {
        // If any error occurs while trying to resolve a fixed fee, fallback to Google Maps
        console.warn('Erro ao resolver taxa local, usando Google Maps', err);
        await calculateDeliveryFee(customerData.address, customerData.neighborhood, customerData.reference);
      }
    }

    setStep(2);
  };

  const handleOrderSubmit = async () => {
    // Helper function to map customization details into readable strings
    const mapCustomizationDetails = (customization: any) => {
      const details: string[] = [];
      
      if (customization?.type) {
        details.push(`Tipo: ${customization.type}`);
      }
      
      if (customization?.size) {
        details.push(`Tamanho: ${customization.size}`);
      }
      
      if (customization?.sabor1) {
        details.push(`Sabor 1: ${customization.sabor1}`);
      }
      
      if (customization?.sabor2) {
        details.push(`Sabor 2: ${customization.sabor2}`);
      }
      
      if (customization?.borda && customization.borda !== 'Sem borda') {
        details.push(`Borda: ${customization.borda}`);
      }
      
      if (customization?.adicionais && customization.adicionais.length > 0) {
        const adicionaisList = customization.adicionais.filter((a: string) => a && a !== 'undefined').join(', ');
        if (adicionaisList) {
          details.push(`Adicionais: ${adicionaisList}`);
        }
      }
      
      if (customization?.modaIngredientes && customization.modaIngredientes.length > 0) {
        const modaList = customization.modaIngredientes
          .map((ing: any) => typeof ing === 'string' ? ing : ing.name)
          .filter((ing: string) => ing)
          .join(', ');
        if (modaList) {
          details.push(`Moda do Cliente: ${modaList}`);
        }
      }
      
      if (customization?.drink && customization.drink !== 'Sem Bebida') {
        const drinkQty = customization.drinkQuantity || 1;
        details.push(`Bebida: ${customization.drink} (x${drinkQty})`);
      }
      
      if (customization?.observacoes) {
        details.push(`Obs: ${customization.observacoes}`);
      }
      
      return details.length > 0 ? details.join(' | ') : '';
    };

    // Temporary debug/send block will run before the normal proxy flow for non-PIX payments
    const handleConfirmOrder = async () => {
      try {
        setIsProcessing(true);
        
        // Monta os dados do pedido com TODAS as informações necessárias, incluindo customizações detalhadas
        const orderDataForWebhook = {
          pedidoId: `PEDIDO-${Date.now()}`,
          items: items.map(item => {
            const customizationDetails = mapCustomizationDetails((item as any).customization);
            return {
              nome: item.name,
              quantidade: item.quantity,
              preco: item.price,
              subtotal: item.price * item.quantity,
              borda: (item as any).customization?.borda || 'Sem borda',
              adicionais: ((item as any).customization?.adicionais || []).filter((a: string) => a && a !== 'undefined'),
              customizacao: customizationDetails
            };
          }),
          subtotal: subtotal,
          taxaEntrega: deliveryFee,
          total: total,
          cliente: {
            nome: customerData.name || 'Cliente',
            telefone: customerData.phone || '',
            endereco: customerData.address || '',
            bairro: customerData.neighborhood || '',
            referencia: customerData.reference || ''
          },
          entrega: {
            tipo: deliveryType === 'entrega' ? 'ENTREGA' : deliveryType === 'retirada' ? 'RETIRADA' : 'LOCAL',
            taxa: deliveryFee
          },
          formaPagamento: paymentMethod.toUpperCase(),
          troco: paymentMethod === 'dinheiro' ? customerData.changeFor : null,
          observacoes: customerData.observations || '',
          dataHora: new Date().toISOString()
        };

        console.log('========================================');
        console.log('🎯 INICIANDO ENVIO DO PEDIDO');
        console.log('📦 Dados do pedido:', JSON.stringify(orderDataForWebhook, null, 2));
        console.log('🌐 URL do backend:', '/api/print-order');
        console.log('========================================');

        // Envia ao proxy do servidor (/api/print-order) que encaminha para PRINT_WEBHOOK_URL
        try {
          const proxyResp = await sendToProxy(orderDataForWebhook);
          if (!proxyResp.ok) {
            let body = null;
            try { body = await proxyResp.json(); } catch(e) { body = await proxyResp.text().catch(()=>null); }
            // server returns 400 with { error: 'PRINT_WEBHOOK_URL not configured on server' }
            const msg = body && (body.error || body.detail) ? String(body.error || body.detail) : `status ${proxyResp.status}`;
            if (proxyResp.status === 400 && String(msg).toLowerCase().includes('print_webhook_url')) {
              toast({ title: 'Ative o webhook', description: 'PRINT_WEBHOOK_URL não está configurado. Ative-o para enviar pedidos.', variant: 'destructive' });
            } else {
              toast({ title: 'Falha no envio', description: `Não foi possível encaminhar o pedido (${msg}).`, variant: 'destructive' });
            }
            throw new Error('PROXY_ERROR');
          } else {
            // Log proxy success body for debugging (may be empty)
            try {
              const txt = await proxyResp.text().catch(() => null);
              console.log('[PRINT PROXY] Success response:', txt);
            } catch (e) {
              console.log('[PRINT PROXY] Success (no body)');
            }
          }
        } catch (e: any) {
          console.error('Erro ao enviar para proxy de impressão:', e);
          throw e;
        }

      } catch (error: any) {
        console.error('========================================');
        console.error('❌ ERRO COMPLETO:');
        console.error('Mensagem:', error.message);
        console.error('Stack:', error.stack);
        console.error('========================================');
      } finally {
        setIsProcessing(false);
      }
    };
  const orderId = Date.now().toString();
    
    // Build comprehensive order data with all customization details
    const orderData = {
      orderId,
      // Estrutura items conforme esperado pelo backend - AGORA COM CUSTOMIZAÇÕES COMPLETAS
      items: items.map(item => {
        const customization = (item as any).customization || {};
        const adicionaisFiltered = (customization.adicionais || []).filter((a: string) => a && a !== 'undefined');
        
        return {
          id: item.id,
          name: item.name,
          price: Number(item.price),
          quantity: item.quantity,
          // Include detailed customization fields
          borda: customization.borda || 'Sem borda',
          adicionais: adicionaisFiltered,
          size: customization.size,
          type: customization.type,
          sabor1: customization.sabor1,
          sabor2: customization.sabor2,
          drink: customization.drink,
          drinkQuantity: customization.drinkQuantity || 0,
          observacoes: customization.observacoes,
          customization: customization
        };
      }),
      // Estrutura customer com dados completos
      customer: {
        name: customerData.name,
        phone: customerData.phone,
        cpf: '', // Será preenchido no PixPaymentModal
        address: customerData.address,
        neighborhood: customerData.neighborhood,
        reference: customerData.reference
      },
      // Estrutura delivery conforme backend espera
      delivery: {
        type: deliveryType === 'entrega' ? 'ENTREGA' : deliveryType === 'retirada' ? 'RETIRADA' : 'LOCAL',
        fee: deliveryFee,
        address: deliveryType === 'entrega' ? {
          street: customerData.address,
          neighborhood: customerData.neighborhood,
          reference: customerData.reference
        } : null
      },
      payment: {
        method: paymentMethod.toUpperCase(),
        changeFor: paymentMethod === 'dinheiro' ? customerData.changeFor : null
      },
      totals: {
        subtotal,
        deliveryFee,
        total: Number(total) // Garante que é número
      },
      observations: customerData.observations,
      timestamp: new Date().toISOString()
    };

    // Se o método de pagamento for PIX, abrir o modal do PIX com dados estruturados
  if (paymentMethod === 'pix') {
      // Debug: Verificar dados antes de abrir modal PIX
      console.log('🔍 DEBUG - Dados do pedido:', {
        items,
        orderData,
        total,
        orderId
      });

      // Validar se temos itens antes de prosseguir
      if (!items || items.length === 0) {
        toast({
          title: "Carrinho vazio",
          description: "Adicione itens ao carrinho antes de prosseguir",
          variant: "destructive",
        });
        return;
      }

      // Atualiza estado com dados estruturados e prepara o Whatsapp URL para uso posterior
      setCurrentOrderId(orderId);
      // Se o admin atualizou preços no /admin, queremos usar o preço atual
      // para itens que não são customizados (pizzas customizadas mantêm o preço salvo).
      const structured = {
        ...orderData,
        items: items.map(item => {
          const productFromStore = storeProducts.find((p: any) => p.id === item.id);
          const price = item.customization ? item.price : (productFromStore ? (Object.values(productFromStore.price)[0] ?? item.price) : item.price);
          return { id: String(item.id), name: item.name, quantity: item.quantity, price: Number(price) };
        })
      };
      setCurrentOrderData(structured);

      const pizzariaNumber = '5515997794656';
      const orderItems = items.map(item => {
        const customization = (item as any).customization;
        let itemText = `• ${item.name} (${item.quantity}x)`;
        
        if (customization) {
          const details: string[] = [];
          if (customization.borda && customization.borda !== 'Sem borda') {
            details.push(`Borda: ${customization.borda}`);
          }
          if (customization.adicionais && customization.adicionais.length > 0) {
            details.push(`Adicionais: ${customization.adicionais.filter((a: string) => a).join(', ')}`);
          }
          if (details.length > 0) {
            itemText += ` [${details.join(' | ')}]`;
          }
        }
        
        return itemText;
      }).join('\n');
      
      const message = `Olá! Acabei de fazer um pedido no Forneiro Éden Pizzaria:\n\n${orderItems}\n\nValor total: R$ ${total.toFixed(2).replace('.', ',')}\nCódigo do pedido: ${orderId}\n\nDados para ${deliveryType === 'entrega' ? 'Entrega' : deliveryType === 'retirada' ? 'Retirada' : 'Comer no Local'}:\nNome: ${customerData.name}\nTelefone: ${customerData.phone}${deliveryType === 'entrega' ? `\nEndereço: ${customerData.address}, ${customerData.neighborhood}` : ''}\nPagamento: ${paymentMethod.toUpperCase()}${customerData.observations ? `\nObservações: ${customerData.observations}` : ''}`;
      setWhatsappUrl(`https://wa.me/${pizzariaNumber}?text=${encodeURIComponent(message)}`);

      setIsPixModalOpen(true);
      return;
    }

    try {
      // run temporary debug sender for non-pix payments (will also run for pix but PIX returns earlier above)
      await handleConfirmOrder();
      // Persist the current order data in state so other flows (webhook, print) can access it
      setCurrentOrderData(orderData);

      // Use server-side proxy to forward order to configured print webhook.
      // This avoids CORS issues because the browser posts to the same origin (/api/print-order)
      // and the server forwards the body to PRINT_WEBHOOK_URL.
      try {
        const proxyResp = await sendToProxy(orderData);
        if (!proxyResp.ok) {
          let body = null;
          try { body = await proxyResp.json(); } catch(e) { body = await proxyResp.text().catch(()=>null); }
          const msg = body && (body.error || body.detail) ? String(body.error || body.detail) : `status ${proxyResp.status}`;
          if (proxyResp.status === 400 && String(msg).toLowerCase().includes('print_webhook_url')) {
            toast({ title: 'Ative o webhook', description: 'PRINT_WEBHOOK_URL não está configurado. Ative-o para enviar pedidos.', variant: 'destructive' });
          } else {
            toast({ title: 'Falha no envio', description: `Não foi possível encaminhar o pedido (${msg}).`, variant: 'destructive' });
          }
          return;
        }
      } catch (e) {
        console.error('Erro ao chamar proxy de impressão:', e);
        toast({ title: 'Erro ao enviar pedido', description: 'Tente novamente ou entre em contato conosco.', variant: 'destructive' });
        return;
      }

        // Success: prepare WhatsApp URL and show confirmation
        // Wait 3 seconds before showing confirmation popup to allow the cart to be cleared
        // and the state to be updated, so the customer can make a new order without page reload
        try {
          if (typeof onPrintSuccess === 'function') onPrintSuccess();
        } catch (err) {
          console.warn('onPrintSuccess handler failed', err);
        }
      const pizzariaNumber = '5515997794656'; // WhatsApp da pizzaria
      const orderItems = items.map(item => {
        const customization = (item as any).customization;
        let itemText = `• ${item.name} (${item.quantity}x)`;
        
        if (customization) {
          const details: string[] = [];
          if (customization.borda && customization.borda !== 'Sem borda') {
            details.push(`Borda: ${customization.borda}`);
          }
          if (customization.adicionais && customization.adicionais.length > 0) {
            details.push(`Adicionais: ${customization.adicionais.filter((a: string) => a).join(', ')}`);
          }
          if (details.length > 0) {
            itemText += ` [${details.join(' | ')}]`;
          }
        }
        
        return itemText;
      }).join('\n');
      
      const message = `Olá! Acabei de fazer um pedido no Forneiro Éden Pizzaria:\n\n${orderItems}\n\nValor total: R$ ${total.toFixed(2).replace('.', ',')}\nCódigo do pedido: ${orderId}\n\nDados para ${deliveryType === 'entrega' ? 'Entrega' : deliveryType === 'retirada' ? 'Retirada' : 'Comer no Local'}:\nNome: ${customerData.name}\nTelefone: ${customerData.phone}${deliveryType === 'entrega' ? `\nEndereço: ${customerData.address}, ${customerData.neighborhood}` : ''}\nPagamento: ${paymentMethod.toUpperCase()}${customerData.observations ? `\nObservações: ${customerData.observations}` : ''}`;
      const waUrl = `https://wa.me/${pizzariaNumber}?text=${encodeURIComponent(message)}`;
      setWhatsappUrl(waUrl);

      // Show loading state and wait 5 seconds before showing confirmation popup
      // During this time, the cart is cleared and app state is reset
      setIsLoadingConfirmation(true);
      setStep(3);
      setTimeout(() => {
        setIsLoadingConfirmation(false);
      }, 3000);

      // NOTE: onOrderComplete() and onClose() will be called only after user confirms (Ok) or optionally
      // after they press the WhatsApp button (handled by the UI below). This keeps UX in-app and non-forced.

    } catch (error) {
      console.error('Erro ao enviar pedido:', error);
      toast({
        title: "Erro ao enviar pedido",
        description: "Tente novamente ou entre em contato conosco.",
        variant: "destructive",
      });
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <MapPin className="mx-auto h-12 w-12 text-brand-red mb-4" />
        <h3 className="text-xl font-semibold mb-2">Dados para Entrega</h3>
        <p className="text-muted-foreground">Como você gostaria de receber seu pedido?</p>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium">Tipo de Entrega</h4>
        <RadioGroup value={deliveryType} onValueChange={(value: DeliveryType) => setDeliveryType(value)}>
          <div className="flex items-center space-x-2 p-3 border rounded-lg">
            <RadioGroupItem value="entrega" id="entrega" />
            <Label htmlFor="entrega" className="flex-1 cursor-pointer">
              <div className="font-medium">🚚 Entrega</div>
              <div className="text-sm text-muted-foreground">Taxa de entrega será calculada</div>
            </Label>
          </div>
          <div className="flex items-center space-x-2 p-3 border rounded-lg">
            <RadioGroupItem value="retirada" id="retirada" />
            <Label htmlFor="retirada" className="flex-1 cursor-pointer">
              <div className="font-medium">🏪 Retirada no Local</div>
              <div className="text-sm text-muted-foreground">Sem taxa adicional</div>
            </Label>
          </div>
          <div className="flex items-center space-x-2 p-3 border rounded-lg">
            <RadioGroupItem value="local" id="local" />
            <Label htmlFor="local" className="flex-1 cursor-pointer">
              <div className="font-medium">🍽️ Comer no Local</div>
              <div className="text-sm text-muted-foreground">Sem taxa adicional</div>
            </Label>
          </div>
        </RadioGroup>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">Nome Completo *</Label>
            <Input
              id="name"
              value={customerData.name}
              onChange={(e) => setCustomerData({...customerData, name: e.target.value})}
              placeholder="Seu nome completo"
            />
          </div>
          <div>
            <Label htmlFor="phone">Telefone/WhatsApp *</Label>
            <Input
              id="phone"
              value={customerData.phone}
              onChange={(e) => setCustomerData({...customerData, phone: e.target.value})}
              placeholder="(11) 99999-9999"
            />
          </div>
        </div>

        {deliveryType === 'entrega' && (
          <>
            <div>
              <Label htmlFor="address">Endereço Completo *</Label>
              <Input
                id="address"
                value={customerData.address}
                onChange={(e) => setCustomerData({...customerData, address: e.target.value})}
                placeholder="Rua, número, complemento"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="neighborhood">Bairro *</Label>
                {neighborhoodMode === 'select' ? (
                  <select
                    id="neighborhood"
                    value={customerData.neighborhood}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__other__') {
                        setNeighborhoodMode('other');
                        // remember previous selection (empty for now)
                        setPreviousNeighborhoodSelection(customerData.neighborhood || '');
                        setCustomerData({...customerData, neighborhood: ''});
                      } else {
                        setPreviousNeighborhoodSelection(val || '');
                        setCustomerData({...customerData, neighborhood: val});
                      }
                    }}
                    className={"flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"}
                  >
                    <option value="">Selecione o bairro</option>
                    {neighborhoodsList.map(n => (
                      <option key={n.key} value={n.label}>{n.label}</option>
                    ))}
                    <option value="__other__">Outro (digitar)</option>
                  </select>
                ) : (
                  <div>
                    <Input
                      id="neighborhood"
                      value={customerData.neighborhood}
                      onChange={(e) => setCustomerData({...customerData, neighborhood: e.target.value})}
                      placeholder="Digite seu bairro"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="text-sm text-muted-foreground underline"
                        onClick={() => {
                          // restore previous selection and show select again
                          setNeighborhoodMode('select');
                          setCustomerData({...customerData, neighborhood: previousNeighborhoodSelection || ''});
                        }}
                      >
                        Escolher da lista
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="reference">Ponto de Referência</Label>
                <Input
                  id="reference"
                  value={customerData.reference}
                  onChange={(e) => setCustomerData({...customerData, reference: e.target.value})}
                  placeholder="Próximo ao..."
                />
              </div>
            </div>
          </>
        )}
      </div>

      <Button onClick={handleStep1Next} className="w-full bg-gradient-primary">
        Continuar para Pagamento
      </Button>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <CreditCard className="mx-auto h-12 w-12 text-brand-red mb-4" />
        <h3 className="text-xl font-semibold mb-2">Pagamento</h3>
        <p className="text-muted-foreground">Escolha a forma de pagamento</p>
      </div>

      {/* Resumo do Pedido */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Resumo do Pedido</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Subtotal ({items.length} {items.length === 1 ? 'item' : 'itens'})</span>
            <span>R$ {subtotal.toFixed(2).replace('.', ',')}</span>
          </div>
          {deliveryType === 'entrega' && (
            <div className="flex justify-between text-sm">
              <span>Taxa de entrega</span>
              <span className={isCalculatingDelivery ? 'text-muted-foreground' : ''}>
                {isCalculatingDelivery ? 'Calculando...' : `R$ ${deliveryFee.toFixed(2).replace('.', ',')}`}
              </span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span className="text-brand-red">R$ {total.toFixed(2).replace('.', ',')}</span>
          </div>
        </CardContent>
      </Card>

      {/* Formas de Pagamento */}
      <div className="space-y-4">
        <h4 className="font-medium">Forma de Pagamento</h4>
        <RadioGroup value={paymentMethod} onValueChange={(value: PaymentMethod) => setPaymentMethod(value)}>
          <div className="flex items-center space-x-2 p-3 border rounded-lg">
            <RadioGroupItem value="pix" id="pix" />
            <Label htmlFor="pix" className="flex-1 cursor-pointer">
              <div className="font-medium">🎯 PIX</div>
              <div className="text-sm text-muted-foreground">Pagamento instantâneo</div>
            </Label>
          </div>
          <div className="flex items-center space-x-2 p-3 border rounded-lg">
            <RadioGroupItem value="dinheiro" id="dinheiro" />
            <Label htmlFor="dinheiro" className="flex-1 cursor-pointer">
              <div className="font-medium">💵 Dinheiro</div>
              <div className="text-sm text-muted-foreground">Pagamento na entrega</div>
            </Label>
          </div>
          <div className="flex items-center space-x-2 p-3 border rounded-lg">
            <RadioGroupItem value="debito" id="debito" />
            <Label htmlFor="debito" className="flex-1 cursor-pointer">
              <div className="font-medium">💳 Cartão de Débito</div>
              <div className="text-sm text-muted-foreground">Máquina na entrega</div>
            </Label>
          </div>
          <div className="flex items-center space-x-2 p-3 border rounded-lg">
            <RadioGroupItem value="credito" id="credito" />
            <Label htmlFor="credito" className="flex-1 cursor-pointer">
              <div className="font-medium">💳 Cartão de Crédito</div>
              <div className="text-sm text-muted-foreground">Máquina na entrega</div>
            </Label>
          </div>
        </RadioGroup>
      </div>

      {paymentMethod === 'dinheiro' && (
        <div>
          <Label htmlFor="change">Troco para quanto?</Label>
          <Input
            id="change"
            value={customerData.changeFor}
            onChange={(e) => setCustomerData({...customerData, changeFor: e.target.value})}
            placeholder="Ex: R$ 100,00"
          />
        </div>
      )}

      <div>
        <Label htmlFor="observations">Observações do Pedido</Label>
        <Textarea
          id="observations"
          value={customerData.observations}
          onChange={(e) => setCustomerData({...customerData, observations: e.target.value})}
          placeholder="Alguma observação especial?"
          className="min-h-[80px]"
        />
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
        <Button onClick={handleOrderSubmit} className="flex-1 bg-gradient-primary">
          Finalizar Pedido
        </Button>
      </div>
    </div>
  );

  const renderStep3 = () => {
    const eta = deliveryType === 'entrega' ? '40-60 minutos' : '20-40 minutos';
    
    // Show loading state while processing order
    if (isLoadingConfirmation) {
      return (
        <div className="space-y-6 text-center py-12">
          <div className="text-center">
            <div className="mx-auto h-20 w-20 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
            </div>
            <h3 className="text-2xl font-semibold text-blue-600 mb-2">Processando Pedido</h3>
            <p className="text-muted-foreground mb-6">Seu pedido está sendo enviado para a cozinha...</p>
          </div>
        </div>
      );
    }
    
    return (
      <div className="space-y-6 text-center">
        <div className="text-center">
          <div className="mx-auto h-20 w-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <Check className="h-10 w-10 text-green-600" />
          </div>
          <h3 className="text-2xl font-semibold text-green-600 mb-2">Pedido Confirmado!</h3>
          <p className="text-muted-foreground mb-6">Seu pedido foi recebido com sucesso e já está sendo preparado.</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 text-brand-red">
                <Clock className="w-5 h-5" />
                <span className="font-semibold">Tempo estimado: {eta}</span>
              </div>

              <div className="text-sm text-muted-foreground">
                <p>Você pode acompanhar seu pedido no WhatsApp ou fechar este popup para continuar na aplicação.</p>
              </div>

              <div className="bg-gradient-accent p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total do Pedido</span>
                  <span className="text-xl font-bold text-brand-red">R$ {total.toFixed(2).replace('.', ',')}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-center">
          <Button className="flex-1" variant="outline" onClick={() => { onOrderComplete(); onClose(); }}>
            ✅ Ok
          </Button>
          <Button className="flex-1 bg-gradient-primary" onClick={() => { if (whatsappUrl) window.open(whatsappUrl, '_blank'); }}>
            💬 Falar com a pizzaria no WhatsApp
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
    <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Finalizar Pedido</span>
              <div className="flex space-x-2">
                {[1, 2, 3].map((s) => (
                  <div
                    key={s}
                    className={`w-3 h-3 rounded-full ${
                      s === step ? 'bg-brand-red' : s < step ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  />
                ))}
              </div>
            </DialogTitle>
          </DialogHeader>

          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          <div className="mt-6">
            <div className="pt-2">
              <DevelopedBy />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PixPaymentModal
        isOpen={isPixModalOpen}
        onClose={() => setIsPixModalOpen(false)}
        total={total}
        orderId={currentOrderId || Date.now().toString()}
        orderData={currentOrderData}
        onPaymentConfirmed={() => {
          setIsPixModalOpen(false)
          setStep(3)
        }}
      />
    </>
  );
};

export default CheckoutModal;
