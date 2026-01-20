import { useState, useEffect } from "react";
import { Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";

interface ProductCardProps {
  id: string;
  name: string;
  description: string;
  price: { broto: number; grande: number };
  category: 'combos' | 'pizzas-promocionais' | 'pizzas-premium' | 'pizzas-tradicionais' | 'pizzas-especiais' | 'pizzas-doces' | 'bebidas' | 'adicionais' | 'bordas';
  isPopular?: boolean;
  ingredients?: string[];
  portions?: string;
  drinkOptions?: string[];
  pizzaCount?: number;
  cartQuantity?: number;
  available?: boolean;
  onAddToCart: (productId: string, quantity: number) => void;
  onPizzaClick?: (pizzaId: string, preSelectedPizza?: string) => void;
  onHalfPizzaClick?: (pizzaId: string) => void;
}

const ProductCard = ({
  id,
  name,
  description,
  price,
  category,
  isPopular,
  ingredients,
  portions,
  drinkOptions,
  pizzaCount,
  onAddToCart,
  onPizzaClick,
  onHalfPizzaClick,
  available
}: ProductCardProps) => {
  const [localQuantity, setLocalQuantity] = useState(0);
  const { toast } = useToast();
  const isAvailable = available !== false;

  const handleAddToCart = () => {
    if (!isAvailable) {
      toast({
        variant: "destructive",
        title: "Produto indisponível",
        description: "Este item não está disponível no momento."
      });
      return;
    }

    if ((category.includes('pizzas') || category === 'combos') && onPizzaClick) {
      onPizzaClick(id, id);
    } else {
      const newQuantity = localQuantity + 1;
      setLocalQuantity(newQuantity);
      onAddToCart(id, 1); // Sempre adiciona 1 unidade
      
      if (category === 'bebidas' || category === 'adicionais' || category === 'bordas') {
        toast({
          title: "Item adicionado",
          description: `${name} adicionado ao carrinho`,
          variant: "default"
        });
      }
    }
  };

  const handleDecrement = () => {
    if (localQuantity > 0) {
      const newQuantity = localQuantity - 1;
      setLocalQuantity(newQuantity);
      onAddToCart(id, -1); // Remove 1 unidade
      
      if (category === 'bebidas' || category === 'adicionais' || category === 'bordas') {
        toast({
          title: newQuantity === 0 ? "Item removido" : "Quantidade atualizada",
          description: newQuantity === 0 ? `${name} removido do carrinho` : `${name} atualizado no carrinho`,
          variant: newQuantity === 0 ? "destructive" : "default"
        });
      }
    }
  };

  // Atualiza o estado local quando o item for atualizado no carrinho
  useEffect(() => {
    try {
      const items = JSON.parse(localStorage.getItem('cart-items') || '[]');
      const cartItem = items.find((item: any) => item.id === id);
      if (cartItem) {
        setLocalQuantity(cartItem.quantity);
      }
    } catch (error) {
      console.error('Erro ao carregar quantidade do item:', error);
      setLocalQuantity(0);
    }
  }, [id]);

  return (
    <Card className={`relative hover:shadow-lg transition-shadow duration-200 ${!isAvailable ? 'opacity-60' : ''}`}>
      <CardContent className="p-4">
        <div className="absolute top-2 right-2 flex gap-2">
          {isPopular && (
            <Badge variant="secondary">
              Popular
            </Badge>
          )}
          {!isAvailable && (
            <Badge variant="destructive">
              Indisponível
            </Badge>
          )}
        </div>

        <div className="flex flex-col">
          <h3 className="text-lg font-semibold">{name}</h3>
          <p className="text-sm text-gray-600 mt-1">{description}</p>
          
          {ingredients && ingredients.length > 0 && (
            <div className="mt-2">
              <p className="text-sm text-gray-500">
                Ingredientes: {ingredients.join(', ')}
              </p>
            </div>
          )}

          {portions && (
            <p className="text-sm text-gray-500 mt-1">
              Porções: {portions}
            </p>
          )}

          {drinkOptions && drinkOptions.length > 0 && (
            <div className="mt-2">
              <p className="text-sm text-gray-500">
                Bebidas disponíveis: {drinkOptions.join(', ')}
              </p>
            </div>
          )}

          <div className="mt-4">
            <p className="text-sm font-medium">
              {category === 'bebidas' || category === 'adicionais' || category === 'bordas' 
                ? `R$ ${price.broto.toFixed(2)}`
                : `Broto: R$ ${price.broto.toFixed(2)} | Grande: R$ ${price.grande.toFixed(2)}`
              }
            </p>
          </div>

          <div className="flex items-center justify-between mt-4">
            {/* Controles de quantidade para bebidas, adicionais e bordas */}
            {(category === 'bebidas' || category === 'adicionais' || category === 'bordas') ? (
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDecrement}
                  disabled={localQuantity === 0}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-8 text-center">{localQuantity}</span>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleAddToCart}
                  className="bg-gradient-primary hover:opacity-90"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            ) : category.startsWith('pizzas-') && (
              <div className="flex gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleAddToCart}
                >
                  Escolher
                </Button>
              </div>
            )}
            {category === 'combos' && (
              <Button
                variant="default"
                size="sm"
                onClick={handleAddToCart}
              >
                Escolher Combo
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export { ProductCard };
export default ProductCard;
