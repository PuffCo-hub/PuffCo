import { useMemo, useState } from "react";
import { Shell, Disclaimer } from "@/components/Shell";
import {
  CATEGORY_OPTIONS,
  applyMarkup,
  categoryMatches,
  formatPrice,
  type CategoryId,
  type Product,
  type Shop,
} from "@/lib/catalog";
import { useCart } from "@/lib/cart-context";
import { Search, Plus, Sparkles, ChevronRight, X, MapPin, SlidersHorizontal, Clock, Star, Store, Disc3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ProductImage } from "@/components/ProductImage";
import { ProductDetailModal } from "@/components/ProductDetailModal";
import { InstallBanner } from "@/components/InstallBanner";
import { useQuery } from "@tanstack/react-query";

function ProductCard({ p, onOpen }: { p: Product; onOpen: (p: Product) => void }) {
  const { addItem } = useCart();
  const [busy, setBusy] = useState(false);
  const est = applyMarkup(p.basePriceCents);
  const unavailable = !p.available;

  function handleAdd(e: React.MouseEvent) {
    e.stopPropagation();
    if (unavailable || busy) return;
    setBusy(true);
    addItem(p);
    // Brief debounce so accidental double-taps don't add two of the same item.
    window.setTimeout(() => setBusy(false), 600);
  }

  return (
    <div
      className={`bg-card rounded-2xl p-3 flex gap-3 items-center w-full min-w-0 border border-card-border text-left ${
        unavailable ? "opacity-60" : "hover-elevate cursor-pointer"
      }`}
      data-testid={`card-product-${p.id}`}
      data-available={String(!unavailable)}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(p)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(p);
        }
      }}
    >
      <ProductImage product={p} />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
          {p.brand} · {p.subcategory}
        </div>
        <div className="font-semibold text-sm leading-tight line-clamp-2" data-testid={`text-name-${p.id}`}>
          {p.orderName}
        </div>
        <div className="text-[11px] text-muted-foreground leading-snug mt-1 line-clamp-2">
          {p.detail}
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-foreground tabular-nums" data-testid={`text-price-${p.id}`}>
            {formatPrice(est)}
          </span>
          <span className="opacity-60">est.</span>
          {unavailable ? (
            <span
              className="px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive text-[10px] font-semibold"
              data-testid={`badge-oos-${p.id}`}
            >
              Out of stock
            </span>
          ) : p.lowStock ? (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 text-[10px] font-semibold">
              Low stock
            </span>
          ) : null}
        </div>
      </div>
      <Button
        size="sm"
        className="ember-button h-9 w-9 p-0 shrink-0"
        onClick={handleAdd}
        disabled={unavailable || busy}
        data-testid={`button-add-${p.id}`}
        aria-label={unavailable ? `${p.name} is out of stock` : `Add ${p.name}`}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}

