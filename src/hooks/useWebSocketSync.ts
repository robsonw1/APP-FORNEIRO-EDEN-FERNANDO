import { useEffect } from 'react';
import { useProducts } from './useProducts';

/**
 * Hook simples de sincronização de produtos
 * Faz polling a cada 1 segundo para garantir que todos os clientes vejam as mudanças em tempo real
 * Funciona em qualquer ambiente (local, produção, atrás de proxy)
 */
export function useWebSocketSync() {
  useEffect(() => {
    let pollingInterval: NodeJS.Timeout | null = null;
    let lastHash = '';

    // Calcula hash simples para detectar mudanças
    const calculateHash = (products: any[]): string => {
      try {
        const data = products.map(p => `${p.id}:${p.available}`).join('|');
        return data;
      } catch {
        return '';
      }
    };

    // Inicia polling de sincronização
    const startSync = () => {
      if (pollingInterval) clearInterval(pollingInterval);

      pollingInterval = setInterval(async () => {
        try {
          let apiUrl = '/api/products';
          
          // Tenta usar API customizada se disponível
          if (import.meta?.env?.VITE_API_BASE) {
            const base = String(import.meta.env.VITE_API_BASE).trim();
            if (base) {
              apiUrl = base.endsWith('/') ? `${base}api/products` : `${base}/api/products`;
            }
          }

          const response = await fetch(apiUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store'
          });

          if (!response.ok) return;

          const remoteProducts = await response.json();
          if (!Array.isArray(remoteProducts)) return;

          // Calcula hash dos produtos remotos
          const remoteHash = calculateHash(remoteProducts);

          // Se mudou, atualiza localmente
          if (remoteHash !== lastHash && remoteHash) {
            lastHash = remoteHash;
            console.log('🔄 Sincronizando produtos - mudanças detectadas');

            // Normaliza e atualiza
            const normalized = remoteProducts.map((p: any) => ({
              ...p,
              available: p.available === true ? true : p.available === false ? false : true
            }));

            useProducts.setState({ products: normalized });
          }
        } catch (error) {
          // Falha silenciosa - continua tentando
        }
      }, 1000); // Polling a cada 1 segundo - rápido e eficiente
    };

    // Iniciar sincronização
    startSync();

    // Cleanup
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, []);
}
