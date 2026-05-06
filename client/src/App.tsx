import { Switch, Route, Router, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { CartProvider, useCart } from "@/lib/cart-context";

import AgeGate from "@/pages/AgeGate";
import Menu from "@/pages/Menu";
import Request from "@/pages/Request";
import Cart from "@/pages/Cart";
import Address from "@/pages/Address";
import Tip from "@/pages/Tip";
import Pay from "@/pages/Pay";
import Confirm from "@/pages/Confirm";
import Driver from "@/pages/Driver";
import Admin from "@/pages/Admin";
import { useEffect } from "react";

function Gate({ children }: { children: React.ReactNode }) {
  const { ageVerified } = useCart();
  const [loc, navigate] = useLocation();
  useEffect(() => {
    if (!ageVerified && loc !== "/") {
      navigate("/");
    }
  }, [ageVerified, loc, navigate]);
  if (!ageVerified) return null;
  return <>{children}</>;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={AgeGate} />
      <Route path="/menu">
        <Gate>
          <Menu />
        </Gate>
      </Route>
      <Route path="/request">
        <Gate>
          <Request />
        </Gate>
      </Route>
      <Route path="/cart">
        <Gate>
          <Cart />
        </Gate>
      </Route>
      <Route path="/address">
        <Gate>
          <Address />
        </Gate>
      </Route>
      <Route path="/tip">
        <Gate>
          <Tip />
        </Gate>
      </Route>
      <Route path="/pay">
        <Gate>
          <Pay />
        </Gate>
      </Route>
      <Route path="/confirm">
        <Gate>
          <Confirm />
        </Gate>
      </Route>
      <Route path="/driver" component={Driver} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router hook={useHashLocation}>
          <CartProvider>
            <Toaster />
            <AppRouter />
          </CartProvider>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
