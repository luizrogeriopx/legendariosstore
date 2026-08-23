import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

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

type AuthedClient = SupabaseClient<Database>;

/**
 * Publishable (anon) client for public reads. RLS allows anon SELECT on
 * products. Created per-call inside server handlers.
 */
function getPublishableClient() {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(url, key, {
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

export async function createProduct(
  input: ProductInput,
  userId: string,
  supabase: AuthedClient,
) {
  const { data, error } = await supabase
    .from("products")
    .insert({ ...input, created_by: userId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Product;
}

export async function updateProduct(
  id: string,
  input: Partial<ProductInput>,
  supabase: AuthedClient,
) {
  const { data, error } = await supabase
    .from("products")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Product;
}

export async function deleteProduct(id: string, supabase: AuthedClient) {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function saveShopeeSettings(
  appId: string,
  secret: string,
  supabase: AuthedClient,
) {
  const { error } = await supabase.from("affiliate_settings").upsert(
    {
      id: "default",
      shopee_app_id: appId,
      shopee_secret: secret,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(error.message);
  return { ok: true };
}

export type ShopeeMeta = {
  title: string | null;
  image: string | null;
  description: string | null;
  price: number | null;
  affiliateUrl: string | null;
  isOfficialLink: boolean;
  apiError?: string | null;
};

const PRICE_RE = /R\$\s?(\d{1,3}(?:\.\d{3})*|\d+)(?:[.,](\d{1,2}))?/i;

function pickMeta(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`,
    "i",
  );
  return (
    (html.match(re)?.[1] ?? html.match(re2)?.[1] ?? null)?.replace(
      /&/g,
      "&",
    ) ?? null
  );
}

import {
  getShopeeCredentials,
  generateShopeeAffiliateLink,
} from "./shopee-api.server";

/**
 * Best-effort Shopee product metadata scraper & affiliate link generator.
 * Fetches the product page HTML and extracts Open Graph tags + price.
 * When Shopee API credentials (AppID + Secret) are available, automatically generates
 * the user's official affiliate shortlink.
 */
export async function fetchShopeeMeta(
  url: string,
  supabase?: AuthedClient,
): Promise<ShopeeMeta> {
  let affiliateUrl: string | null = url;
  let isOfficialLink = false;
  let apiError: string | null = null;

  if (supabase) {
    const creds = await getShopeeCredentials(supabase);
    if (creds.appId && creds.secret) {
      const linkResult = await generateShopeeAffiliateLink({
        url,
        appId: creds.appId,
        secret: creds.secret,
      });
      if (linkResult.shortLink) {
        affiliateUrl = linkResult.shortLink;
        isOfficialLink = true;
      } else if (linkResult.error) {
        apiError = linkResult.error;
      }
    }
  }

  try {
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
      return {
        title: null,
        image: null,
        description: null,
        price: null,
        affiliateUrl,
        isOfficialLink,
        apiError,
      };
    }
    const html = await res.text();

    const title =
      pickMeta(html, "og:title") ?? pickMeta(html, "twitter:title") ?? null;
    const image =
      pickMeta(html, "og:image") ?? pickMeta(html, "twitter:image") ?? null;
    const description = pickMeta(html, "og:description") ?? null;

    let price: number | null = null;
    const metaPrice = pickMeta(html, "product:price:amount");
    if (metaPrice) {
      const n = parseFloat(
        metaPrice.replace(/[^\d.,]/g, "").replace(".", "").replace(",", "."),
      );
      if (!Number.isNaN(n)) price = n;
    }
    if (price == null) {
      const hay = `${title ?? ""} ${description ?? ""}`;
      const m = hay.match(PRICE_RE);
      if (m && m[1]) {
        const intPart = m[1].replace(/\./g, "");
        const frac = m[2] ?? "0";
        price = parseFloat(`${intPart}.${frac}`);
      }
    }

    return {
      title,
      image,
      description,
      price,
      affiliateUrl,
      isOfficialLink,
      apiError,
    };
  } catch {
    return {
      title: null,
      image: null,
      description: null,
      price: null,
      affiliateUrl,
      isOfficialLink,
      apiError,
    };
  }
}
