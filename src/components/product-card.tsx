import { Star, Flame } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatSold } from "@/lib/format";
import type { Product } from "@/lib/products.server";

export function ProductCard({ product }: { product: Product }) {
  const discount = product.discount_pct ?? null;
  const hasDiscount =
    discount != null && discount > 0 && product.original_price != null;

  return (
    <a
      href={product.shopee_url}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className="group block"
    >
      <Card className="h-full overflow-hidden border-border/70 p-0 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10 hover:border-primary/40">
        <div className="relative aspect-square overflow-hidden bg-secondary">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-secondary text-muted-foreground">
              <span className="text-3xl font-bold text-muted-foreground/40">
                {product.title.charAt(0)}
              </span>
            </div>
          )}
          {hasDiscount && (
            <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground shadow">
              <Flame className="h-3 w-3" />-{discount}%
            </span>
          )}
          {product.featured && (
            <span className="absolute right-2 top-2 rounded-md bg-foreground/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-background backdrop-blur">
              Top
            </span>
          )}
        </div>

        <div className="space-y-1.5 p-3">
          <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-foreground">
            {product.title}
          </h3>

          {product.category && (
            <Badge variant="secondary" className="font-normal">
              {product.category}
            </Badge>
          )}

          <div className="flex items-baseline gap-2 pt-1">
            {product.price != null && (
              <span className="text-lg font-extrabold text-primary">
                {formatBRL(product.price)}
              </span>
            )}
            {hasDiscount && (
              <span className="text-xs text-muted-foreground line-through">
                {formatBRL(product.original_price)}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between pt-0.5 text-xs text-muted-foreground">
            {product.rating != null ? (
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {product.rating.toFixed(1)}
              </span>
            ) : (
              <span />
            )}
            {formatSold(product.sold_count) && <span>{formatSold(product.sold_count)}</span>}
          </div>
        </div>
      </Card>
    </a>
  );
}
