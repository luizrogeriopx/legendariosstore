import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Sparkles, Search, TrendingUp, Zap } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { getProducts } from "@/lib/products.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Legendários Store — Ofertas Shopee Selecionadas" },
      {
        name: "description",
        content:
          "A melhor seleção de ofertas da Shopee em um só lugar na Legendários Store. Eletrônicos, acessórios e mais com até 55% de desconto.",
      },
      { property: "og:title", content: "Legendários Store — Ofertas Shopee Selecionadas" },
      {
        property: "og:description",
        content:
          "A melhor seleção de ofertas da Shopee em um só lugar. Até 55% de desconto.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async () => {
    const data = await getProducts();
    return data;
  },
  component: Index,
});

function Index() {
  const { products, featured, categories } = Route.useLoaderData();
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchCat = !category || p.category === category;
      const matchQuery =
        !query ||
        p.title.toLowerCase().includes(query.toLowerCase()) ||
        (p.description ?? "").toLowerCase().includes(query.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [products, category, query]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 hero-glow" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <div className="grid items-center gap-8 md:grid-cols-2">
            <div className="space-y-5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Ofertas atualizadas toda semana
              </span>
              <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
                As melhores ofertas da{" "}
                <span className="shopee-gradient bg-clip-text text-transparent">
                  Shopee
                </span>{" "}
                em um clique
              </h1>
              <p className="max-w-md text-base text-muted-foreground">
                Selecionamos produtos com até 55% de desconto. Você escolhe, e a
                compra acontece direto na Shopee com toda a segurança.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  asChild
                  size="lg"
                  className="shopee-gradient text-primary-foreground"
                >
                  <a href="#produtos">Ver ofertas</a>
                </Button>
              </div>
              <div className="flex gap-6 pt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-primary" /> Entrega rápida
                </span>
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-primary" /> Compra segura
                </span>
              </div>
            </div>

            {/* Featured strip */}
            <div className="relative">
              <div className="grid grid-cols-2 gap-3">
                {featured.slice(0, 4).map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
              <div className="pointer-events-none absolute -bottom-3 -right-3 -z-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
            </div>
          </div>
        </div>
      </section>

      {/* Search + categories */}
      <section
        id="produtos"
        className="mx-auto max-w-6xl scroll-mt-20 px-4 py-10"
      >
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
            Todos os produtos
          </h2>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar produtos..."
              className="w-full rounded-full border border-input bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none ring-ring transition focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setCategory(null)}
            className={
              "rounded-full px-4 py-1.5 text-sm font-medium transition " +
              (category == null
                ? "shopee-gradient text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/70")
            }
          >
            Todos
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={
                "rounded-full px-4 py-1.5 text-sm font-medium transition " +
                (category === c
                  ? "shopee-gradient text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/70")
              }
            >
              {c}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">
            Nenhum produto encontrado.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-border/60 bg-secondary/40">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row">
          <p>
            <span className="font-bold text-foreground">Legendários Store</span> —
            vitrine de afiliados Shopee.
          </p>
          <p>
            Os preços e descontos são apenas informativos. Compras na Shopee.
          </p>
        </div>
      </footer>
    </div>
  );
}
