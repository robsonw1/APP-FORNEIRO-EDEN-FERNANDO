import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProducts, useProductsSync } from '@/hooks/useProducts';
import ProductList from './components/ProductList';
import AddProductModal from './components/AddProductModal';
import EstablishmentSettings from './components/EstablishmentSettings';
import Neighborhoods from './Neighborhoods';
import ChangePasswordDialog from './components/ChangePasswordDialog';

const Dashboard = () => {
  const { products, updateProduct, createProduct, deleteProduct } = useProducts();
  
  // 🔄 Sincronizar produtos automaticamente
  useProductsSync();

  const categorizedProducts = {
    pizzas: products.filter(p => 
      ['pizzas-promocionais', 'pizzas-premium', 'pizzas-tradicionais', 'pizzas-especiais', 'pizzas-doces'].includes(p.category)
    ),
    bebidas: products.filter(p => p.category === 'bebidas'),
    adicionais: products.filter(p => p.category === 'adicionais'),
    bordas: products.filter(p => p.category === 'bordas'),
    combos: products.filter(p => p.category === 'combos'),
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Painel de Administração</h1>
        <ChangePasswordDialog />
      </div>
      <div className="space-y-4">
        <Accordion type="single" collapsible defaultValue="establishment">
          <AccordionItem value="establishment">
            <AccordionTrigger className="bg-card hover:bg-muted/50 rounded-md px-4"> 
              <div className="flex flex-col text-left">
                <span className="font-semibold">Configurações do Estabelecimento</span>
                <span className="text-xs text-muted-foreground">Clique para expandir</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <Card>
                <CardContent>
                  <EstablishmentSettings />
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="delivery">
            <AccordionTrigger className="bg-card hover:bg-muted/50 rounded-md px-4">
              <div className="flex flex-col text-left">
                <span className="font-semibold">Configurações de Entrega</span>
                <span className="text-xs text-muted-foreground">Gerencie bairros e taxas</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <Card>
                <CardContent>
                  <Neighborhoods />
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="menu">
            <AccordionTrigger className="bg-card hover:bg-muted/50 rounded-md px-4">
              <div className="flex flex-col text-left">
                <span className="font-semibold">Gerenciamento do Cardápio</span>
                <span className="text-xs text-muted-foreground">Adicionar, editar e publicar itens</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <Card>
                <CardContent>
                  <Tabs defaultValue="pizzas">
                    <TabsList className="grid w-full grid-cols-5">
                      <TabsTrigger value="pizzas">Pizzas</TabsTrigger>
                      <TabsTrigger value="bebidas">Bebidas</TabsTrigger>
                      <TabsTrigger value="adicionais">Adicionais</TabsTrigger>
                      <TabsTrigger value="bordas">Bordas</TabsTrigger>
                      <TabsTrigger value="combos">Combos</TabsTrigger>
                    </TabsList>
                    {Object.entries(categorizedProducts).map(([category, items]) => (
                      <TabsContent key={category} value={category}>
                        <ProductList 
                          products={items}
                          onUpdateProduct={updateProduct}
                          onCreateProduct={(p) => createProduct(p)}
                          onDeleteProduct={(id) => deleteProduct(id)}
                        />
                      </TabsContent>
                    ))}
                  </Tabs>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Add Product modal root */}
        <AddProductModal isOpen={false} onClose={() => {}} onCreate={(p) => createProduct(p)} />

        <Button 
          onClick={() => {
            const products = categorizedProducts.pizzas.concat(
              categorizedProducts.bebidas,
              categorizedProducts.adicionais,
              categorizedProducts.bordas,
              categorizedProducts.combos
            );
            products.forEach(product => {
              updateProduct(product.id, { available: true });
            });
          }}
          className="w-full"
        >
          Marcar Todos como Disponíveis
        </Button>
      </div>
    </div>
  );
};

export default Dashboard;
