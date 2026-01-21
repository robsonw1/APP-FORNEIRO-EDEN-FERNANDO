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
  lastUpdateTime: number; // Timestamp da última atualização para evitar race conditions
}

export const useProducts = create<ProductsStore>()(
  persist(
    (set, get) => ({
      products: initialProducts.map(product => ({ 
        ...product, 
        available: product.available === true ? true : product.available === false ? false : true 
      })),
      isLoading: false,
      lastUpdateTime: Date.now(),
      
      syncProducts: async () => {
        try {
          set({ isLoading: true });
          
          // Verificar se houve atualização recente (nos últimos 2 segundos)
          const now = Date.now();
          const timeSinceLastUpdate = now - (get().lastUpdateTime || 0);
          
          // Se houve atualização muito recente, não sobrescrever (deixar o usuário editar sem interferência)
          if (timeSinceLastUpdate < 2000) {
            console.log('⏳ Atualização recente detectada, aguardando antes de sincronizar...');
            set({ isLoading: false });
            return;
          }

          let apiUrl = '/api/products';
          try {
            const apiBase = import.meta?.env?.VITE_API_BASE ? String(import.meta.env.VITE_API_BASE) : '';
            if (apiBase && (apiBase.startsWith('http://') || apiBase.startsWith('https://'))) {
              apiUrl = `${apiBase}/api/products`;
            }
          } catch (e) {}

          const response = await fetch(apiUrl);
          if (response.ok) {
            const remoteProducts = await response.json();
            console.log('📥 Produtos sincronizados do servidor:', Array.isArray(remoteProducts) ? remoteProducts.length : 'invalid');

            // Garante que todos os produtos têm 'available' como booleano
            const normalizedProducts = Array.isArray(remoteProducts) 
              ? remoteProducts.map(p => ({ 
                  ...p, 
                  available: p.available === true ? true : p.available === false ? false : true 
                }))
              : initialProducts;

            // Só sobrescreve se o servidor realmente retornar produtos
            if (Array.isArray(remoteProducts) && remoteProducts.length > 0) {
              set({ products: normalizedProducts, lastUpdateTime: now });
            } else {
              console.warn('⚠️ Servidor retornou lista vazia — mantendo catálogo local');
            }
          } else {
            console.warn('⚠️ Falha ao sincronizar produtos do servidor');
          }
        } catch (error) {
          console.warn('⚠️ Erro ao sincronizar produtos:', error);
        } finally {
          set({ isLoading: false });
        }
      },
      
      updateProduct: async (productId, updates) => {
        // 📤 Atualizar no servidor PRIMEIRO, aguardando resposta
        try {
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
            
            // ✅ Só atualizar localmente APÓS confirmar no servidor
            set((state) => ({
              products: state.products.map((product) =>
                product.id === productId
                  ? { ...product, ...updates, available: updates.available ?? product.available ?? true }
                  : product
              ),
              lastUpdateTime: Date.now(), // Marcar hora da atualização para evitar sobrescrita pela sync
            }));
          } else {
            console.warn('⚠️ Falha ao atualizar produto no servidor, status:', response.status);
            // Mostrar erro mas não atualizar localmente se falhar
          }
        } catch (error) {
          console.warn('⚠️ Erro ao atualizar produto:', error);
        }
      },
      
      createProduct: async (newProduct: Product) => {
        try {
          // Garantir que available está definido
          const productToCreate = { 
            ...newProduct, 
            available: newProduct.available === true ? true : newProduct.available === false ? false : true 
          };
          
          // 📤 Criar no servidor PRIMEIRO
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
            body: JSON.stringify(productToCreate)
          });
          
          if (response.ok) {
            console.log('✅ Produto criado no servidor:', productToCreate.id);
            // ✅ Só atualizar localmente APÓS confirmar no servidor
            set((state) => ({ 
              products: [productToCreate, ...state.products],
              lastUpdateTime: Date.now(),
            }));
          } else {
            console.warn('⚠️ Falha ao criar produto no servidor:', response.status);
          }
        } catch (error) {
          console.warn('⚠️ Erro ao criar produto:', error);
        }
      },
      
      deleteProduct: async (productId: string) => {
        try {
          // 📤 Deletar no servidor PRIMEIRO
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
            // ✅ Só atualizar localmente APÓS confirmar no servidor
            set((state) => ({ 
              products: state.products.filter(p => p.id !== productId),
              lastUpdateTime: Date.now(),
            }));
          } else {
            console.warn('⚠️ Falha ao deletar produto do servidor');
          }
        } catch (error) {
          console.warn('⚠️ Erro ao deletar produto:', error);
        }
      },
      
      getProductsByCategory: (category: string) => {
        const allProducts = get().products;
        if (!allProducts || allProducts.length === 0) {
          console.warn('⚠️ Nenhum produto disponível para filtrar.');
          return [];
        }

        const filteredProducts = allProducts.filter(product => product.category === category);
        if (filteredProducts.length === 0) {
          console.warn(`⚠️ Nenhum produto encontrado para a categoria: ${category}`);
        }

        return filteredProducts;
      },
    }),
    {
      name: 'products-storage',
      // Ao rehidratar, evite que um valor vazio sobrescreva o catálogo inicial
      onRehydrateStorage: () => (persistedState) => {
        try {
          const persisted = persistedState?.products;
          console.log('🔁 Rehydrated products-storage:', persisted ? persisted.length : 'none');
          if (!persisted || (Array.isArray(persisted) && persisted.length === 0)) {
            console.warn('⚠️ Persistência encontrou products vazios; mantendo catálogo local inicial');
          }
        } catch (e) {
          console.warn('⚠️ Erro onRehydrateStorage:', e);
        }
      }
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
