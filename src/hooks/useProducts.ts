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
      products: initialProducts.map(product => ({ 
        ...product, 
        available: product.available === true ? true : product.available === false ? false : true 
      })),
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

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 segundo timeout
          
          try {
            const response = await fetch(apiUrl, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (response.ok) {
              const remoteProducts = await response.json();
              if (Array.isArray(remoteProducts) && remoteProducts.length > 0) {
                const normalizedProducts = remoteProducts.map(p => ({ 
                  ...p, 
                  available: p.available === true ? true : p.available === false ? false : true 
                }));
                set({ products: normalizedProducts });
                console.log('✅ Sincronização bem-sucedida:', remoteProducts.length, 'produtos');
              }
            }
          } catch (timeoutError) {
            clearTimeout(timeoutId);
            console.warn('⚠️ Timeout ao sincronizar com servidor');
          }
        } catch (error) {
          console.warn('⚠️ Sincronização com servidor falhou, usando cache local');
        } finally {
          set({ isLoading: false });
        }
      },
      
      updateProduct: async (productId, updates) => {
        // ✅ PRIMEIRO: Atualizar localmente IMEDIATAMENTE - NÃO ESPERA POR NADA
        set((state) => ({
          products: state.products.map((product) =>
            product.id === productId
              ? { 
                  ...product, 
                  ...updates, 
                  available: updates.available !== undefined ? updates.available : (product.available ?? true)
                }
              : product
          ),
        }));

        // 📤 DEPOIS: Tentar sincronizar com servidor (completamente assíncrono)
        // Se falhar, a atualização local permanece
        (async () => {
          try {
            let apiUrl = `/api/products/${productId}`;
            try {
              const apiBase = import.meta?.env?.VITE_API_BASE ? String(import.meta.env.VITE_API_BASE) : '';
              if (apiBase && (apiBase.startsWith('http://') || apiBase.startsWith('https://'))) {
                apiUrl = `${apiBase}/api/products/${productId}`;
              }
            } catch (e) {}
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch(apiUrl, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updates),
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (response.ok) {
              console.log('✅ Servidor confirmou atualização:', productId);
            }
          } catch (error) {
            console.warn('⚠️ Erro ao sincronizar atualização, mas local foi atualizado:', error.message);
          }
        })();
      },
      
      createProduct: async (newProduct: Product) => {
        const productToCreate = { 
          ...newProduct, 
          available: newProduct.available === true ? true : (newProduct.available === false ? false : true)
        };
        
        // ✅ PRIMEIRO: Adicionar localmente IMEDIATAMENTE
        set((state) => ({ 
          products: [productToCreate, ...state.products],
        }));

        // 📤 DEPOIS: Tentar sincronizar com servidor (assíncrono, sem bloquear)
        (async () => {
          try {
            let apiUrl = '/api/products';
            try {
              const apiBase = import.meta?.env?.VITE_API_BASE ? String(import.meta.env.VITE_API_BASE) : '';
              if (apiBase && (apiBase.startsWith('http://') || apiBase.startsWith('https://'))) {
                apiUrl = `${apiBase}/api/products`;
              }
            } catch (e) {}
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(productToCreate),
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (response.ok) {
              console.log('✅ Servidor confirmou criação:', productToCreate.id);
            }
          } catch (error) {
            console.warn('⚠️ Erro ao sincronizar criação, mas local foi criado:', error.message);
          }
        })();
      },
      
      deleteProduct: async (productId: string) => {
        // ✅ PRIMEIRO: Remover localmente IMEDIATAMENTE
        set((state) => ({ 
          products: state.products.filter(p => p.id !== productId),
        }));

        // 📤 DEPOIS: Tentar sincronizar com servidor (assíncrono, sem bloquear)
        (async () => {
          try {
            let apiUrl = `/api/products/${productId}`;
            try {
              const apiBase = import.meta?.env?.VITE_API_BASE ? String(import.meta.env.VITE_API_BASE) : '';
              if (apiBase && (apiBase.startsWith('http://') || apiBase.startsWith('https://'))) {
                apiUrl = `${apiBase}/api/products/${productId}`;
              }
            } catch (e) {}
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch(apiUrl, { 
              method: 'DELETE',
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (response.ok) {
              console.log('✅ Servidor confirmou exclusão:', productId);
            }
          } catch (error) {
            console.warn('⚠️ Erro ao sincronizar exclusão, mas local foi deletado:', error.message);
          }
        })();
      },
      
      getProductsByCategory: (category: string) => {
        const allProducts = get().products;
        if (!allProducts || allProducts.length === 0) {
          return [];
        }
        return allProducts.filter(product => product.category === category);
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
