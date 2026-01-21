import { useEffect } from 'react';
import { useProducts } from './useProducts';

/**
 * Sincronização agressiva e eficiente
 * Polling a cada 500ms para sincronização em tempo real
 */
export function useWebSocketSync() {
  useEffect(() => {
    const { syncProducts } = useProducts.getState();
    let interval: NodeJS.Timeout | null = null;

    const startSync = () => {
      // Sincroniza a cada 500ms - bem rápido
      interval = setInterval(() => {
        syncProducts().catch(() => {});
      }, 500);
    };

    startSync();

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);
}
