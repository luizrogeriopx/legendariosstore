import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  listProducts,
  listFeatured,
  getCategories,
  createProduct,
  updateProduct,
  deleteProduct,
  fetchShopeeMeta,
  saveShopeeSettings,
  type Product,
  type ProductInput,
  type ShopeeMeta,
} from "./products.server";
import { getShopeeCredentials } from "./shopee-api.server";

export const productSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000).nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  price: z.number().nonnegative().nullable().optional(),
  original_price: z.number().nonnegative().nullable().optional(),
  discount_pct: z.number().int().min(0).max(100).nullable().optional(),
  shopee_url: z.string().url(),
  category: z.string().max(80).nullable().optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  sold_count: z.number().int().nonnegative().nullable().optional(),
  featured: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

// ---- Public reads (no auth) ----
export const getProducts = createServerFn({ method: "GET" }).handler(
  async () => {
    const [products, featured, categories] = await Promise.all([
      listProducts(),
      listFeatured(),
      getCategories(),
    ]);
    return { products, featured, categories } as {
      products: Product[];
      featured: Product[];
      categories: string[];
    };
  },
);

// ---- Scrape Shopee link + generate official affiliate short link (admin only) ----
export const scrapeShopee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ url: z.string().url() }).parse(data))
  .handler(async ({ data, context }): Promise<ShopeeMeta> => {
    return fetchShopeeMeta(data.url, context.supabase);
  });

// ---- Shopee API Settings (admin only) ----
export const getShopeeSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const creds = await getShopeeCredentials(context.supabase);
    return {
      appId: creds.appId || "",
      hasSecret: Boolean(creds.secret),
      maskedSecret: creds.secret
        ? creds.secret.slice(0, 4) + "••••••••" + creds.secret.slice(-4)
        : "",
    };
  });

export const saveShopeeSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        appId: z.string().trim().min(1, "App ID é obrigatório"),
        secret: z.string().trim().min(1, "Chave Secreta é obrigatória"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    return saveShopeeSettings(data.appId, data.secret, context.supabase);
  });

// ---- Current session + admin check ----
export const getCurrentUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const userId = context.userId;
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email ?? null;

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    return { userId, email, isAdmin };
  });

// ---- Product CRUD (admin only; RLS enforces admin) ----
export const addProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => productSchema.parse(data))
  .handler(async ({ data, context }) => {
    return createProduct(
      data as ProductInput,
      context.userId,
      context.supabase,
    );
  });

export const editProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data) =>
      z
        .object({ id: z.string().uuid(), fields: productSchema.partial() })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    return updateProduct(
      data.id,
      data.fields as Partial<ProductInput>,
      context.supabase,
    );
  });

export const removeProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data) => z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await deleteProduct(data.id, context.supabase);
    return { ok: true };
  });
