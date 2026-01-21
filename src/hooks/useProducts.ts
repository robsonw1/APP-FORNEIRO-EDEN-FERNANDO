import { create } from 'zustand';
import { Product, products as initialProducts } from '@/data/products';
import { useEffect } from 'react';

interface ProductsStore {
  products: Product[];
  updateProduct: (productId: string, updates: Partial<Product>) => Promise<void>;
  createProduct: (newProduct: Product) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;
  getProductsByCategory: (category: string) => Product[];
  syncProducts: () => Promise<void>;
  isLoading: boolean;
}

const getApiUrl = () => {
  try {
    const base = import.meta?.env?.VITE_API_BASE ? String(import.meta.env.VITE_API_BASE).trim() : '';
    if (base && (base.startsWith('http://') || base.startsWith('https://'))) {
      return base.endsWith('/') ? base.slice(0, -1) : base;
    }
  } catch (e) {}
  return '';
};

export const useProducts = create<ProductsStore>()((set, get) => ({
  products: initialProducts,
  isLoading: false,

  syncProducts: async () => {
    try {
      set({ isLoading: true });
      
      const baseUrl = getApiUrl();
      const apiUrl = baseUrl ? `${baseUrl}/api/products` : '/api/products';
      
      const response = await fetch(`${apiUrl}?v=${Date.now()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          set({ products: data });
        }
      }
    } catch (error) {
      console.error('Erro ao sincronizar:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  updateProduct: async (productId, updates) => {
    const baseUrl = getApiUrl();
    const apiUrl = baseUrl ? `${baseUrl}/api/products/${productId}` : `/api/products/${productId}`;

    try {
      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        // Atualiza localmente
        set((state) => ({
          products: state.products.map((p) =>
            p.id === productId ? { ...p, ...updates } : p
          )
        }));
        
        // Sincroniza com servidor após sucesso
        setTimeout(() => get().syncProducts(), 100);
      }
    } catch (error) {
      console.error('Erro ao atualizar:', error);
    }
  },

  createProduct: async (newProduct) => {
    const baseUrl = getApiUrl();
    const apiUrl = baseUrl ? `${baseUrl}/api/products` : '/api/products';

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProduct)
      });

      if (response.ok) {
        // Resincroniza para pegar dados atualizados
        setTimeout(() => get().syncProducts(), 100);
      }
    } catch (error) {
      console.error('Erro ao criar:', error);
    }
  },

  deleteProduct: async (productId) => {
    const baseUrl = getApiUrl();
    const apiUrl = baseUrl ? `${baseUrl}/api/products/${productId}` : `/api/products/${productId}`;

    try {
      const response = await fetch(apiUrl, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        // Resincroniza para pegar dados atualizados
        setTimeout(() => get().syncProducts(), 100);
      }
    } catch (error) {
      console.error('Erro ao deletar:', error);
    }
  },

  getProductsByCategory: (category: string) => {
    return get().products.filter((product) => product.category === category);
  }
}));

/**
 * Hook de sincronização automática
 * Sincroniza produtos a cada 2 segundos
 */
export function useProductsSync() {
  const { syncProducts } = useProducts();

  useEffect(() => {
    // Sincronizar imediatamente ao montar
    syncProducts();

    // Sincronizar a cada 2 segundos
    const interval = setInterval(() => {
      syncProducts();
    }, 2000);

    return () => clearInterval(interval);
  }, [syncProducts]);
}
