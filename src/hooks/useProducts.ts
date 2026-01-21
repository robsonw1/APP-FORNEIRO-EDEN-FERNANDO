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
      products: initialProducts.map(product => ({ ...product, available: product.available ?? true })),
      isLoading: false,
      
      syncProducts: async () => {
        try {
          set({ isLoading: true });

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

            // Garante que todos os produtos têm 'available' definido
            const productsWithAvailable = Array.isArray(remoteProducts) 
              ? remoteProducts.map(p => ({ ...p, available: p.available ?? true }))
              : initialProducts;

            // Só sobrescreve se o servidor realmente retornar produtos
            if (Array.isArray(remoteProducts) && remoteProducts.length > 0) {
              set({ products: productsWithAvailable });
            } else {
              console.warn('⚠️ Servidor retornou lista vazia — mantendo catálogo local');
              set({ products: initialProducts.map(p => ({ ...p, available: p.available ?? true })) });
            }
          } else {
            console.warn('⚠️ Falha ao sincronizar produtos do servidor, usando cache local');
            set({ products: initialProducts.map(p => ({ ...p, available: p.available ?? true })) });
          }
        } catch (error) {
          console.warn('⚠️ Erro ao sincronizar produtos:', error);
          set({ products: initialProducts.map(p => ({ ...p, available: p.available ?? true })) });
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
              ? { ...product, ...updates, available: updates.available ?? product.available ?? true }
              : product
          ),
        }));
      },
      
      createProduct: async (newProduct: Product) => {
        try {
          // Garantir que available está definido
          const productToCreate = { ...newProduct, available: newProduct.available ?? true };
          
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
            body: JSON.stringify(productToCreate)
          });
          
          if (response.ok) {
            console.log('✅ Produto criado no servidor:', productToCreate.id);
            // Atualizar localmente com o produto criado
            set((state) => ({ products: [productToCreate, ...state.products] }));
            // Sincronizar do servidor para garantir que está salvo
            await get().syncProducts();
          } else {
            console.warn('⚠️ Falha ao criar produto no servidor:', response.status);
            // Mesmo se falhar no servidor, adiciona localmente
            set((state) => ({ products: [productToCreate, ...state.products] }));
          }
        } catch (error) {
          console.warn('⚠️ Erro ao criar produto:', error);
        }
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
