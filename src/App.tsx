import { useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { router } from "./routes";
import { AuthProvider } from "@/contexts/AuthContext";

const queryClient = new QueryClient();

function App() {
  // PROTEÇÃO GLOBAL - PRIMEIRA COISA A EXECUTAR
  useEffect(() => {
    const originalRemoveChild = Node.prototype.removeChild;
    const originalRemove = Element.prototype.remove;
    
    Node.prototype.removeChild = function(child) {
      try {
        if (this.contains(child)) {
          return originalRemoveChild.call(this, child);
        }
        console.warn('[Fix] Prevented removeChild error');
        return child;
      } catch (e) {
        console.error('[Fix] Error intercepted:', e);
        return child;
      }
    } as any;
    
    Element.prototype.remove = function() {
      try {
        if (this.parentNode) {
          originalRemove.call(this);
        }
      } catch (e) {
        console.warn('[Fix] Prevented remove error:', e);
      }
    };
    
    console.log('✅ Proteção DOM ativada');
    
    return () => {
      Node.prototype.removeChild = originalRemoveChild;
      Element.prototype.remove = originalRemove;
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <RouterProvider router={router} />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
