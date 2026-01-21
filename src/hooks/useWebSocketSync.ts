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
        let wsUrl = 'ws://localhost:3001';
        
        try {
          const apiBase = import.meta?.env?.VITE_API_BASE ? String(import.meta.env.VITE_API_BASE) : '';
          if (apiBase) {
            // Converter HTTPS para WSS, HTTP para WS
            wsUrl = apiBase.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
          }
        } catch (e) {
          console.warn('⚠️ Erro ao determinar URL WebSocket');
        }

        console.log('🔌 Conectando ao WebSocket:', wsUrl);
        ws = new WebSocket(wsUrl);

        ws.addEventListener('open', () => {
          console.log('✅ WebSocket conectado');
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
            const data = JSON.parse(event.data);
            
            if (data.type === 'products_update') {
              console.log('📦 Atualização de produtos recebida:', data.payload.length, 'produtos');
              
              // Atualizar o store Zustand com os novos produtos
              const normalizedProducts = data.payload.map((p: any) => ({
                ...p,
                available: p.available === true ? true : p.available === false ? false : true
              }));
              
              useProducts.setState({ products: normalizedProducts });
              console.log('✅ Produtos sincronizados em tempo real');
            } else if (data.type === 'pong') {
              // Resposta do ping do servidor
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
