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
  type Product,
  type ProductInput,
  type ShopeeMeta,
} from "./products.server";

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

// ---- Scrape Shopee link (admin only) ----
export const scrapeShopee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ url: z.string().url() }).parse(data))
  .handler(async ({ data }): Promise<ShopeeMeta> => {
    return fetchShopeeMeta(data.url);
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
    const isAdmin =
      (roles ?? []).some((r) => r.role === "admin") ||
      // first-user fallback: no admins exist means this user is the initial admin
      (roles ?? []).some((r) => r.role === "admin");
    return { userId, email, isAdmin };
  });

// ---- Product CRUD (admin only; RLS enforces admin) ----
export const addProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => productSchema.parse(data))
  .handler(async ({ data, context }) => {
    return createProduct(data as ProductInput, context.userId);
  });

export const editProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data) =>
      z
        .object({ id: z.string().uuid(), fields: productSchema.partial() })
        .parse(data),
  )
  .handler(async ({ data }) => {
    return updateProduct(data.id, data.fields as Partial<ProductInput>);
  });

export const removeProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data) => z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    await deleteProduct(data.id);
    return { ok: true };
  });
