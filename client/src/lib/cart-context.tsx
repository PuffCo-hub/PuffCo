import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { applyMarkup, setMarkupPercent, type Product } from "./catalog";
import { apiRequest } from "./queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export type CartLine = {
  product: Product;
  qty: number;
};

export type Address = {
  firstName: string;
  lastInitial: string;
  phone: string;
  street: string;
  unit?: string;
  city: string;
  state: string;
  zip: string;
  notes?: string;
};

type Ctx = {
  ageVerified: boolean;
  setAgeVerified: (b: boolean) => void;

  lines: CartLine[];
  addItem: (p: Product, qty?: number) => void;
  removeItem: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  replaceItem: (oldId: string, replacement: Product) => void;
  clearCart: () => void;

  address: Address | null;
  setAddress: (a: Address) => void;

  tipCents: number;
  setTipCents: (c: number) => void;

  // Pricing helpers (estimated, includes 18% markup)
  subtotalCents: number;
  totalCents: number;

  // Order placement (prototype-only, in-memory)
  lastOrderId: number | null;
  setLastOrderId: (n: number) => void;

  // Selected local shop for the current browsing session. null means "browse
  // everything." Cart is restricted to a single shop; switching shops while
  // the cart has items prompts the customer to clear it first.
  selectedShopId: string | null;
  setSelectedShopId: (id: string | null) => void;
  cartShopId: string | null;
};

const CartContext = createContext<Ctx | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [ageVerified, setAgeVerified] = useState(false);
  // Pull live markup from the server so admins can change it without a redeploy.
  useEffect(() => {
    let active = true;
    apiRequest("GET", "/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        const pct = data?.pricing?.markupPercent;
        if (typeof pct === "number") setMarkupPercent(pct);
      })
      .catch(() => {
        /* fall back to default */
      });
    return () => {
      active = false;
    };
  }, []);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [address, setAddress] = useState<Address | null>(null);
  const [tipCents, setTipCents] = useState(0);
  const [lastOrderId, setLastOrderId] = useState<number | null>(null);
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);

  // Cart is single-shop. Derive the cart's shop from the first line so the UI
  // can warn before the customer adds something from a second shop.
  const cartShopId = lines.length > 0 ? ((lines[0].product as any).shopId || null) : null;

  const subtotalCents = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + applyMarkup(l.product.basePriceCents) * l.qty,
        0
      ),
    [lines]
  );
  const totalCents = subtotalCents + tipCents;

  const { toast, dismiss } = useToast();
  const [, navigate] = useLocation();
  const lastToastIdRef = useRef<string | null>(null);

  const addItem = useCallback(
    (p: Product, qty = 1) => {
      // Prevent mixed-shop carts. If the customer tries to add from a
      // different shop, surface a clear toast and keep the existing cart.
      const newShopId = (p as any).shopId || null;
      if (lines.length > 0 && cartShopId && newShopId && newShopId !== cartShopId) {
        toast({
          title: "Different shop",
          description:
            "Your cart already has items from another shop. Finish or clear that order before adding from a new shop.",
          duration: 3500,
        });
        return;
      }
      let nextQty = qty;
      setLines((prev) => {
        const idx = prev.findIndex((l) => l.product.id === p.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], qty: next[idx].qty + qty };
          nextQty = next[idx].qty;
          return next;
        }
        return [...prev, { product: p, qty }];
      });
      // Feedback toast — replaces any previous "Added" toast so spamming
      // doesn't stack a tower of notifications. Clear, non-technical wording.
      if (lastToastIdRef.current) dismiss(lastToastIdRef.current);
      // We intentionally use a plain <a href="#/cart"> instead of Radix's
      // ToastAction. Radix Action automatically dismisses the toast on click,
      // and on mobile that unmount can race the JS navigation handler so the
      // user ends up still on the menu. A native anchor with an in-page hash
      // target hands the navigation to the browser itself — it can't be
      // swallowed by React unmounting, pointer-up races, or wouter state
      // timing. wouter's useHashLocation hook listens to `hashchange`, so the
      // route updates as soon as the browser commits the hash.
      const t = toast({
        title: "Added to cart",
        description: `${p.orderName} — qty ${nextQty}`,
        duration: 2400,
        action: (
          <a
            href="#/cart"
            data-testid="toast-action-view-cart"
            aria-label="View cart"
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            onClick={(e) => {
              // Previous fix used Radix's <ToastAction>. Radix Action runs
              // its own onClick after ours and dismisses the toast — that
              // unmount restores focus to the originating "Add" button on
              // mobile Safari/Chrome webviews, which can cancel or visually
              // mask the hash navigation we just initiated. Replacing the
              // action with a plain anchor removes Radix's auto-dismiss/
              // focus-restore from the critical path.
              //
              // We let the anchor do the work but ALSO call hash + navigate
              // here as a belt-and-suspenders. preventDefault() is used so
              // we control the navigation deterministically when the JS
              // handler runs; if a webview swallows the JS handler the
              // anchor's default still fires. setTimeout queues the toast
              // dismiss for after the navigation lands.
              e.preventDefault();
              const target = "#/cart";
              if (window.location.hash !== target) {
                // assign() pushes a real history entry so the back button
                // returns to the menu, which is what users expect.
                window.location.assign(target);
              }
              navigate("/cart");
              const id = lastToastIdRef.current;
              if (id) setTimeout(() => dismiss(id), 0);
            }}
          >
            View cart
          </a>
        ),
      });
      lastToastIdRef.current = t.id;
    },
    [toast, dismiss, navigate, lines.length, cartShopId]
  );
  const removeItem = (id: string) =>
    setLines((prev) => prev.filter((l) => l.product.id !== id));
  const setQty = (id: string, qty: number) =>
    setLines((prev) =>
      prev
        .map((l) => (l.product.id === id ? { ...l, qty } : l))
        .filter((l) => l.qty > 0)
    );
  const replaceItem = (oldId: string, replacement: Product) => {
    setLines((prev) => {
      const original = prev.find((l) => l.product.id === oldId);
      if (!original) return prev;
      const stripped = prev.filter((l) => l.product.id !== oldId);
      const existing = stripped.find((l) => l.product.id === replacement.id);
      if (existing) {
        return stripped.map((l) =>
          l.product.id === replacement.id
            ? { ...l, qty: l.qty + original.qty }
            : l,
        );
      }
      return [...stripped, { product: replacement, qty: original.qty }];
    });
  };
  const clearCart = () => {
    setLines([]);
    setAddress(null);
    setTipCents(0);
  };

  return (
    <CartContext.Provider
      value={{
        ageVerified,
        setAgeVerified,
        lines,
        addItem,
        removeItem,
        setQty,
        replaceItem,
        clearCart,
        address,
        setAddress,
        tipCents,
        setTipCents,
        subtotalCents,
        totalCents,
        lastOrderId,
        setLastOrderId,
        selectedShopId,
        setSelectedShopId,
        cartShopId,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
