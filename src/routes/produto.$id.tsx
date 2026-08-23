import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  Star,
  Flame,
  ShoppingBag,
  ShieldCheck,
  Truck,
  CreditCard,
  ArrowLeft,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Share2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatBRL, formatSold } from "@/lib/format";
import { getProduct } from "@/lib/products.functions";

export const Route = createFileRoute("/produto/$id")({
  head: ({ loaderData }) => {
    const p = loaderData?.product;
    const title = p ? `${p.title} — ShopPeça` : "Produto — ShopPeça";
    const desc =
      p?.description ||
      (p
        ? `Confira a oferta de ${p.title} na Shopee com o melhor preço e cupom.`
        : "Oferta Shopee");
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:image", content: p?.image_url || "" },
        { property: "og:type", content: "product" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  loader: async ({ params }) => {
    const data = await getProduct({ data: { id: params.id } });
    if (!data.product) {
      throw notFound();
    }
    return data;
  },
  component: ProductDetailPage,
});

function ProductDetailPage() {
  const { product, related } = Route.useLoaderData();

  if (!product) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-foreground">Produto não encontrado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            O produto que você procura não está mais disponível ou foi removido.
          </p>
          <div className="mt-6">
            <Link to="/">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para a loja
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const discount = product.discount_pct ?? null;
  const hasDiscount =
    discount != null && discount > 0 && product.original_price != null;
  const savings =
    hasDiscount && product.original_price && product.price
      ? product.original_price - product.price
      : null;

  function copyLink() {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Link do produto copiado para a área de transferência!");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        {/* Breadcrumb */}
        <nav className="mb-6 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors">
            Início
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          {product.category && (
            <>
              <span className="text-foreground/80 font-medium">
                {product.category}
              </span>
              <ChevronRight className="h-3.5 w-3.5" />
            </>
          )}
          <span className="truncate max-w-[200px] sm:max-w-md font-medium text-foreground">
            {product.title}
          </span>
        </nav>

        {/* Product Hero Details */}
        <div className="grid gap-8 md:grid-cols-2 lg:gap-12">
          {/* Left: Product Image & Trust Box */}
          <div className="space-y-4">
            <Card className="overflow-hidden border-border/80 p-0 shadow-sm relative group bg-card">
              <div className="relative aspect-square overflow-hidden bg-secondary">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    Sem imagem disponível
                  </div>
                )}
                {hasDiscount && (
                  <span className="absolute left-3 top-3 flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-md">
                    <Flame className="h-3.5 w-3.5" />-{discount}% OFF
                  </span>
                )}
                {product.featured && (
                  <span className="absolute right-3 top-3 rounded-lg bg-foreground/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-background shadow-md backdrop-blur">
                    ⭐ Top Destaque
                  </span>
                )}
              </div>
            </Card>

            {/* Trust highlights */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
                <ShieldCheck className="mx-auto h-5 w-5 text-emerald-500 mb-1" />
                <p className="text-[11px] font-semibold text-foreground">Garantia Shopee</p>
                <p className="text-[10px] text-muted-foreground">Compra 100% segura</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
                <Truck className="mx-auto h-5 w-5 text-primary mb-1" />
                <p className="text-[11px] font-semibold text-foreground">Envio Oficial</p>
                <p className="text-[10px] text-muted-foreground">Rastreio no app</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
                <CreditCard className="mx-auto h-5 w-5 text-amber-500 mb-1" />
                <p className="text-[11px] font-semibold text-foreground">Pix & Cartão</p>
                <p className="text-[10px] text-muted-foreground">Em até 12x</p>
              </div>
            </div>
          </div>

          {/* Right: Info, Price & Buy CTA */}
          <div className="flex flex-col space-y-5">
            {/* Header info */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {product.category && (
                  <Badge variant="secondary" className="text-xs font-semibold px-2.5 py-0.5">
                    {product.category}
                  </Badge>
                )}
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <Share2 className="h-3.5 w-3.5" /> Compartilhar
                </button>
              </div>

              <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl lg:text-3xl leading-snug">
                {product.title}
              </h1>

              {/* Rating & Sold count */}
              <div className="flex flex-wrap items-center gap-3 pt-1 text-sm text-muted-foreground">
                {product.rating != null && (
                  <div className="flex items-center gap-1 font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md">
                    <Star className="h-4 w-4 fill-amber-500" />
                    <span>{product.rating.toFixed(1)}</span>
                  </div>
                )}
                {product.sold_count != null && product.sold_count > 0 && (
                  <span className="font-medium text-foreground/80">
                    {formatSold(product.sold_count)} vendidos
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Em estoque na Shopee
                </span>
              </div>
            </div>

            {/* Price Box */}
            <Card className="border-primary/30 bg-primary/5 p-5">
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Preço promocional</span>
                <div className="flex flex-wrap items-baseline gap-3">
                  {product.price != null && (
                    <span className="text-3xl font-extrabold text-primary sm:text-4xl">
                      {formatBRL(product.price)}
                    </span>
                  )}
                  {hasDiscount && (
                    <span className="text-base text-muted-foreground line-through font-normal">
                      {formatBRL(product.original_price)}
                    </span>
                  )}
                </div>
                {savings != null && savings > 0 && (
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 pt-1">
                    🎉 Você economiza {formatBRL(savings)} ({discount}% OFF) nesta oferta!
                  </p>
                )}
              </div>

              {/* Primary Call to Action: Shopee Affiliate Link */}
              <div className="mt-5 space-y-2.5">
                <a
                  href={product.shopee_url}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="block w-full"
                >
                  <Button
                    size="lg"
                    className="w-full shopee-gradient py-6 text-base font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <ShoppingBag className="mr-2 h-5 w-5" />
                    Comprar na Shopee com Desconto
                    <ExternalLink className="ml-2 h-4 w-4 opacity-80" />
                  </Button>
                </a>
                <p className="text-center text-[11px] text-muted-foreground">
                  🔒 Você será redirecionado para a página oficial do produto na Shopee com o menor preço e cupons aplicados.
                </p>
              </div>
            </Card>

            {/* Description */}
            {product.description && (
              <div className="space-y-2 pt-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                  Descrição do Produto
                </h3>
                <div className="rounded-xl border border-border/60 bg-card p-4 text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
                  {product.description}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Related Products */}
        {related.length > 0 && (
          <section className="mt-16 border-t border-border/60 pt-10">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  Quem viu este produto também comprou
                </h2>
                <p className="text-xs text-muted-foreground">
                  Outras ofertas incríveis selecionadas na mesma categoria
                </p>
              </div>
              <Link to="/" className="text-xs font-semibold text-primary hover:underline">
                Ver todas as ofertas →
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {related.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
