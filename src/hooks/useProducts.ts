import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Product, products as initialProducts } from '@/data/products';
import { useEffect } from 'react';

interface ProductsStore {
  products: Product[];
  updateProduct: (productId: string, updates: Partial<Product>) => void;
  createProduct: (newProduct: Product) => void;
  deleteProduct: (productId: string) => void;
  getProductsByCategory: (category: string) => Product[];
  syncProducts: () => Promise<void>;
  isLoading: boolean;
}

export const useProducts = create<ProductsStore>()(
  persist(
    (set, get) => ({
      products: initialProducts.map(product => ({ ...product, available: true })),
      isLoading: false,
      
      syncProducts: async () => {
        try {
          set({ isLoading: true });
          
          // 🔄 Buscar produtos do servidor
          let apiUrl = '/api/products';
          try {
            // @ts-ignore
            const apiBase = import.meta?.env?.VITE_API_BASE ? String(import.meta.env.VITE_API_BASE) : '';
            if (apiBase && (apiBase.startsWith('http://') || apiBase.startsWith('https://'))) {
              apiUrl = `${apiBase}/api/products`;
            }
          } catch (e) {}
          
          const response = await fetch(apiUrl);
          if (response.ok) {
            const remoteProducts = await response.json();
            console.log('📥 Produtos sincronizados do servidor:', remoteProducts.length);
            set({ products: remoteProducts });
          } else {
            console.warn('⚠️ Falha ao sincronizar produtos do servidor, usando cache local');
          }
        } catch (error) {
          console.warn('⚠️ Erro ao sincronizar produtos:', error);
        } finally {
          set({ isLoading: false });
        }
      },
      
      updateProduct: async (productId, updates) => {
        try {
          // 📤 Atualizar no servidor
          let apiUrl = `/api/products/${productId}`;
          try {
            // @ts-ignore
            const apiBase = import.meta?.env?.VITE_API_BASE ? String(import.meta.env.VITE_API_BASE) : '';
            if (apiBase && (apiBase.startsWith('http://') || apiBase.startsWith('https://'))) {
              apiUrl = `${apiBase}/api/products/${productId}`;
            }
          } catch (e) {}
          
          const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
          });
          
          if (response.ok) {
            console.log('✅ Produto atualizado no servidor:', productId);
          } else {
            console.warn('⚠️ Falha ao atualizar produto no servidor');
          }
        } catch (error) {
          console.warn('⚠️ Erro ao atualizar produto:', error);
        }
        
        // ✅ Atualizar localmente imediatamente
        set((state) => ({
          products: state.products.map((product) =>
            product.id === productId
              ? { ...product, ...updates }
              : product
          ),
        }));
      },
      
      createProduct: async (newProduct: Product) => {
        try {
          // 📤 Criar no servidor
          let apiUrl = '/api/products';
          try {
            // @ts-ignore
            const apiBase = import.meta?.env?.VITE_API_BASE ? String(import.meta.env.VITE_API_BASE) : '';
            if (apiBase && (apiBase.startsWith('http://') || apiBase.startsWith('https://'))) {
              apiUrl = `${apiBase}/api/products`;
            }
          } catch (e) {}
          
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newProduct)
          });
          
          if (response.ok) {
            console.log('✅ Produto criado no servidor:', newProduct.id);
          } else {
            console.warn('⚠️ Falha ao criar produto no servidor');
          }
        } catch (error) {
          console.warn('⚠️ Erro ao criar produto:', error);
        }
        
        // ✅ Atualizar localmente imediatamente
        set((state) => ({ products: [newProduct, ...state.products] }));
      },
      
      deleteProduct: async (productId: string) => {
        try {
          // 📤 Deletar no servidor
          let apiUrl = `/api/products/${productId}`;
          try {
            // @ts-ignore
            const apiBase = import.meta?.env?.VITE_API_BASE ? String(import.meta.env.VITE_API_BASE) : '';
            if (apiBase && (apiBase.startsWith('http://') || apiBase.startsWith('https://'))) {
              apiUrl = `${apiBase}/api/products/${productId}`;
            }
          } catch (e) {}
          
          const response = await fetch(apiUrl, { method: 'DELETE' });
          
          if (response.ok) {
            console.log('✅ Produto deletado do servidor:', productId);
          } else {
            console.warn('⚠️ Falha ao deletar produto do servidor');
          }
        } catch (error) {
          console.warn('⚠️ Erro ao deletar produto:', error);
        }
        
        // ✅ Atualizar localmente imediatamente
        set((state) => ({ products: state.products.filter(p => p.id !== productId) }));
      },
      
      getProductsByCategory: (category: string) => {
        return get().products.filter(product => product.category === category);
      },
    }),
    {
      name: 'products-storage',
    }
  )
);

// 🔄 Hook para sincronização automática
export function useProductsSync() {
  const { syncProducts } = useProducts();
  
  useEffect(() => {
    // Sincronizar ao montar
    syncProducts();
    
    // Sincronizar a cada 5 segundos
    const interval = setInterval(() => {
      syncProducts();
    }, 5000);
    
    // Sincronizar quando a aba fica visível novamente
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('📱 Aba visível, sincronizando produtos...');
        syncProducts();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [syncProducts]);
}
