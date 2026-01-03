import { useState, useEffect, useRef } from "react";
import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Product } from "@/data/products";
import { useProducts } from "@/hooks/useProducts";
import DevelopedBy from "@/components/DevelopedBy";
import ScrollHint from "@/components/ui/ScrollHint";

interface PizzaCustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  pizza: Product | null;
  onAddToCart: (productId: string, quantity: number, productData: any) => void;
  preSelectedPizza?: string; // ID da pizza pré-selecionada
  allowedPizzaCategories?: string[]; // Categorias permitidas (opcional)
}

const PizzaCustomizationModal = ({ isOpen, onClose, pizza, onAddToCart, preSelectedPizza, allowedPizzaCategories }: PizzaCustomizationModalProps) => {
  const [pizzaType, setPizzaType] = useState<'inteira' | 'meia-meia'>('inteira');
  const [size, setSize] = useState<'broto' | 'grande'>('grande');
  const [borda, setBorda] = useState<string>('sem-borda');
  const [adicionais, setAdicionais] = useState<string[]>([]);
  const [selectedDrink, setSelectedDrink] = useState<string>('sem-bebida');
  const [observacoes, setObservacoes] = useState('');
  const [sabor1, setSabor1] = useState<string>('');
  const [sabor2, setSabor2] = useState<string>('');

  const { products } = useProducts();

  // refs for auto-scroll and highlight
  const sabor2Ref = useRef<HTMLDivElement | null>(null);
  const bordaRef = useRef<HTMLDivElement | null>(null);
  const adicionaisRef = useRef<HTMLDivElement | null>(null);
  const bebidasRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const highlightRef = useRef<any>(null);
  const [showScrollHint, setShowScrollHint] = useState<boolean>(true);
  const [drinkQuantity, setDrinkQuantity] = useState<number>(0);
  // Moda do Cliente state: up to 6 free ingredients (custom flavors)
  const [modaIngredientes, setModaIngredientes] = useState<string[]>([]);
  const [modaAssignments, setModaAssignments] = useState<Record<string, 'half1' | 'half2' | 'both'>>({});

  // Special rule: 'Moda do Cliente' allows up to 6 free adicionais
  const isModaCliente = pizza?.id === 'pizza-moda-cliente';
  const MAX_MODA_ADICIONAIS = 6;

  // Wizard steps: combine size/type/flavors into a single step for a more compact flow
  const steps = React.useMemo(() => {
    const s: string[] = [];
    // single combined step for size, type and flavors
    s.push('sizeTypeFlavors');
    s.push('drinks');
    s.push('borda');
    // only include 'adicionais' for non-Moda items
    if (!isModaCliente) s.push('adicionais');
    s.push('observacoes');
    return s;
  }, [allowedPizzaCategories, isModaCliente]);

  const [stepIndex, setStepIndex] = useState<number>(0);

  const goNext = () => setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  const goPrev = () => setStepIndex((i) => Math.max(i - 1, 0));

  // Business rule: meia-meia only allowed for tamanho 'grande'
  React.useEffect(() => {
    if (size === 'broto' && pizzaType === 'meia-meia') {
      setPizzaType('inteira');
    }
  }, [size, pizzaType]);

  const validateStep = (index: number) => {
    const key = steps[index];
    // validate flavors even when combined into the single step
    if (key === 'flavors' || key === 'sizeTypeFlavors') {
      // Special handling for Moda do Cliente
      if (isModaCliente) {
        if (modaIngredientes.length === 0) {
          toast({ title: 'Escolha ingredientes', description: 'Selecione ao menos 1 ingrediente (até 6).', variant: 'destructive' });
          return false;
        }
        // if meia-meia, assignments are optional (default to 'both') but limit enforced elsewhere
        return true;
      }
      if (pizzaType === 'meia-meia' && (!sabor1 || !sabor2)) {
        toast({ title: 'Selecione os sabores', description: 'Escolha 2 sabores para meia a meia.', variant: 'destructive' });
        return false;
      }
      if (pizzaType === 'inteira' && allowedPizzaCategories?.includes('pizzas-promocionais') && !sabor1) {
        toast({ title: 'Selecione o sabor', description: 'Escolha o sabor da pizza.', variant: 'destructive' });
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep(stepIndex)) return;
    goNext();
  };

  // Reset all modal-local state to defaults
  const resetAll = () => {
    setPizzaType('inteira');
    setSize('grande');
    setBorda('sem-borda');
    setAdicionais([]);
    setSelectedDrink('sem-bebida');
    setDrinkQuantity(0);
    setObservacoes('');
    setSabor1('');
    setSabor2('');
    setModaIngredientes([]);
    setModaAssignments({});
    setStepIndex(0);
  };

  // When modal opens, reset wizard to first step and control scroll hint: only show hint for combos
  React.useEffect(() => {
    if (isOpen) {
      setStepIndex(0);
      // Show the scroll hint when the wizard contains the 'adicionais' step.
      const hasAdicionais = steps.includes('adicionais');
      setShowScrollHint(!!hasAdicionais);
      // Initialize drink quantity when opening the modal
      setDrinkQuantity(0);
    }
    // Intentionally only run on open/steps/isModaCliente changes — do not listen to selectedDrink
  }, [isOpen, steps, isModaCliente]);

  // Reset/cleanup when modal closes or unmounts to avoid stale flags
  useEffect(() => {
    if (!isOpen) {
      resetAll();
    }
    return () => {
      // noop cleanup — avoid touching transient flags that may not exist
    };
  }, [isOpen]);

  // If the user closes the modal mid-flow, clear all local selections so reopening starts fresh
  React.useEffect(() => {
    if (!isOpen) {
      resetAll();
    }
  }, [isOpen]);

  const scrollToSection = (el: HTMLElement | null) => {
    // Auto-scroll and DOM highlight removed intentionally.
    // Some WebViews/devices throw when manipulating detached DOM nodes (removeChild/isConnected
    // races). We keep the visual "ScrollHint" but avoid programmatic scrolling to guarantee
    // stability across all clients.
    return;
  };

  useEffect(() => {
    if (!contentRef.current) return;
    const el = contentRef.current;
    let hideTimeout: any = null;
    const onScroll = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 160) setShowScrollHint(false);
      else setShowScrollHint(true);
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => setShowScrollHint(false), 4000);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    const autoHide = setTimeout(() => setShowScrollHint(false), 7000);
    return () => { el.removeEventListener('scroll', onScroll); clearTimeout(autoHide); clearTimeout(hideTimeout);} ;
  }, [isOpen]);

  // Determine if this is a fixed flavor (selected from menu item, not from a combo)
  const isFixedFlavor = preSelectedPizza && !allowedPizzaCategories?.includes('pizzas-promocionais');

  // Effect para pré-selecionar pizza quando abrir o modal
  React.useEffect(() => {
    if (!isOpen) return;
    // Prefer preSelectedPizza passed by parent (used by half-pizza flows), otherwise default to the pizza's own id
    const initial = preSelectedPizza || pizza?.id;
    if (initial) {
      setSabor1(initial);
    }
  }, [isOpen, pizza, preSelectedPizza]);

  // Se modal estiver em contexto de combo, force tamanho 'grande' quando abrir.
  const openedRef = useRef(false);
  React.useEffect(() => {
    if (isOpen && !openedRef.current) {
      // first time opening the modal
      if (allowedPizzaCategories?.includes('pizzas-promocionais')) {
        if (size !== 'grande') setSize('grande');
      }
      openedRef.current = true;
    }
    if (!isOpen) openedRef.current = false;
  }, [isOpen, allowedPizzaCategories, size]);

  if (!pizza) return null;
  // Filtra apenas pizzas para os selects de sabores, considerando categorias permitidas
  const pizzaOptions = products.filter(p => {
    const isPizza = p.category.includes('pizzas');
    if (!isPizza) return false;
    
    // Se não há restrição de categorias, mostra todas as pizzas
    if (!allowedPizzaCategories || allowedPizzaCategories.length === 0) {
      return true;
    }
    
    // Se há restrição, mostra apenas as categorias permitidas
    return allowedPizzaCategories.includes(p.category);
  });

  // Mostrar Grande primeiro para vir selecionado por padrão
  const sizeOptions = [
    { id: 'grande', name: 'Grande', description: '8 fatias', price: pizza.price.grande },
    { id: 'broto', name: 'Broto', description: '4 fatias', price: pizza.price.broto }
  ];

  // Filtra bordas do cardápio 
  const bordaProducts = products.filter(p => p.category === 'bordas');
  const bordaOptions = [
    { id: 'sem-borda', name: 'Sem borda', price: 0 },
    ...bordaProducts.map(bordaProduct => {
      const isCombo = allowedPizzaCategories?.includes('pizzas-promocionais');
      const isRequeijao = bordaProduct.id === 'borda-requeijao';
      
      return {
        id: bordaProduct.id,
        name: bordaProduct.name,
        price: (isCombo && isRequeijao) ? 0 : bordaProduct.price.grande
      };
    })
  ];

  // Filtra adicionais do cardápio 
  const adicionaisProducts = products.filter(p => p.category === 'adicionais');
  const adicionaisOptions = adicionaisProducts.map(adicional => ({
    id: adicional.id,
    name: adicional.name,
    price: adicional.price.grande
  }));

  // Filtra bebidas do cardápio e adiciona a opção 'Sem Bebida' gratuita
  const bebidasProducts = products.filter(p => p.category === 'bebidas');
  const bebidasOptions = [
    { id: 'sem-bebida', name: 'Sem Bebida', price: 0 },
    ...bebidasProducts.map(b => ({
      id: b.id,
      name: b.name,
      price: (b.price && (b.price.grande ?? Object.values(b.price)[0])) || 0
    }))
  ];

  // Moda do Cliente ingredient options (use adicionais but exclude forbidden items)
  const FORBIDDEN_MODA = ['costela', 'pernil', 'carne-seca', 'cupim'];
  const modaOptions = adicionaisOptions.filter(a => !FORBIDDEN_MODA.includes(a.id));

  const toggleModaIngrediente = (id: string) => {
    if (modaIngredientes.includes(id)) {
      setModaIngredientes(modaIngredientes.filter(x => x !== id));
      const next = { ...modaAssignments };
      delete next[id];
      setModaAssignments(next);
      return;
    }
    if (modaIngredientes.length >= MAX_MODA_ADICIONAIS) {
      toast({ title: 'Limite atingido', description: `Você pode escolher até ${MAX_MODA_ADICIONAIS} ingredientes na Moda do Cliente.`, variant: 'destructive' });
      return;
    }
    setModaIngredientes([...modaIngredientes, id]);
    setModaAssignments({ ...modaAssignments, [id]: 'both' });
  };

  const setModaAssignment = (id: string, assign: 'half1' | 'half2' | 'both') => {
    setModaAssignments({ ...modaAssignments, [id]: assign });
  };

  const calculateTotal = () => {
    let basePrice = pizza.price[size];
    
    // Se for pizza inteira em combo, usar preço do sabor selecionado
    if (pizzaType === 'inteira' && sabor1 && allowedPizzaCategories?.includes('pizzas-promocionais')) {
      const selectedPizza = pizzaOptions.find(p => p.id === sabor1);
      if (selectedPizza) {
        basePrice = selectedPizza.price[size];
      }
    }
    
    // Se for meia a meia, calcular pelo sabor mais caro
    if (pizzaType === 'meia-meia' && sabor1 && sabor2) {
      const pizza1 = pizzaOptions.find(p => p.id === sabor1);
      const pizza2 = pizzaOptions.find(p => p.id === sabor2);
      
      if (pizza1 && pizza2) {
        basePrice = Math.max(pizza1.price[size], pizza2.price[size]);
      }
    }
    
    let total = basePrice;
    
    // Adicionar preço da borda (requeijão é grátis nos combos)
    const bordaOption = bordaOptions.find(b => b.id === borda);
    if (bordaOption) {
      const isCombo = allowedPizzaCategories?.includes('pizzas-promocionais');
      const isRequeijao = borda === 'borda-requeijao';
      
      if (!(isCombo && isRequeijao)) {
        total += bordaOption.price;
      }
    }
    
    // Adicionar preço dos adicionais
    adicionais.forEach(adicional => {
      const adicionalOption = adicionaisOptions.find(a => a.id === adicional);
      if (adicionalOption) {
        total += adicionalOption.price;
      }
    });
    // Adicionar preço da bebida opcional (se selecionada e diferente de 'sem-bebida')
    if (selectedDrink && selectedDrink !== 'sem-bebida' && drinkQuantity > 0) {
      const drinkOption = bebidasOptions.find(d => d.id === selectedDrink);
      if (drinkOption) total += drinkOption.price * drinkQuantity;
    }
    
    return total;
  };

  const getExpensiveFlavor = () => {
    if (pizzaType === 'meia-meia' && sabor1 && sabor2) {
      const pizza1 = pizzaOptions.find(p => p.id === sabor1);
      const pizza2 = pizzaOptions.find(p => p.id === sabor2);
      
      if (pizza1 && pizza2) {
        const price1 = pizza1.price[size];
        const price2 = pizza2.price[size];
        return price1 >= price2 ? pizza1 : pizza2;
      }
    }
    return null;
  };

  const handleAdicionalChange = (adicionalId: string, checked: boolean) => {
    if (checked) {
      if (isModaCliente && adicionais.length >= MAX_MODA_ADICIONAIS) {
        toast({ title: 'Limite atingido', description: `Você pode escolher até ${MAX_MODA_ADICIONAIS} adicionais na Moda do Cliente.`, variant: 'destructive' });
        return;
      }
      setAdicionais([...adicionais, adicionalId]);
    } else {
      setAdicionais(adicionais.filter(id => id !== adicionalId));
    }
  };

    // Original add-to-cart implementation renamed to performAddToCart so we can
    // wrap it with guards (debounce, processing flag) below.
    const performAddToCart = () => {
    if (pizzaType === 'meia-meia' && (!sabor1 || !sabor2)) {
      toast({
        title: "Selecione os sabores",
        description: "Por favor, escolha 2 sabores para sua pizza meio a meio.",
        variant: "destructive",
      });
      return;
    }

    if (pizzaType === 'inteira' && allowedPizzaCategories?.includes('pizzas-promocionais') && !sabor1) {
      toast({
        title: "Selecione o sabor",
        description: "Por favor, escolha o sabor da sua pizza.",
        variant: "destructive",
      });
      return;
    }

    const total = calculateTotal();
    const bordaOption = bordaOptions.find(b => b.id === borda);
    const selectedAdicionais = adicionais.map(id => 
      adicionaisOptions.find(a => a.id === id)
    ).filter(Boolean);

    let productName = '';
    if (pizzaType === 'meia-meia' && sabor1 && sabor2) {
      const pizza1 = pizzaOptions.find(p => p.id === sabor1);
      const pizza2 = pizzaOptions.find(p => p.id === sabor2);
      productName = `Pizza Meia a Meia: ${pizza1?.name} + ${pizza2?.name} (${sizeOptions.find(s => s.id === size)?.name})`;
    } else if (pizzaType === 'inteira' && sabor1 && allowedPizzaCategories?.includes('pizzas-promocionais')) {
      const selectedPizza = pizzaOptions.find(p => p.id === sabor1);
      productName = `${selectedPizza?.name} (${sizeOptions.find(s => s.id === size)?.name})`;
    } else {
      productName = `${pizza.name} (${sizeOptions.find(s => s.id === size)?.name})`;
    }

    const productData = {
      name: productName,
      price: total,
      customization: {
        type: pizzaType,
        size: sizeOptions.find(s => s.id === size)?.name,
        sabor1: pizzaType === 'meia-meia' ? pizzaOptions.find(p => p.id === sabor1)?.name : undefined,
        sabor2: pizzaType === 'meia-meia' ? pizzaOptions.find(p => p.id === sabor2)?.name : undefined,
        borda: bordaOption?.name,
        adicionais: selectedAdicionais.map(a => a?.name),
        modaIngredientes: isModaCliente ? modaIngredientes.map(id => ({ id, name: adicionaisOptions.find(x => x.id === id)?.name })) : undefined,
        modaAssignments: isModaCliente ? modaAssignments : undefined,
        observacoes,
        drink: selectedDrink === 'sem-bebida' ? 'Sem Bebida' : (bebidasOptions.find(d => d.id === selectedDrink)?.name || undefined),
        drinkQuantity: selectedDrink === 'sem-bebida' ? 0 : drinkQuantity
      }
    };

    // Add to cart via parent handler
    try {
      onAddToCart(`${pizza.id}-${Date.now()}`, 1, productData);
      toast({ title: 'Adicionado!', description: `${productName} foi adicionado ao carrinho.` });
      // Reset modal fields
      setSabor1('');
      setSabor2('');
      setAdicionais([]);
      setBorda('sem-borda');
      setSelectedDrink('sem-bebida');
      setDrinkQuantity(0);
      setObservacoes('');
      setStepIndex(0);
      // Note: do NOT call onClose here; closing is handled by handleConfirm/handleClose
      return true;
    } catch (err) {
      console.error('add to cart failed', err);
      toast({ title: 'Erro', description: 'Não foi possível adicionar ao carrinho.', variant: 'destructive' });
      return false;
    }
  };

  // Simple close and confirm handlers (avoid complex guards that can create
  // initialization / circular import issues). Close is delegated to parent.
  const handleClose = () => {
    try { onClose(); } catch (e) { /* swallow */ }
  };

  const handleConfirm = async () => {
    const ok = await Promise.resolve(performAddToCart());
    if (ok) {
      // allow React updates to flush before closing
      setTimeout(() => {
        try { onClose(); } catch (e) { /* swallow */ }
      }, 0);
    }
  };

  return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <div ref={contentRef} className="max-h-[90vh] overflow-y-auto p-4 relative">
            {/* Scroll hint overlay: mostra apenas na etapa 'adicionais' */}
            <ScrollHint show={steps[stepIndex] === 'adicionais' && showScrollHint} />
            <Separator />

  {/* Step: Tamanho, Tipo e Sabores (COMBINADO) */}
  {steps[stepIndex] === 'sizeTypeFlavors' && (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Tamanho, Tipo e Sabores</h3>

      {/* Tamanho */}
      <div>
        <Label className="text-sm font-medium">Tamanho</Label>
        <RadioGroup value={size} onValueChange={(v) => setSize(v as any)}>
          <div className="flex gap-2 mt-2">
            {sizeOptions.map(opt => (
              <div
                key={opt.id}
                role="button"
                tabIndex={0}
                onClick={() => setSize(opt.id as any)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSize(opt.id as any); } }}
                className={`flex-1 p-3 border rounded-lg cursor-pointer select-none ${size === opt.id ? 'ring-2 ring-offset-2 ring-brand-yellow/40' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{opt.name}</div>
                    <div className="text-sm text-muted-foreground">{opt.description}</div>
                  </div>
                  <div className="text-sm font-bold text-brand-red">R$ {opt.price.toFixed(2).replace('.', ',')}</div>
                </div>
                <div className="sr-only">
                  <RadioGroupItem value={opt.id} id={`size-${opt.id}`} />
                </div>
              </div>
            ))}
          </div>
        </RadioGroup>
      </div>

      {/* Tipo: Inteira / Meia-meia */}
      <div>
        <Label className="text-sm font-medium">Tipo</Label>
        <RadioGroup value={pizzaType} onValueChange={(v: 'inteira' | 'meia-meia') => setPizzaType(v)}>
          <div className="mt-2 space-y-2">
            <div className="flex items-center space-x-2 p-3 border rounded-lg">
              <RadioGroupItem value="inteira" id="type-inteira" />
              <Label htmlFor="type-inteira" className="flex-1 cursor-pointer">
                <div className="font-medium">Pizza Inteira</div>
                <div className="text-sm text-muted-foreground">Um sabor para toda a pizza</div>
              </Label>
            </div>
            <div className={`flex items-center space-x-2 p-3 border rounded-lg ${size === 'broto' ? 'opacity-60' : ''}`}>
              <RadioGroupItem value="meia-meia" id="type-meia" disabled={size === 'broto'} />
              <Label htmlFor="type-meia" className={`flex-1 ${size === 'broto' ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                <div className="font-medium">Meia a Meia</div>
                <div className="text-sm text-muted-foreground">Dois sabores na mesma pizza</div>
                <div className="text-xs text-brand-red">Preço do sabor mais caro</div>
                {size === 'broto' && (
                  <div className="text-xs text-muted-foreground mt-1">Meia a meia só está disponível no tamanho Grande.</div>
                )}
              </Label>
            </div>
          </div>
        </RadioGroup>
      </div>

      {/* Sabores / Moda do Cliente */}
      <div>
        {isModaCliente ? (
          <div className="mt-2">
            <Label className="text-sm font-medium">Moda do Cliente — escolha até {MAX_MODA_ADICIONAIS} ingredientes grátis</Label>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {modaOptions.map(opt => {
                const selected = modaIngredientes.includes(opt.id);
                const disabled = !selected && modaIngredientes.length >= MAX_MODA_ADICIONAIS;
                return (
                  <div key={opt.id} className={`p-3 border rounded-lg ${disabled ? 'opacity-60' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <input id={`moda-${opt.id}`} type="checkbox" checked={selected} disabled={disabled} onChange={() => toggleModaIngrediente(opt.id)} />
                        <div className="font-medium">{opt.name}</div>
                      </div>
                      <div className="text-sm text-brand-red">{opt.price === 0 ? 'Grátis' : `+ R$ ${opt.price.toFixed(2).replace('.', ',')}`}</div>
                    </div>
                    {selected && pizzaType === 'meia-meia' && (
                      <div className="mt-2 flex items-center space-x-2">
                        <div className={`px-2 py-1 rounded border ${modaAssignments[opt.id] === 'both' ? 'bg-muted' : ''} cursor-pointer`} onClick={() => setModaAssignment(opt.id, 'both')}>Ambos</div>
                        <div className={`px-2 py-1 rounded border ${modaAssignments[opt.id] === 'half1' ? 'bg-muted' : ''} cursor-pointer`} onClick={() => setModaAssignment(opt.id, 'half1')}>Metade 1</div>
                        <div className={`px-2 py-1 rounded border ${modaAssignments[opt.id] === 'half2' ? 'bg-muted' : ''} cursor-pointer`} onClick={() => setModaAssignment(opt.id, 'half2')}>Metade 2</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-sm text-muted-foreground mt-2">Selecionados: {modaIngredientes.length}/{MAX_MODA_ADICIONAIS}</div>
          </div>
        ) : (
          pizzaType === 'inteira' ? (
            <div className="mt-2">
              {isFixedFlavor ? (
                <div>
                  <Label className="text-sm font-medium">Sabor (Fixo)</Label>
                  <div className="mt-2 p-4 border rounded-lg bg-brand-red/5">
                    <div className="font-medium text-lg">{pizzaOptions.find(p => p.id === sabor1)?.name}</div>
                    <p className="text-sm text-muted-foreground mt-1">Este sabor foi selecionado do menu</p>
                    <div className="text-sm text-brand-red mt-2">R$ {pizzaOptions.find(p => p.id === sabor1)?.price.grande.toFixed(2).replace('.', ',')}</div>
                  </div>
                </div>
              ) : (
                <div>
                  <Label className="text-sm font-medium">Escolha o Sabor</Label>
                  <div className="mt-2">
                    <Select value={sabor1} onValueChange={(v) => { setSabor1(v); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o sabor da pizza" />
                      </SelectTrigger>
                      <SelectContent>
                        {pizzaOptions.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            <div className="flex justify-between items-center w-full">
                              <span>{p.name}</span>
                              <span className="ml-2 text-brand-red">R$ {p.price.grande.toFixed(2).replace('.', ',')}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div ref={sabor2Ref} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                {isFixedFlavor ? (
                  <div>
                    <Label className="text-sm font-medium">Sabor 1 (Fixo)</Label>
                    <div className="mt-2 p-3 border rounded-lg bg-brand-red/5">
                      <div className="font-medium">{pizzaOptions.find(p => p.id === sabor1)?.name}</div>
                      <p className="text-xs text-muted-foreground mt-1">Do menu</p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label className="text-sm font-medium">Sabor 1</Label>
                    <Select value={sabor1} onValueChange={(v) => { setSabor1(v); }}>
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
                )}
              </div>
              <div>
                <Label className="text-sm font-medium">Sabor 2</Label>
                <Select value={sabor2} onValueChange={(v) => { setSabor2(v); }}>
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
          )
        )}
      </div>
    </div>
  )}

  {/* Step: Bebidas (Opcional) */}
  {steps[stepIndex] === 'drinks' && (
    <div ref={bebidasRef} className="space-y-4">
      <h3 className="text-lg font-semibold">Bebidas (Opcional)</h3>
      <RadioGroup value={selectedDrink} onValueChange={(v) => {
        setSelectedDrink(v);
        if (v === 'sem-bebida') setDrinkQuantity(0);
        else if (drinkQuantity === 0) setDrinkQuantity(1);
      }}>
        {bebidasOptions.map((drink) => (
          <div key={drink.id} className="flex items-center space-x-2 p-3 border rounded-lg">
            <RadioGroupItem value={drink.id} id={`drink-${drink.id}`} />
            <Label htmlFor={`drink-${drink.id}`} className="flex-1 cursor-pointer">
              <div className="flex justify-between items-center">
                <div className="font-medium text-sm">{drink.name}</div>
                <div className="font-bold text-brand-red text-sm">
                  {drink.price === 0 ? (drink.id === 'sem-bebida' ? 'Grátis' : 'R$ 0,00') : `+ R$ ${drink.price.toFixed(2).replace('.', ',')}`}
                </div>
              </div>
            </Label>

            {/* Quantity controls shown only for the selected drink */}
            {selectedDrink === drink.id && drink.id !== 'sem-bebida' && (
              <div className="flex items-center space-x-2">
                <Button variant="outline" size="sm" onClick={() => setDrinkQuantity(q => Math.max(0, q - 1))}>-</Button>
                <div className="w-10 text-center">{drinkQuantity}</div>
                <Button variant="outline" size="sm" onClick={() => setDrinkQuantity(q => q + 1)}>+</Button>
              </div>
            )}
          </div>
        ))}
      </RadioGroup>
    </div>
  )}

        {/* Step: Borda */}
        {steps[stepIndex] === 'borda' && (
          <div ref={bordaRef} className="space-y-4">
          <h3 className="text-lg font-semibold">Borda (Opcional)</h3>
          <RadioGroup value={borda} onValueChange={setBorda}>
            {bordaOptions.map((option) => (
              <div key={option.id} className="flex items-center space-x-2 p-3 border rounded-lg">
                <RadioGroupItem value={option.id} id={`borda-${option.id}`} />
                <Label htmlFor={`borda-${option.id}`} className="flex-1 cursor-pointer">
                  <div className="flex justify-between items-center">
                    <div className="font-medium">{option.name}</div>
                    <div className="font-bold text-brand-red">
                      {option.price === 0 ? 'Grátis' : `+ R$ ${option.price.toFixed(2).replace('.', ',')}`}
                    </div>
                  </div>
                </Label>
              </div>
            ))}
          </RadioGroup>
          </div>
        )}

        <Separator />

  {/* Step: Adicionais */}
  {steps[stepIndex] === 'adicionais' && (
    <div ref={adicionaisRef} className="space-y-4">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold flex-shrink-0">Adicionais</h3>
            {isModaCliente && (
              <div className="text-sm text-muted-foreground ml-auto flex-shrink-0">{adicionais.length}/{MAX_MODA_ADICIONAIS} selecionados</div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {adicionaisOptions.map((option) => {
              const checked = adicionais.includes(option.id);
              const disabled = isModaCliente && !checked && adicionais.length >= MAX_MODA_ADICIONAIS;
              return (
                <div key={option.id} className={`flex items-center space-x-2 p-3 border rounded-lg ${disabled ? 'opacity-60' : ''}`}>
                  <Checkbox
                    id={`adicional-${option.id}`}
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={(checkedVal) => handleAdicionalChange(option.id, checkedVal as boolean)}
                  />
                  <Label htmlFor={`adicional-${option.id}`} className="flex-1 cursor-pointer">
                    <div className="flex justify-between items-center">
                      <div className="font-medium text-sm">{option.name}</div>
                      <div className="font-bold text-brand-red text-sm">
                        + R$ {option.price.toFixed(2).replace('.', ',')}
                      </div>
                    </div>
                  </Label>
                </div>
              )
            })}
          </div>
        </div>
  )}

        <Separator />

        {/* Step: Observações */}
        {steps[stepIndex] === 'observacoes' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Observações (Opcional)</h3>
            <Textarea
              placeholder="Ex: bem passada, sem cebola, etc..."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className="min-h-[80px]"
            />
          </div>
        )}

        <Separator />

        {/* Total */}
        <div className="bg-gradient-accent p-4 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-lg font-semibold">Total</span>
            <span className="text-2xl font-bold text-brand-red">
              R$ {calculateTotal().toFixed(2).replace('.', ',')}
            </span>
          </div>
        </div>

        {/* Wizard Navigation Buttons */}
          <div className="flex gap-3 pt-4">
          <Button variant="outline" onClick={handleClose} className="">
            Cancelar
          </Button>
          {stepIndex > 0 && (
            <Button variant="outline" onClick={goPrev} className="">
              Voltar
            </Button>
          )}
          <div className="flex-1" />
          {stepIndex < steps.length - 1 ? (
            <Button onClick={handleNext} className="bg-gradient-primary">
              Próximo
            </Button>
          ) : (
            <Button onClick={handleConfirm} className="bg-gradient-primary">Adicionar ao Carrinho</Button>
          )}
        </div>
        <div className="pt-4">
          <DevelopedBy />
        </div>
      </div>
    </DialogContent>
    </Dialog>
  );
};

export default PizzaCustomizationModal;
