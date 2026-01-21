import { useState, useEffect } from "react";
import Header from "@/components/Header";
import CategorySection from "@/components/CategorySection";
import MobileMenuAccordion from "@/components/MobileMenuAccordion";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import DevelopedBy from '@/components/DevelopedBy';
import Cart from "@/components/Cart";
import HalfPizzaModal from "@/components/HalfPizzaModal";
import PizzaCustomizationModal from "@/components/PizzaCustomizationModal";
import ComboCustomizationModal from "@/components/ComboCustomizationModal";
import FloatingCartButton from "@/components/FloatingCartButton";
import CheckoutModal from "@/components/CheckoutModal";
import { useCart } from "@/hooks/useCart";
import { categories } from "@/data/products";
import { useProducts, useProductsSync } from "@/hooks/useProducts";
import { useWebSocketSync } from "@/hooks/useWebSocketSync";
import { products as initialProducts } from '@/data/products';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEstablishment } from '@/hooks/useEstablishment';

// Import das imagens geradas
import pizzaMargherita from "@/assets/pizza-margherita.jpg";
import pizzaPortuguesa from "@/assets/pizza-portuguesa.jpg";
import pizzaPepperoni from "@/assets/pizza-pepperoni.jpg";
import pizzaCalabresa from "@/assets/pizza-calabresa.jpg";
import pizzaQuatroQueijos from "@/assets/pizza-quatro-queijos.jpg";
import pizzaFrangoCatupiry from "@/assets/pizza-frango-catupiry.jpg";
import pizzaVegetariana from "@/assets/pizza-vegetariana.jpg";
import pizzaChocolate from "@/assets/pizza-chocolate.jpg";
import cocaCola from "@/assets/coca-cola.jpg";
import guarana2l from "@/assets/guarana-2l.jpg";
import pudimImage from "@/assets/pudim.jpg";
import brigadeiro from "@/assets/brigadeiro.jpg";
import baconExtra from "@/assets/bacon-extra.jpg";
import queijoExtra from "@/assets/queijo-extra.jpg";
import bordaCatupiry from "@/assets/borda-catupiry.jpg";
import bordaCheddar from "@/assets/borda-cheddar.jpg";

