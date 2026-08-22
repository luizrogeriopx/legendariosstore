import { createClient } from "@supabase/supabase-js";

export type Product = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  price: number | null;
  original_price: number | null;
  discount_pct: number | null;
  shopee_url: string;
  category: string | null;
  rating: number | null;
  sold_count: number | null;
  featured: boolean;
  sort_order: number;
  created_at: string;
};

export type ProductInput = {
  title: string;
  description?: string | null;
  image_url?: string | null;
  price?: number | null;
  original_price?: number | null;
  discount_pct?: number | null;
  shopee_url: string;
  category?: string | null;
  rating?: number | null;
  sold_count?: number | null;
  featured?: boolean;
  sort_order?: number;
};

/**
 * Publishable (anon) client for public reads. RLS allows anon SELECT on
 * products. Created per-call inside server handlers.
 */
function getPublishableClient() {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function listProducts(): Promise<Product[]> {
  const supabase = getPublishableClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Product[];
}

export async function listFeatured(): Promise<Product[]> {
  const supabase = getPublishableClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("featured", true)
    .order("sort_order", { ascending: true })
    .limit(6);
  if (error) throw new Error(error.message);
  return (data ?? []) as Product[];
}

export async function getCategories(): Promise<string[]> {
  const supabase = getPublishableClient();
  const { data, error } = await supabase
    .from("products")
    .select("category");
  if (error) throw new Error(error.message);
  const set = new Set<string>();
  for (const row of data ?? []) {
    if (row.category) set.add(row.category as string);
  }
  return [...set];
}

export async function createProduct(input: ProductInput, userId: string) {
  const supabase = getPublishableClient();
  const { data, error } = await supabase
    .from("products")
    .insert({ ...input, created_by: userId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Product;
}

export async function updateProduct(id: string, input: Partial<ProductInput>) {
  const supabase = getPublishableClient();
  const { data, error } = await supabase
    .from("products")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Product;
}

export async function deleteProduct(id: string) {
  const supabase = getPublishableClient();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export type ShopeeMeta = {
  title: string | null;
  image: string | null;
  description: string | null;
  price: number | null;
};

const PRICE_RE = /R\$\s?(\d{1,3}(?:\.\d{3})*|\d+)(?:[.,](\d{1,2}))?/i;

function pickMeta(html: string, prop: string): string | null {
  // matches <meta property="og:title" content="...">
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`,
    "i",
  );
  return (html.match(re)?.[1] ?? html.match(re2)?.[1] ?? null)?.replace(
    /&/g,
    "&",
  ) ?? null;
}

/**
 * Best-effort Shopee product metadata scraper. Fetches the product page HTML
 * and extracts Open Graph tags + a price. Shopee may rate-limit or block
 * server fetches; on any failure we return whatever we found and let the
 * admin fill in the rest manually.
 */
export async function fetchShopeeMeta(url: string): Promise<ShopeeMeta> {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    return { title: null, image: null, description: null, price: null };
  }
  const html = await res.text();

  const title =
    pickMeta(html, "og:title") ?? pickMeta(html, "twitter:title") ?? null;
  const image =
    pickMeta(html, "og:image") ?? pickMeta(html, "twitter:image") ?? null;
  const description = pickMeta(html, "og:description") ?? null;

  // price: try product:price:amount meta, then scan title/description for R$
  let price: number | null = null;
  const metaPrice = pickMeta(html, "product:price:amount");
  if (metaPrice) {
    const n = parseFloat(metaPrice.replace(/[^\d.,]/g, "").replace(".", "").replace(",", "."));
    if (!Number.isNaN(n)) price = n;
  }
  if (price == null) {
    const hay = `${title ?? ""} ${description ?? ""}`;
    const m = hay.match(PRICE_RE);
    if (m) {
      const intPart = m[1].replace(/\./g, "");
      const frac = m[2] ?? "0";
      price = parseFloat(`${intPart}.${frac}`);
    }
  }

  return { title, image, description, price };
}
