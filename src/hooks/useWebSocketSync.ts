import { useEffect } from 'react';
import { useProducts } from './useProducts';

export function useWebSocketSync() {
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let pollInterval: NodeJS.Timeout | null = null;
    let lastProductHash = '';

    // Calcular hash dos produtos para detectar mudanças
    const getProductsHash = (products: any[]) => {
      try {
        return JSON.stringify(products.map(p => ({ id: p.id, available: p.available }))).substring(0, 100);
      } catch {
        return '';
      }
    };

    // Fallback: polling HTTP a cada 2 segundos
    const startPolling = () => {
      if (pollInterval) clearInterval(pollInterval);
      
      pollInterval = setInterval(async () => {
        try {
          let apiUrl = '/api/products';
          try {
            const apiBase = import.meta?.env?.VITE_API_BASE ? String(import.meta.env.VITE_API_BASE) : '';
            if (apiBase) {
              apiUrl = `${apiBase}/api/products`;
            }
          } catch (e) {}

          const response = await fetch(apiUrl, { signal: AbortSignal.timeout(3000) });
          if (!response.ok) return;

          const remoteProducts = await response.json();
          if (!Array.isArray(remoteProducts) || remoteProducts.length === 0) return;

          const remoteHash = getProductsHash(remoteProducts);
          if (remoteHash !== lastProductHash) {
            console.log('🔄 POLLING: Produtos atualizados detectados!');
            lastProductHash = remoteHash;
            
            const normalizedProducts = remoteProducts.map((p: any) => ({
              ...p,
              available: p.available === true ? true : p.available === false ? false : true
            }));
            
            useProducts.setState({ products: normalizedProducts });
            console.log('✅ Produtos sincronizados via polling HTTP');
          }
        } catch (error) {
          console.warn('⚠️ Erro no polling:', error);
        }
      }, 2000); // Polling a cada 2 segundos
    };

    const connect = () => {
      try {
        let wsUrl = '';
        
        try {
          const apiBase = import.meta?.env?.VITE_API_BASE ? String(import.meta.env.VITE_API_BASE).trim() : '';
          console.log('📋 VITE_API_BASE:', apiBase || '(vazio)');
          
          if (apiBase && apiBase.length > 0) {
            wsUrl = apiBase.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
            wsUrl = wsUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
            console.log('✅ URL do WebSocket (de VITE_API_BASE):', wsUrl);
          } else {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host;
            wsUrl = `${protocol}//${host}`;
            console.log('✅ URL do WebSocket (de window.location):', wsUrl);
          }
        } catch (e) {
          console.warn('⚠️ Erro ao determinar URL WebSocket:', e);
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const host = window.location.host;
          wsUrl = `${protocol}//${host}`;
          console.log('⚠️ Fallback URL:', wsUrl);
        }

        if (!wsUrl || wsUrl.length === 0) {
          throw new Error('Não conseguiu determinar URL do WebSocket');
        }

        console.log('🔌 Tentando conectar ao WebSocket:', wsUrl);
        const wsWithTimeout = new Promise<WebSocket>((resolve, reject) => {
          const ws = new WebSocket(wsUrl);
          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('WebSocket connection timeout'));
          }, 5000);

          ws.addEventListener('open', () => {
            clearTimeout(timeout);
            resolve(ws);
          });

          ws.addEventListener('error', () => {
            clearTimeout(timeout);
            reject(new Error('WebSocket connection failed'));
          });
        });

        wsWithTimeout.then((socket) => {
          ws = socket;
          console.log('✅ WebSocket CONECTADO COM SUCESSO!');
          
          // Inicializar hash ao conectar (pega do estado atual)
          const currentState = useProducts.getState();
          lastProductHash = getProductsHash(currentState.products);

          // Ping para manter vivo
          const pingInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send('ping');
            } else {
              clearInterval(pingInterval);
            }
          }, 30000);

          ws.addEventListener('message', (event) => {
            try {
              console.log('📨 WebSocket message:', event.data.slice(0, 80));
              let data;
              try {
                data = JSON.parse(event.data);
              } catch {
                return; // Ignorar se não for JSON
              }

              if (data.type === 'products_update') {
                console.log('📦 🎉 ATUALIZAÇÃO DE PRODUTOS VIA WEBSOCKET:', data.payload.length);
                lastProductHash = getProductsHash(data.payload);
                
                const normalizedProducts = data.payload.map((p: any) => ({
                  ...p,
                  available: p.available === true ? true : p.available === false ? false : true
                }));

                useProducts.setState({ products: normalizedProducts });
                console.log('✅ Sincronizado via WebSocket!');
              } else if (data.type === 'pong') {
                // Ignore pong
              }
            } catch (error) {
              console.warn('⚠️ Erro ao processar WebSocket message:', error);
            }
          });

          ws.addEventListener('close', () => {
            console.log('⚠️ WebSocket desconectado');
            ws = null;
            // Reconectar em 5 segundos
            reconnectTimeout = setTimeout(connect, 5000);
          });

          ws.addEventListener('error', (event) => {
            console.error('❌ WebSocket error:', event);
          });

          // Se WebSocket conectou, parar polling
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
        }).catch((error) => {
          console.warn('❌ WebSocket failed:', error.message);
          console.log('📡 Iniciando polling HTTP como fallback...');
          startPolling(); // Fallback para polling
        });
      } catch (error) {
        console.error('❌ Erro ao conectar WebSocket:', error);
        console.log('📡 Iniciando polling HTTP como fallback...');
        startPolling();
      }
    };

    // Conectar ao montar
    connect();

    // Sempre manter polling como fallback (2 segundos é rápido o suficiente)
    startPolling();

    // Cleanup ao desmontar
    return () => {
      if (ws) {
        ws.close();
        ws = null;
      }
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, []);
}
