import { useEffect } from 'react';
import { useProducts } from './useProducts';

export function useWebSocketSync() {
  const { products: currentProducts } = useProducts();

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connect = () => {
      try {
        // Determinar URL do WebSocket baseado no ambiente
        let wsUrl = '';
        
        try {
          // 1️⃣ Tentar pegar VITE_API_BASE
          const apiBase = import.meta?.env?.VITE_API_BASE ? String(import.meta.env.VITE_API_BASE).trim() : '';
          console.log('📋 VITE_API_BASE:', apiBase || '(vazio)');
          
          if (apiBase && apiBase.length > 0) {
            // Converter HTTPS para WSS, HTTP para WS
            wsUrl = apiBase.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
            // Remover trailing slash e /api
            wsUrl = wsUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
            console.log('✅ URL do WebSocket (de VITE_API_BASE):', wsUrl);
          } else {
            // 2️⃣ Se não tem VITE_API_BASE, usar window.location
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host;
            wsUrl = `${protocol}//${host}`;
            console.log('✅ URL do WebSocket (de window.location):', wsUrl);
          }
        } catch (e) {
          console.warn('⚠️ Erro ao determinar URL WebSocket:', e);
          // Fallback para mesma origem
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const host = window.location.host;
          wsUrl = `${protocol}//${host}`;
          console.log('⚠️ Fallback URL:', wsUrl);
        }

        if (!wsUrl || wsUrl.length === 0) {
          throw new Error('Não conseguiu determinar URL do WebSocket');
        }

        console.log('🔌 Conectando ao WebSocket:', wsUrl);
        ws = new WebSocket(wsUrl);

        ws.addEventListener('open', () => {
          console.log('✅ WebSocket conectado com sucesso!');
          // Enviar ping periodicamente para manter conexão viva
          const pingInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send('ping');
            } else {
              clearInterval(pingInterval);
            }
          }, 30000); // 30 segundos
        });

        ws.addEventListener('message', (event) => {
          try {
            console.log('📨 Mensagem WebSocket recebida:', event.data.slice(0, 100));
            
            // 🔍 Verificar se é JSON válido
            let data;
            try {
              data = JSON.parse(event.data);
            } catch (parseError) {
              // Se não for JSON válido (ex: "pong" simples), ignorar
              console.log('⚠️ Mensagem não é JSON válido, ignorando:', event.data);
              return;
            }
            
            if (data.type === 'products_update') {
              console.log('📦 🎉 ATUALIZAÇÃO DE PRODUTOS RECEBIDA:', data.payload.length, 'produtos');
              
              // Atualizar o store Zustand com os novos produtos
              const normalizedProducts = data.payload.map((p: any) => ({
                ...p,
                available: p.available === true ? true : p.available === false ? false : true
              }));
              
              useProducts.setState({ products: normalizedProducts });
              console.log('✅ Produtos sincronizados em tempo real via WebSocket!');
            } else if (data.type === 'pong') {
              // Resposta do ping do servidor
              console.log('💓 Pong recebido do servidor');
            } else if (data.type === 'payment_update') {
              // Ignorar atualizações de pagamento por enquanto
              console.log('💳 Payment update recebida (ignorada por enquanto)');
            } else {
              console.log('❓ Mensagem de tipo desconhecido:', data.type);
            }
          } catch (error) {
            console.warn('⚠️ Erro ao processar mensagem WebSocket:', error);
          }
        });

        ws.addEventListener('error', (event) => {
          console.error('❌ Erro WebSocket:', event);
        });

        ws.addEventListener('close', () => {
          console.log('⚠️ WebSocket desconectado, reconectando em 3 segundos...');
          ws = null;
          
          // Reconectar automaticamente após 3 segundos
          reconnectTimeout = setTimeout(() => {
            connect();
          }, 3000);
        });
      } catch (error) {
        console.error('❌ Erro ao conectar WebSocket:', error);
        
        // Tentar reconectar
        reconnectTimeout = setTimeout(() => {
          connect();
        }, 3000);
      }
    };

    // Conectar ao montar
    connect();

    // Cleanup ao desmontar
    return () => {
      if (ws) {
        ws.close();
        ws = null;
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, []);
}