const Index = () => {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isHalfPizzaModalOpen, setIsHalfPizzaModalOpen] = useState(false);
  const [isPizzaCustomizationOpen, setIsPizzaCustomizationOpen] = useState(false);
  const [isComboCustomizationOpen, setIsComboCustomizationOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [selectedPizza, setSelectedPizza] = useState(null);
  const [selectedCombo, setSelectedCombo] = useState(null);
  const [preSelectedPizzaForHalf, setPreSelectedPizzaForHalf] = useState(null);
  const [preSelectedPizzaForCustomization, setPreSelectedPizzaForCustomization] = useState(null);
  const [activeCategory, setActiveCategory] = useState('pizzas-promocionais');
  const [openCategories, setOpenCategories] = useState<string[]>(['pizzas-promocionais']);
  const [isComboContext, setIsComboContext] = useState(false); // Para rastrear se é contexto de combo
  const { items, addToCart, updateQuantity, removeItem, getTotalItems, getTotalPrice } = useCart();
  const { clearCart } = useCart();

  // Wrap addToCart so the cart drawer opens automatically when an item is added
  const handleAddToCart = (...args: Parameters<typeof addToCart>) => {
    // Call original addToCart
    // @ts-ignore - Parameters typing may be complex, but forwarding args is fine here
    addToCart(...args);
    // Open cart drawer
    setIsCartOpen(true);
  };
  const { products } = useProducts();
  const { settings } = useEstablishment();
  
  // 🔄 Sincronizar produtos automaticamente
  useProductsSync();

  // Função para filtrar produtos por categoria
  const getProductsByCategory = (category: string) => {
    return products.filter(product => product.category === category);
  };
  const updateProductImages = (products: any[]) => {
    return products.map(product => {
      switch (product.id) {
        case 'pizza-margherita':
          return { ...product, image: pizzaMargherita };
        case 'pizza-portuguesa':
          return { ...product, image: pizzaPortuguesa };
        case 'pizza-pepperoni':
          return { ...product, image: pizzaPepperoni };
        case 'pizza-calabresa':
          return { ...product, image: pizzaCalabresa };
        case 'pizza-quatro-queijos':
          return { ...product, image: pizzaQuatroQueijos };
        case 'pizza-frango-catupiry':
          return { ...product, image: pizzaFrangoCatupiry };
        case 'pizza-vegetariana':
          return { ...product, image: pizzaVegetariana };
        case 'pizza-chocolate':
          return { ...product, image: pizzaChocolate };
        case 'coca-cola-2l':
          return { ...product, image: cocaCola };
        case 'guarana-2l':
          return { ...product, image: guarana2l };
        case 'pudim':
          return { ...product, image: pudimImage };
        case 'brigadeiro':
          return { ...product, image: brigadeiro };
        case 'bacon-extra':
          return { ...product, image: baconExtra };
        case 'queijo-extra':
          return { ...product, image: queijoExtra };
        case 'borda-catupiry':
          return { ...product, image: bordaCatupiry };
        case 'borda-cheddar':
          return { ...product, image: bordaCheddar };
        default:
          return product;
      }
    });
  };

  const handlePizzaClick = (pizzaId: string, preSelectedPizza?: string) => {
    const product = products.find(p => p.id === pizzaId);
    
    // Se for um combo, abrir modal específico para combos
    if (product && product.category === 'combos') {
      setSelectedCombo(product);
      setIsComboCustomizationOpen(true);
    } else if (product && product.category.includes('pizzas')) {
      setSelectedPizza(product);
      setPreSelectedPizzaForCustomization(preSelectedPizza || null);
      setIsComboContext(false);
      setIsPizzaCustomizationOpen(true);
    }
  };

  const handleHalfPizzaClick = (pizzaId: string) => {
    const product = products.find(p => p.id === pizzaId);
    
    // Se for um combo, usar modal específico com contexto de combo
    if (product && product.category === 'combos') {
      // Para todos os combos, usar modal de meia-meia com contexto
      setSelectedCombo(product);
      setPreSelectedPizzaForHalf(null);
      setIsComboContext(true);
      setIsHalfPizzaModalOpen(true);
    } else if (product && product.category.includes('pizzas')) {
      setSelectedCombo(null);
      setPreSelectedPizzaForHalf(product);
      setIsComboContext(false);
      setIsHalfPizzaModalOpen(true);
    }
  };

  const scrollToCategory = (categoryId: string) => {
    setActiveCategory(categoryId);
    // No mobile, abrir apenas o menu selecionado e rolar para o topo do menu
    if (window.innerWidth < 768) {
      setOpenCategories([categoryId]);
      setTimeout(() => {
        const accordionItem = document.getElementById(categoryId);
        if (accordionItem) {
          accordionItem.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 120); // pequeno delay para garantir que o menu abriu
    } else {
      const element = document.getElementById(categoryId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  useEffect(() => {
    console.log('🔍 Produtos carregados:', products);
    // Se a store estiver vazia por conta de persistência corrompida,
    // forçamos o fallback para o catálogo inicial embutido.
    if ((!products || products.length === 0) && initialProducts && initialProducts.length > 0) {
      console.warn('⚠️ Produtos vazios no estado — restaurando catálogo inicial local');
      // Uso direto da store para atualizar sem depender do servidor
      useProducts.setState({ products: initialProducts.map(p => ({ ...p, available: true })) });
    }
  }, [products]);

  // Conectar WebSocket para sincronização em tempo real
  useProductsSync();
  useWebSocketSync();

  return (
    <div className="min-h-screen bg-gradient-accent">
      <Header 
        cartItemsCount={getTotalItems()} 
        onCartClick={() => setIsCartOpen(true)} 
      />
      
      {/* Hero Section */}
      <section className="bg-gradient-primary py-12 text-white">
        <div className="container mx-auto px-4 text-center">
          {/** large logo from admin settings */}
          {settings?.logo ? (
            <img src={settings.logo} alt={settings.name} className="w-32 h-32 rounded-full object-cover border-4 border-brand-gold mx-auto mb-6" />
          ) : null}
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Forneiro Éden
          </h2>
          <p className="text-xl mb-6 opacity-90">
            A mais recheada da região 🇮🇹
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
              🚀 Entrega em 50-60min
            </Badge>
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
              ⭐ Avaliação 4.8/5
            </Badge>
          </div>
        </div>
      </section>

      {/* Menu Navigation */}
      <section className="sticky top-20 z-40 bg-surface/95 backdrop-blur-sm border-b shadow-sm">
        <div className="container mx-auto px-4 py-4 relative">
          {/* Dica de rolagem lateral (aparece só no mobile e some após 2s ou ao rolar) */}
          <div
            id="menu-scroll-hint"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-50 flex items-center pointer-events-none md:hidden animate-fade-right"
            style={{ transition: 'opacity 0.5s', opacity: 1 }}
          >
            <div className="bg-black/60 text-white px-2 py-1 rounded flex items-center text-xs shadow">
              <svg className="mr-1 animate-bounce-x" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
              Arraste para o lado
            </div>
          </div>
          <nav
            className="flex space-x-4 overflow-x-auto scrollbar-hide scroll-smooth snap-x"
            style={{ WebkitOverflowScrolling: 'touch' }}
            onScroll={() => {
              const hint = document.getElementById('menu-scroll-hint');
              if (hint) hint.style.opacity = '0';
            }}
          >
            {categories.map((category) => (
              <Button
                key={category.id}
                variant={activeCategory === category.id ? "default" : "ghost"}
                className="whitespace-nowrap text-foreground hover:text-brand-orange snap-start"
                onClick={() => {
                  scrollToCategory(category.id);
                  // Rola o menu horizontalmente até o botão clicado (mobile)
                  const btn = document.getElementById(`menu-btn-${category.id}`);
                  if (btn && window.innerWidth < 768) {
                    btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                  }
                }}
                id={`menu-btn-${category.id}`}
              >
                {category.icon} {category.name}
              </Button>
            ))}
          </nav>
        </div>
        <style>{`
          @keyframes bounce-x {
            0%, 100% { transform: translateX(0); }
            50% { transform: translateX(12px); }
          }
          .animate-bounce-x { animation: bounce-x 1.2s infinite; }
          .animate-fade-right { animation: fadeRight 1.2s 1; }
          @keyframes fadeRight {
            0% { opacity: 0; transform: translateX(-16px); }
            100% { opacity: 1; transform: translateX(0); }
          }
          .scrollbar-hide::-webkit-scrollbar { display: none; }
          .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        `}</style>
        <script dangerouslySetInnerHTML={{
          __html: `
            setTimeout(function() {
              var hint = document.getElementById('menu-scroll-hint');
              if (hint) hint.style.opacity = '0';
            }, 2200);
          `
        }} />
      </section>

      {/* Menu Content */}
      <main className="container mx-auto px-4 py-8">
        {/* FloatingCartButton */}
        <FloatingCartButton
          itemCount={getTotalItems()}
          onClick={() => setIsCartOpen(true)}
        />

        {/* Mobile Accordion Menu */}
        <MobileMenuAccordion 
          onAddToCart={handleAddToCart}
          onPizzaClick={handlePizzaClick}
          onHalfPizzaClick={handleHalfPizzaClick}
          updateProductImages={updateProductImages}
          cartItems={items}
          openCategories={openCategories}
          setOpenCategories={setOpenCategories}
        />

        {/* Desktop Menu (hidden on mobile) */}
        <div className="hidden md:block">
          {categories.map((category) => {
            const categoryProducts = updateProductImages(getProductsByCategory(category.id as any));
            if (categoryProducts.length === 0) return null;
            
            return (
              <div key={category.id} id={category.id}>
                  <CategorySection
                  title={category.name}
                  products={categoryProducts}
                  onAddToCart={handleAddToCart}
                  onPizzaClick={handlePizzaClick}
                  onHalfPizzaClick={handleHalfPizzaClick}
                  cartItems={items}
                />
              </div>
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gradient-primary text-white py-8 mt-16">
        <div className="container mx-auto px-4 text-center">
          <h3 className="text-2xl font-bold mb-2">🍕 Forneiro Éden</h3>
          <p className="mb-4">A mais recheada da região 🇮🇹</p>
          <div className="flex flex-wrap justify-center gap-6 text-sm">
            <div>📞 (15) 99779-4656</div>
            <div>📍 Rua Hércules Franceschini, 35 - Éden, Sorocaba - SP</div>
            <div>🕐 Seg-Dom: 18h às 23:50h</div>
          </div>
          <DevelopedBy className="mt-6" />
        </div>
      </footer>

      {/* Floating Cart Button */}
      <FloatingCartButton 
        itemCount={getTotalItems()} 
        onClick={() => setIsCartOpen(true)} 
      />

      {/* Cart */}
      <Cart
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={items}
        onUpdateQuantity={updateQuantity}
        onRemoveItem={removeItem}
        onCheckout={() => {
          setIsCartOpen(false);
          setIsCheckoutOpen(true);
        }}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        items={items}
        subtotal={getTotalPrice()}
        onOrderComplete={() => {
          // Close checkout modal and reset UI state
          setIsCheckoutOpen(false);
          setIsCartOpen(false);
          setSelectedPizza(null);
          setSelectedCombo(null);
          setPreSelectedPizzaForCustomization(null);
          setPreSelectedPizzaForHalf(null);
          setIsComboContext(false);
        }}
        // ✅ NOVO: Passar o clearCart do hook
        onClearCart={() => {
          console.log('📋 Limpando carrinho completo...');
          clearCart();
          setIsCheckoutOpen(false);
          setIsCartOpen(false);
          setSelectedPizza(null);
          setSelectedCombo(null);
          setPreSelectedPizzaForCustomization(null);
          setPreSelectedPizzaForHalf(null);
          setIsComboContext(false);
        }}
        onPrintSuccess={() => {
          // Clear cart immediately after successful print webhook
          clearCart();
        }}
      />

      {/* Half Pizza Modal */}
      <HalfPizzaModal
        isOpen={isHalfPizzaModalOpen}
        onClose={() => {
          setIsHalfPizzaModalOpen(false);
          setPreSelectedPizzaForHalf(null);
          setSelectedCombo(null);
          setIsComboContext(false);
        }}
        pizzas={isComboContext 
          ? products.filter(p => p.category === 'pizzas-promocionais')
          : products.filter(p => p.category.includes('pizzas'))
        }
        isComboContext={isComboContext}
        combo={selectedCombo}
        onAddToCart={handleAddToCart}
        preSelectedFlavor={preSelectedPizzaForHalf}
      />

      {/* Pizza Customization Modal */}
      <PizzaCustomizationModal
        isOpen={isPizzaCustomizationOpen}
        onClose={() => {
          setIsPizzaCustomizationOpen(false);
          setPreSelectedPizzaForCustomization(null);
          setIsComboContext(false);
        }}
        pizza={selectedPizza}
  onAddToCart={handleAddToCart}
        preSelectedPizza={preSelectedPizzaForCustomization}
        allowedPizzaCategories={isComboContext 
          ? ['pizzas-promocionais'] 
          : undefined
        }
      />

      {/* Combo Customization Modal */}
      <ComboCustomizationModal
        isOpen={isComboCustomizationOpen}
        onClose={() => {
          setIsComboCustomizationOpen(false);
          setSelectedCombo(null);
        }}
        combo={selectedCombo}
        onAddToCart={handleAddToCart}
      />

      {/* PWA Install Prompt */}
      <PWAInstallPrompt />

      {/* Floating Cart Button */}
      <FloatingCartButton
        itemCount={getTotalItems()}
        onClick={() => setIsCartOpen(true)}
      />
    </div>
  );
};

export default Index;