function CategoryTile({
  category,
  active,
  onClick,
  products,
  children,
}: {
  category: (typeof CATEGORY_OPTIONS)[number];
  active: boolean;
  onClick: () => void;
  products: Product[];
  children?: React.ReactNode;
}) {
  const preview = products.find((p) => categoryMatches(category, p.category));
  return (
    <div className={`bg-card rounded-2xl overflow-hidden border transition ${active ? "border-primary/80" : "border-card-border"}`}>
      <button
        onClick={onClick}
        className="w-full p-3 text-left hover-elevate transition"
        data-testid={`button-category-${category.id}`}
      >
        <div className="flex items-center gap-3">
          {preview ? (
            <ProductImage product={preview} compact />
          ) : category.fallbackIcon === "grinder" ? (
            <div className="size-12 shrink-0 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center">
              <Disc3 className="size-6" />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm">{category.label}</div>
            <div className="text-[11px] leading-snug text-muted-foreground mt-0.5">{category.helper}</div>
          </div>
          <ChevronRight className={`size-4 text-muted-foreground transition ${active ? "rotate-90 text-primary" : ""}`} />
        </div>
      </button>
      {active ? children : null}
    </div>
  );
}

export default function Menu() {
  const { addItem, selectedShopId, setSelectedShopId } = useCart();
  const [q, setQ] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryId | null>(null);
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [trendingBusy, setTrendingBusy] = useState<string | null>(null);

  const { data: shops = [] } = useQuery<Shop[]>({
    queryKey: ["/api/shops"],
    staleTime: 60_000,
  });

  const productsKey = selectedShopId
    ? ["/api/products?shopId=" + encodeURIComponent(selectedShopId)]
    : ["/api/products"];
  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: productsKey,
    // Re-fetch every 8s so stock changes show up without page refresh.
    refetchInterval: 8000,
  });

  const activeShop = useMemo(
    () => shops.find((s) => s.id === selectedShopId) || null,
    [shops, selectedShopId],
  );

  // Show popular items but only those still available; operators can still see
  // out-of-stock items in the admin list. Customer-side, the catalog hides
  // unavailable items from the trending row entirely so they don't get
  // teased with something they can't add.
  const popular = products.filter((p) => p.popular && p.available).slice(0, 10);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const activeOption = activeCategory
      ? CATEGORY_OPTIONS.find((c) => c.id === activeCategory)
      : undefined;
    return products.filter((p) => {
      const matchesCategory = !activeOption || categoryMatches(activeOption, p.category);
      const matchesSubcategory = !activeSubcategory || p.subcategory === activeSubcategory || p.brand === activeSubcategory;
      const matchesSearch =
        !term ||
        p.name.toLowerCase().includes(term) ||
        p.orderName.toLowerCase().includes(term) ||
        p.detail.toLowerCase().includes(term) ||
        p.brand.toLowerCase().includes(term) ||
        p.subcategory.toLowerCase().includes(term) ||
        CATEGORY_OPTIONS.find((c) => categoryMatches(c, p.category))?.label.toLowerCase().includes(term);
      return matchesCategory && matchesSubcategory && matchesSearch;
    });
  }, [q, activeCategory, activeSubcategory, products]);

  function chooseCategory(id: CategoryId) {
    setActiveCategory((current) => (current === id ? null : id));
    setActiveSubcategory(null);
  }

  function productsForCategory(id: CategoryId) {
    const option = CATEGORY_OPTIONS.find((c) => c.id === id);
    if (!option) return [];
    return filtered.filter((p) => categoryMatches(option, p.category));
  }

  return (
    <Shell>
      {/* Premium hero — smoky backdrop, delivery context, and a quick category */}
      {/* chip rail for instant filtering before the search/trending sections.   */}
      <div className="relative -mx-4 px-4 pt-1 pb-4 mb-4 overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(110%_70%_at_50%_-20%,hsl(24_90%_56%/0.18),transparent_55%),radial-gradient(110%_70%_at_50%_120%,hsl(270_50%_50%/0.14),transparent_60%)]"
        />
        <div className="rounded-3xl border border-card-border bg-card/80 backdrop-blur-md p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Serving
              </p>
              <div className="mt-1 flex items-center gap-1.5 font-semibold text-base">
                <MapPin className="size-4 text-primary" />
                <span className="truncate">Pasco County</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <Clock className="size-3.5" />
                <span>Outside Pasco requires a serious tip · ID required</span>
              </div>
            </div>
            <div className="rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary border border-primary/20">
              21+
            </div>
          </div>
        </div>

        <h2 className="mt-5 text-2xl font-bold tracking-tight leading-tight">
          Local smoke shop delivery, <span className="text-primary">made simple.</span>
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Browse trending vapes, carts, glass, papers, and wraps.
        </p>
        <div className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[12px] leading-snug text-amber-100/90">
          <span className="font-semibold text-amber-200">Pasco County only for now.</span>{" "}
          If you are outside Pasco, the order may be declined unless the tip covers the longer drive.
        </div>

        {/* Quick category chip rail */}
        <div className="mt-3 flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
          <button
            onClick={() => {
              setActiveCategory(null);
              setActiveSubcategory(null);
            }}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
              !activeCategory
                ? "bg-primary text-primary-foreground border-primary"
                : "border-card-border bg-card/80 text-foreground hover-elevate"
            }`}
            data-testid="chip-category-all"
          >
            All
          </button>
          {CATEGORY_OPTIONS.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setActiveCategory((cur) => (cur === c.id ? null : c.id));
                setActiveSubcategory(null);
              }}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
                activeCategory === c.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-card-border bg-card/80 text-foreground hover-elevate"
              }`}
              data-testid={`chip-quick-${c.id}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <InstallBanner />

      {/* Active shop indicator — clear "shopping at" pill with a way to back out. */}
      {activeShop ? (
        <div
          className="mb-4 rounded-2xl border border-primary/40 bg-primary/10 p-3 flex items-center gap-3"
          data-testid="banner-active-shop"
        >
          <div className="size-9 rounded-xl bg-primary/20 flex items-center justify-center text-primary shrink-0">
            <Store className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-primary/80 font-semibold">
              Shopping at
            </div>
            <div className="font-semibold text-sm truncate">{activeShop.name}</div>
            {activeShop.serviceArea ? (
              <div className="text-[11px] text-muted-foreground truncate">
                {activeShop.serviceArea}
              </div>
            ) : null}
          </div>
          <button
            onClick={() => {
              setSelectedShopId(null);
              setActiveCategory(null);
              setActiveSubcategory(null);
            }}
            className="text-xs font-semibold text-primary hover-elevate rounded-full px-3 py-1.5 border border-primary/30"
            data-testid="button-clear-shop"
          >
            Change shop
          </button>
        </div>
      ) : null}

      {/* "Shop by local shop" — second primary path, shown when no shop is selected. */}
      {!activeShop && shops.length > 0 ? (
        <section className="mb-6" data-testid="section-shops">
          <div className="flex items-end justify-between gap-3 mb-2">
            <div>
              <div className="flex items-center gap-2">
                <Store className="size-4 text-primary" />
                <h2 className="text-lg font-semibold tracking-tight">Shop by local shop</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pick a local shop to browse only its inventory.
              </p>
            </div>
          </div>
          <div className="grid gap-2">
            {shops.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedShopId(s.id);
                  setActiveCategory(null);
                  setActiveSubcategory(null);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="bg-card rounded-2xl p-3 flex gap-3 items-center w-full border border-card-border hover-elevate text-left"
                data-testid={`card-shop-${s.id}`}
              >
                <div
                  className="size-12 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: `${s.accent || "#ff7a1a"}22`, color: s.accent || "#ff7a1a" }}
                >
                  <Store className="size-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm leading-tight">{s.name}</div>
                  {s.blurb ? (
                    <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                      {s.blurb}
                    </div>
                  ) : null}
                  <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                    {s.serviceArea ? (
                      <span className="flex items-center gap-1"><MapPin className="size-3" />{s.serviceArea}</span>
                    ) : null}
                    {s.open ? (
                      <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold">
                        Open
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">
                        Closed
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="sticky top-[61px] z-20 -mx-4 px-4 pb-3 pt-1 bg-background/92 backdrop-blur-md border-b border-border/50 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search vapes, carts, glass, papers, wraps…"
            className="pl-9 pr-10 h-12 bg-card border-card-border rounded-full"
            data-testid="input-search"
          />
          {q ? (
            <button
              className="absolute right-12 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={() => setQ("")}
              data-testid="button-clear-search"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          ) : null}
          <button
            className="absolute right-1.5 top-1/2 -translate-y-1/2 size-9 rounded-full bg-secondary flex items-center justify-center hover-elevate"
            data-testid="button-filter"
            aria-label="Filter"
          >
            <SlidersHorizontal className="size-4" />
          </button>
        </div>
      </div>

      <section className="mb-6">
        <div className="flex items-end justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h2 className="text-lg font-semibold tracking-tight">Trending near you</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Popular requests written like you would order in-store.
            </p>
          </div>
          <span className="text-xs text-primary font-semibold">See all</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4">
          {isLoading ? (
            <>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-card rounded-3xl p-3 w-[178px] shrink-0 border border-card-border animate-pulse"
                  data-testid={`skeleton-trending-${i}`}
                >
                  <div className="aspect-square rounded-2xl bg-muted/40" />
                  <div className="mt-3 h-3 rounded bg-muted/40 w-1/3" />
                  <div className="mt-2 h-4 rounded bg-muted/40 w-5/6" />
                  <div className="mt-2 h-3 rounded bg-muted/40 w-2/3" />
                </div>
              ))}
            </>
          ) : popular.length === 0 ? (
            <div className="bg-card rounded-3xl p-5 w-full border border-card-border text-sm text-muted-foreground">
              No trending products yet. Add products from Admin and mark them trending.
            </div>
          ) : popular.map((p) => (
            <div
              key={p.id}
              className="bg-card rounded-3xl p-3 w-[178px] shrink-0 border border-card-border shadow-sm hover-elevate cursor-pointer text-left"
              data-testid={`card-trending-${p.id}`}
              role="button"
              tabIndex={0}
              onClick={() => setDetailProduct(p)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setDetailProduct(p);
                }
              }}
            >
              <div className="relative">
                <ProductImage product={p} />
                <div className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1">
                  <Star className="size-3 text-primary fill-primary" />
                  Hot
                </div>
              </div>
              <div className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">{p.brand}</div>
              <div className="font-semibold text-sm leading-tight line-clamp-2 min-h-[2.3rem]">{p.orderName}</div>
              <div className="mt-1 text-[11px] text-muted-foreground line-clamp-1">{p.detail}</div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold tabular-nums">{formatPrice(applyMarkup(p.basePriceCents))}</span>
                <Button
                  size="sm"
                  className="ember-button h-8 px-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!p.available || trendingBusy === p.id) return;
                    setTrendingBusy(p.id);
                    addItem(p);
                    window.setTimeout(
                      () => setTrendingBusy((cur) => (cur === p.id ? null : cur)),
                      600
                    );
                  }}
                  disabled={!p.available || trendingBusy === p.id}
                  data-testid={`button-trending-add-${p.id}`}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-5">
        <h3 className="text-base font-semibold mb-2">
          {activeShop ? `Browse ${activeShop.name} by item type` : "Browse by item type"}
        </h3>
        <div className="grid gap-2">
          {CATEGORY_OPTIONS.map((c) => (
            <CategoryTile key={c.id} category={c} active={activeCategory === c.id} onClick={() => chooseCategory(c.id)} products={products}>
              <div className="border-t border-border/60 px-3 pb-3 pt-2">
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-3 px-3">
                  <button
                    onClick={() => setActiveSubcategory(null)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                      activeSubcategory === null ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card text-foreground hover-elevate"
                    }`}
                    data-testid="chip-subcategory-all"
                  >
                    All {c.label}
                  </button>
                  {c.subcategories.map((name) => (
                    <button
                      key={name}
                      onClick={() => setActiveSubcategory((current) => (current === name ? null : name))}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                        activeSubcategory === name ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card text-foreground hover-elevate"
                      }`}
                      data-testid={`chip-subcategory-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    >
                      {name}
                    </button>
                  ))}
                </div>

                <div className="grid gap-2 pt-1">
                  {productsForCategory(c.id).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
                      Nothing listed yet — send a write-in request.
                    </div>
                  ) : (
                    productsForCategory(c.id).map((p) => (
                      <ProductCard key={p.id} p={p} onOpen={setDetailProduct} />
                    ))
                  )}
                </div>
              </div>
            </CategoryTile>
          ))}
        </div>
      </section>

      {q && !activeCategory && (
        <section className="mb-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Search results
          </h3>
          {filtered.length === 0 ? (
            <div className="glass-card rounded-xl p-6 text-center text-sm text-muted-foreground">
              Nothing matches that yet — try a write-in below.
            </div>
          ) : (
            <div className="grid gap-2">
              {filtered.map((p) => (
                <ProductCard key={p.id} p={p} onOpen={setDetailProduct} />
              ))}
            </div>
          )}
        </section>
      )}

      <section className="mb-6">
        <div className="glass-card rounded-2xl p-4">
          <h3 className="font-semibold mb-1">Don't see it? Request it.</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Write in a regular purchase so PuffGo can learn what should be stocked next.
          </p>
          <Link href="/request">
            <Button variant="outline" className="w-full" data-testid="button-open-request">
              Submit a write-in
            </Button>
          </Link>
        </div>
      </section>

      <Disclaimer />

      <ProductDetailModal
        product={detailProduct}
        open={detailProduct !== null}
        onOpenChange={(o) => {
          if (!o) setDetailProduct(null);
        }}
      />
    </Shell>
  );
}
