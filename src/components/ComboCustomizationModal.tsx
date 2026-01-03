import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Product } from "@/data/products";
import { useProducts } from "@/hooks/useProducts";
import HalfPizzaModal from "@/components/HalfPizzaModal";
import DevelopedBy from "@/components/DevelopedBy";
import ScrollHint from "@/components/ui/ScrollHint";

interface ComboCustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  combo: Product | null;
  onAddToCart: (productId: string, quantity: number, productData: any) => void;
}

const ComboCustomizationModal = ({ isOpen, onClose, combo, onAddToCart }: ComboCustomizationModalProps) => {
  const [selectedDrink, setSelectedDrink] = useState<string>('');
  const [selectedPizza1, setSelectedPizza1] = useState<string>('');
  const [selectedPizza2, setSelectedPizza2] = useState<string>('');
  const [pizzaType1, setPizzaType1] = useState<'inteira' | 'meia-meia'>('inteira');
  const [pizzaType2, setPizzaType2] = useState<'inteira' | 'meia-meia'>('inteira');
  const [borda, setBorda] = useState<string>('borda-requeijao');
  const [adicionais, setAdicionais] = useState<string[]>([]);
  const [observacoes, setObservacoes] = useState<string>('');
  const [pizza1Half, setPizza1Half] = useState<{ half1Id: string; half2Id: string; half1Name: string; half2Name: string } | null>(null);
  const [pizza2Half, setPizza2Half] = useState<{ half1Id: string; half2Id: string; half1Name: string; half2Name: string } | null>(null);
  const [isHalfModalOpenFor, setIsHalfModalOpenFor] = useState<null | 1 | 2>(null);
  const [pizza1SaborA, setPizza1SaborA] = useState<string>('');
  const [pizza1SaborB, setPizza1SaborB] = useState<string>('');
  const [pizza2SaborA, setPizza2SaborA] = useState<string>('');
  const [pizza2SaborB, setPizza2SaborB] = useState<string>('');
  // refs for sections to enable auto-scroll on mobile
  const sabor2Ref = useRef<HTMLDivElement | null>(null);
  const bordaRef = useRef<HTMLDivElement | null>(null);
  const adicionaisRef = useRef<HTMLDivElement | null>(null);
  const secondPizzaRef = useRef<HTMLDivElement | null>(null);

  // helper to add temporary highlight
  const highlightRef = useRef<any>(null);

  const scrollToSection = (el: HTMLElement | null) => {
    // Intentionally no-op: remove programmatic scrolling/highlight to avoid DOM detach
    // race conditions in some embedded WebViews/devices. The ScrollHint overlay remains.
    return;
  }

  // scroll hint state and ref for the scrollable content
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [showScrollHint, setShowScrollHint] = useState<boolean>(true);

  const { products } = useProducts();

  useEffect(() => {
    if (!contentRef.current) return;
    const el = contentRef.current;
    let hideTimeout: any = null;

    const onScroll = () => {
      // if near bottom, hide hint
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 160) {
        setShowScrollHint(false);
      } else {
        setShowScrollHint(true);
      }
      // user interacted: hide after a short delay
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => setShowScrollHint(false), 4000);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    // hide automatically after 7s even without scroll
    const autoHide = setTimeout(() => setShowScrollHint(false), 7000);

    return () => {
      el.removeEventListener('scroll', onScroll);
      clearTimeout(autoHide);
      clearTimeout(hideTimeout);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && combo?.drinkOptions && combo.drinkOptions.length > 0) {
      setSelectedDrink(combo.drinkOptions[0]);
    }
  }, [isOpen, combo]);

  // Reset/cleanup when modal closes or unmounts
  useEffect(() => {
    if (!isOpen) {
      setSelectedDrink(combo?.drinkOptions?.[0] || '');
      setSelectedPizza1('');
      setSelectedPizza2('');
      setPizzaType1('inteira');
      setPizzaType2('inteira');
      setBorda('borda-requeijao');
      setAdicionais([]);
      setObservacoes('');
    }
    return () => {
      // noop cleanup to avoid touching transient flags during unmount
    };
  }, [isOpen]);

  if (!combo) return null;

  const isComboFamilia = combo.pizzaCount === 2;
  
  // Pizzas disponíveis para combos (sabores 1 ao 10 - promocionais)
  const pizzaOptions = products.filter(p => p.category === 'pizzas-promocionais');

  // Opções de bebida
  const drinkOptions = combo.drinkOptions?.map(drinkId => {
    const drink = products.find(p => p.id === drinkId);
    return drink ? { id: drink.id, name: drink.name } : null;
  }).filter(Boolean) || [];

  // Borda options (combo: requeijao grátis)
  const bordaProducts = products.filter(p => p.category === 'bordas');
  const bordaOptions = [
    { id: 'sem-borda', name: 'Sem borda', price: 0 },
    ...bordaProducts.map(b => ({
      id: b.id,
      name: b.name,
      price: b.price.grande
    }))
  ];

  // Adicionais options (cobrados normalmente)
  const adicionaisProducts = products.filter(p => p.category === 'adicionais');
  const adicionaisOptions = adicionaisProducts.map(a => ({ id: a.id, name: a.name, price: a.price.grande }));

  // Pizzas disponíveis para combos (sabores promocionais)

  const selectedDrinkData = products.find(p => p.id === selectedDrink);

  const calculateTotalPrice = () => {
    let total = combo.price.grande || 0;
    // borda: requeijao é grátis nos combos
    if (borda && borda !== 'sem-borda') {
      if (borda === 'borda-requeijao') {
        // grátis
      } else {
        const b = bordaOptions.find(x => x.id === borda);
        if (b) total += b.price;
      }
    }
    // adicionais
    adicionais.forEach(id => {
      const a = adicionaisOptions.find(x => x.id === id);
      if (a) total += a.price;
    });
    return total;
  };

  const handleAddToCart = () => {
    // Validate drinks (combo requires selecting the free drink)
    if (!selectedDrink) {
      toast({ title: "Selecione a bebida", description: "Por favor, escolha a bebida do combo.", variant: "destructive" });
      return;
    }

    // Validate pizzas (support inteira or meia-meia selections)
    const getPizzaDisplay = (type: 'inteira' | 'meia-meia', selectedId: string, halfObj: any) => {
      if (type === 'meia-meia') {
        if (halfObj) return `${halfObj.half1Name} / ${halfObj.half2Name}`;
        // if no halfObj, require both sabores selected via selects
        return null;
      }
      return pizzaOptions.find(p => p.id === selectedId)?.name || null;
    }

    // derive pizza displays (support meia-meia via Half modal OR via the two selects pizza1SaborA/B)
    let pizza1Display: string | null = null;
    if (pizzaType1 === 'meia-meia') {
      if (pizza1Half) {
        pizza1Display = `${pizza1Half.half1Name} / ${pizza1Half.half2Name}`;
      } else if (pizza1SaborA && pizza1SaborB) {
        const pA = pizzaOptions.find(p => p.id === pizza1SaborA);
        const pB = pizzaOptions.find(p => p.id === pizza1SaborB);
        if (pA && pB) pizza1Display = `${pA.name} / ${pB.name}`;
      }
    } else {
      pizza1Display = pizzaOptions.find(p => p.id === selectedPizza1)?.name || null;
    }
    if (!pizza1Display) {
      toast({ title: "Selecione a pizza", description: "Por favor, escolha o sabor da primeira pizza.", variant: "destructive" });
      return;
    }

    let pizza2Display: string | null = null;
    if (isComboFamilia) {
      if (pizzaType2 === 'meia-meia') {
        if (pizza2Half) {
          pizza2Display = `${pizza2Half.half1Name} / ${pizza2Half.half2Name}`;
        } else if (pizza2SaborA && pizza2SaborB) {
          const pA = pizzaOptions.find(p => p.id === pizza2SaborA);
          const pB = pizzaOptions.find(p => p.id === pizza2SaborB);
          if (pA && pB) pizza2Display = `${pA.name} / ${pB.name}`;
        }
      } else {
        pizza2Display = pizzaOptions.find(p => p.id === selectedPizza2)?.name || null;
      }
      if (!pizza2Display) {
        toast({ title: "Selecione a segunda pizza", description: "Por favor, escolha o sabor da segunda pizza.", variant: "destructive" });
        return;
      }
    }

    const selectedDrinkData = products.find(p => p.id === selectedDrink);

    let productName = `${combo.name}`;
    if (isComboFamilia) {
      productName += ` - ${pizza1Display} + ${pizza2Display}`;
    } else {
      productName += ` - ${pizza1Display}`;
    }
    productName += ` + ${selectedDrinkData?.name}`;

    const totalPrice = calculateTotalPrice();

    const productData: any = {
      name: productName,
      price: totalPrice,
      customization: {
        drink: selectedDrinkData?.name,
        borda: bordaOptions.find(b => b.id === borda)?.name || 'Sem borda',
        adicionais: adicionais.map(id => adicionaisOptions.find(a => a.id === id)?.name).filter(Boolean),
        observacoes
      }
    };

    // Include pizza1/pizza2 customization
    if (pizzaType1 === 'meia-meia') {
      if (pizza1Half) {
        productData.customization.pizza1 = { isHalf: true, half1: pizza1Half.half1Name, half2: pizza1Half.half2Name };
      } else {
        const pA = pizzaOptions.find(p => p.id === pizza1SaborA);
        const pB = pizzaOptions.find(p => p.id === pizza1SaborB);
        productData.customization.pizza1 = { isHalf: true, half1: pA?.name, half2: pB?.name };
      }
    } else {
      productData.customization.pizza1 = pizzaOptions.find(p => p.id === selectedPizza1)?.name;
    }

    if (isComboFamilia) {
      if (pizzaType2 === 'meia-meia') {
        if (pizza2Half) {
          productData.customization.pizza2 = { isHalf: true, half1: pizza2Half.half1Name, half2: pizza2Half.half2Name };
        } else {
          const pA = pizzaOptions.find(p => p.id === pizza2SaborA);
          const pB = pizzaOptions.find(p => p.id === pizza2SaborB);
          productData.customization.pizza2 = { isHalf: true, half1: pA?.name, half2: pB?.name };
        }
      } else {
        productData.customization.pizza2 = pizzaOptions.find(p => p.id === selectedPizza2)?.name;
      }
    }

    try {
      onAddToCart(`${combo.id}-${Date.now()}`, 1, productData);
      toast({ title: "Combo adicionado!", description: `${productName} foi adicionado ao carrinho.` });
      // Reset form
      setSelectedDrink(combo.drinkOptions?.[0] || '');
      setSelectedPizza1('');
      setSelectedPizza2('');
      setPizzaType1('inteira');
      setPizzaType2('inteira');
      setBorda('borda-requeijao');
      setAdicionais([]);
      setObservacoes('');
      // Do not call onClose here; closing is managed by handleConfirm/handleClose
      return true;
    } catch (err) {
      console.error('add to cart failed', err);
      toast({ title: 'Erro', description: 'Não foi possível adicionar ao carrinho.', variant: 'destructive' });
      return false;
    }
  };

  const handleClose = () => {
    // defer close to avoid synchronous teardown races in some environments
    setTimeout(() => {
      try { onClose(); } catch (e) {}
    }, 0);
  };

  const handleConfirm = async () => {
    const ok = await Promise.resolve(handleAddToCart());
    if (ok) {
      // defer close slightly to let UI settle
      setTimeout(() => {
        try { onClose(); } catch (e) {}
      }, 0);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent open={isOpen} className="max-w-2xl max-h-[90vh]">
        <div ref={contentRef} className="max-h-[90vh] overflow-y-auto p-4 relative">
          {/* Scroll hint overlay */}
            <ScrollHint show={showScrollHint} />

          <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            Personalizar {combo.name}
          </DialogTitle>
          <p className="text-muted-foreground">
            {combo.description}
          </p>
        </DialogHeader>

        {/* Seleção de Bebida */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Escolha a Bebida (Grátis)</h3>
          <RadioGroup value={selectedDrink} onValueChange={setSelectedDrink}>
            {drinkOptions.map((drink) => (
              <div key={drink.id} className="flex items-center space-x-2 p-3 border rounded-lg">
                <RadioGroupItem value={drink.id} id={drink.id} />
                <Label htmlFor={drink.id} className="flex-1 cursor-pointer">
                  <div className="font-medium">{drink.name}</div>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <Separator />

        {/* Seleção da Primeira Pizza */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">
            {isComboFamilia ? 'Primeira Pizza' : 'Escolha o Sabor da Pizza'}
          </h3>
          <div className="space-y-3">
            <RadioGroup value={pizzaType1} onValueChange={(v: 'inteira' | 'meia-meia') => setPizzaType1(v)}>
              <div className="flex items-center space-x-2 p-3 border rounded-lg">
                <RadioGroupItem value="inteira" id="combo1-inteira" />
                <Label htmlFor="combo1-inteira" className="flex-1 cursor-pointer">
                  <div className="font-medium">Pizza Inteira</div>
                  <div className="text-sm text-muted-foreground">Um sabor para toda a pizza</div>
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-lg mt-2">
                <RadioGroupItem value="meia-meia" id="combo1-meia" />
                <Label htmlFor="combo1-meia" className="flex-1 cursor-pointer">
                  <div className="font-medium">Meia a Meia</div>
                  <div className="text-sm text-muted-foreground">Dois sabores na mesma pizza</div>
                  <div className="text-xs text-brand-red">Preço do sabor mais caro</div>
                </Label>
              </div>
            </RadioGroup>

            {pizzaType1 === 'inteira' ? (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Select value={selectedPizza1} onValueChange={(v) => { setSelectedPizza1(v); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o sabor da pizza" />
                    </SelectTrigger>
                    <SelectContent>
                      {pizzaOptions.map((pizza) => (
                        <SelectItem key={pizza.id} value={pizza.id}>
                          <div className="flex justify-between items-center w-full">
                            <span>{pizza.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div ref={sabor2Ref} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Sabor 1</Label>
                  <Select value={pizza1SaborA} onValueChange={(v) => { setPizza1SaborA(v); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o primeiro sabor" />
                    </SelectTrigger>
                    <SelectContent>
                      {pizzaOptions.map((pizza) => (
                        <SelectItem key={pizza.id} value={pizza.id}>
                          <div className="flex justify-between items-center w-full">
                            <span>{pizza.name}</span>
                            <span className="ml-2 text-brand-red">R$ {pizza.price.grande.toFixed(2).replace('.', ',')}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium">Sabor 2</Label>
                  <Select value={pizza1SaborB} onValueChange={(v) => { setPizza1SaborB(v); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o segundo sabor" />
                    </SelectTrigger>
                    <SelectContent>
                      {pizzaOptions.map((pizza) => (
                        <SelectItem key={pizza.id} value={pizza.id}>
                          <div className="flex justify-between items-center w-full">
                            <span>{pizza.name}</span>
                            <span className="ml-2 text-brand-red">R$ {pizza.price.grande.toFixed(2).replace('.', ',')}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          {pizza1Half && (
            <div className="mt-2 flex items-center gap-2">
              <div className="text-sm bg-brand-red/10 px-2 py-1 rounded">
                Meia-meia: {pizza1Half.half1Name} / {pizza1Half.half2Name}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPizza1Half(null)}>Limpar</Button>
            </div>
          )}
        </div>

        {/* Seleção da Segunda Pizza (apenas para Combo Família) */}
        {isComboFamilia && (
          <>
            <Separator />
            <div className="space-y-4">
              <div ref={secondPizzaRef} />
              <h3 className="text-lg font-semibold">Segunda Pizza</h3>
              <div className="space-y-3">
                <RadioGroup value={pizzaType2} onValueChange={(v: 'inteira' | 'meia-meia') => setPizzaType2(v)}>
                  <div className="flex items-center space-x-2 p-3 border rounded-lg">
                    <RadioGroupItem value="inteira" id="combo2-inteira" />
                    <Label htmlFor="combo2-inteira" className="flex-1 cursor-pointer">
                      <div className="font-medium">Pizza Inteira</div>
                      <div className="text-sm text-muted-foreground">Um sabor para toda a pizza</div>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-3 border rounded-lg mt-2">
                    <RadioGroupItem value="meia-meia" id="combo2-meia" />
                    <Label htmlFor="combo2-meia" className="flex-1 cursor-pointer">
                      <div className="font-medium">Meia a Meia</div>
                      <div className="text-sm text-muted-foreground">Dois sabores na mesma pizza</div>
                      <div className="text-xs text-brand-red">Preço do sabor mais caro</div>
                    </Label>
                  </div>
                </RadioGroup>

                {pizzaType2 === 'inteira' ? (
                  <div>
                    <Select value={selectedPizza2} onValueChange={(v) => { setSelectedPizza2(v); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o sabor da segunda pizza" />
                      </SelectTrigger>
                      <SelectContent>
                        {pizzaOptions.map((pizza) => (
                          <SelectItem key={pizza.id} value={pizza.id}>
                            <div className="flex justify-between items-center w-full">
                              <span>{pizza.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div ref={adicionaisRef} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium">Sabor 1</Label>
                      <Select value={pizza2SaborA} onValueChange={(v) => { setPizza2SaborA(v); }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o primeiro sabor" />
                        </SelectTrigger>
                        <SelectContent>
                          {pizzaOptions.map((pizza) => (
                            <SelectItem key={pizza.id} value={pizza.id}>
                              <div className="flex justify-between items-center w-full">
                                <span>{pizza.name}</span>
                                <span className="ml-2 text-brand-red">R$ {pizza.price.grande.toFixed(2).replace('.', ',')}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Sabor 2</Label>
                      <Select value={pizza2SaborB} onValueChange={(v) => { setPizza2SaborB(v); }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o segundo sabor" />
                        </SelectTrigger>
                        <SelectContent>
                          {pizzaOptions.map((pizza) => (
                            <SelectItem key={pizza.id} value={pizza.id}>
                              <div className="flex justify-between items-center w-full">
                                <span>{pizza.name}</span>
                                <span className="ml-2 text-brand-red">R$ {pizza.price.grande.toFixed(2).replace('.', ',')}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
              {pizza2Half && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="text-sm bg-brand-orange/10 px-2 py-1 rounded">
                    Meia-meia: {pizza2Half.half1Name} / {pizza2Half.half2Name}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setPizza2Half(null)}>Limpar</Button>
                </div>
              )}
            </div>
          </>
        )}

        <Separator />

        {/* Borda (Fixa - Requeijão Grátis) */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2 p-4 border rounded-lg bg-brand-red/5">
            <div className="flex-1">
              <h3 className="text-lg font-semibold">Borda Requeijão</h3>
              <p className="text-sm text-muted-foreground">Incluído no combo (Grátis)</p>
            </div>
            <div className="font-bold text-brand-red text-lg">Grátis</div>
          </div>
        </div>

        <Separator />

        {/* Adicionais */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Adicionais</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {adicionaisOptions.map((option) => (
              <div key={option.id} className="flex items-center space-x-2 p-3 border rounded-lg">
                <Checkbox id={`adicional-${option.id}`} checked={adicionais.includes(option.id)} onCheckedChange={(checked) => {
                  if (checked) setAdicionais([...adicionais, option.id]); else setAdicionais(adicionais.filter(a => a !== option.id));
                }} />
                <Label htmlFor={`adicional-${option.id}`} className="flex-1 cursor-pointer">
                  <div className="flex justify-between items-center">
                    <div className="font-medium text-sm">{option.name}</div>
                    <div className="font-bold text-brand-red text-sm">+ R$ {option.price.toFixed(2).replace('.', ',')}</div>
                  </div>
                </Label>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Observações */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Observações (Opcional)</h3>
          <Textarea placeholder="Ex: sem cebola, sem sal" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className="min-h-[80px]" />
        </div>

        <Separator />

        {/* Resumo */}
        <div className="bg-gradient-accent p-4 rounded-lg">
          <div className="flex justify-between items-center">
            <div>
              <h4 className="font-semibold">Total do Combo</h4>
              <p className="text-sm text-muted-foreground">
                {isComboFamilia ? '2 Pizzas' : '1 Pizza'} + {borda === 'borda-requeijao' ? 'Borda Requeijão (Grátis)' : (bordaOptions.find(b => b.id === borda)?.name || 'Sem borda')} + {selectedDrinkData?.name || 'Refrigerante 2L'}
              </p>
            </div>
            <div className="text-2xl font-bold text-brand-red">
              R$ {calculateTotalPrice().toFixed(2).replace('.', ',')}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="outline" onClick={handleClose} className="flex-1">
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            className="flex-1 bg-gradient-primary"
          >
            {`Adicionar ao Carrinho - R$ ${calculateTotalPrice().toFixed(2).replace('.', ',')}`}
          </Button>
        </div>
        <div className="pt-4">
          <DevelopedBy />
        </div>

          {/* Half pizza modal used to return selection for a specific pizza slot */}
        <HalfPizzaModal
          isOpen={isHalfModalOpenFor !== null}
          onClose={() => setIsHalfModalOpenFor(null)}
          pizzas={pizzaOptions}
          onAddToCart={() => {}}
          isComboContext={true}
          combo={combo}
          returnSelectionOnly={true}
          onConfirmSelection={(selection) => {
            if (isHalfModalOpenFor === 1) {
              setPizza1Half(selection);
              // when user chooses meia-meia, clear single selection to avoid conflicts
              setSelectedPizza1('');
            } else if (isHalfModalOpenFor === 2) {
              setPizza2Half(selection);
              setSelectedPizza2('');
            }
            setIsHalfModalOpenFor(null);
          }}
        />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ComboCustomizationModal;
