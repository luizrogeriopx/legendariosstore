import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  listProducts,
  listFeatured,
  getCategories,
  getProductById,
  getRelatedProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  renameCategory,
  deleteCategory,
  fetchShopeeMeta,
  saveShopeeSettings,
  importProductsBatch,
  type Product,
  type ProductInput,
  type ShopeeMeta,
} from "./products.server";
import {
  getShopeeCredentials,
  testShopeeApiCredentials,
  searchShopeeCatalog,
  bulkFetchAffiliateVitrine,
} from "./shopee-api.server";

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

export const getProduct = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const product = await getProductById(data.id);
    if (!product) return { product: null, related: [] };
    const related = await getRelatedProducts(product.category, product.id, 4);
    return { product, related } as { product: Product | null; related: Product[] };
  });

// ---- Scrape Shopee link + generate official affiliate short link (admin only) ----
export const scrapeShopee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        url: z.string().url("URL inválida"),
        appId: z.string().optional().nullable(),
        secret: z.string().optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<ShopeeMeta> => {
    return fetchShopeeMeta(data.url, {
      appId: data.appId ?? null,
      secret: data.secret ?? null,
      supabase: context.supabase,
    });
  });


// ---- Shopee API Settings (admin only) ----
export const getShopeeSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const creds = await getShopeeCredentials(context.supabase);
      return {
        appId: creds.appId || "",
        hasSecret: Boolean(creds.secret),
        maskedSecret: creds.secret
          ? creds.secret.slice(0, 4) + "••••••••" + creds.secret.slice(-4)
          : "",
      };
    } catch {
      return {
        appId: "",
        hasSecret: false,
        maskedSecret: "",
      };
    }
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
    try {
      await saveShopeeSettings(data.appId, data.secret, context.supabase);
      return { ok: true };
    } catch (err) {
      console.warn("Could not save to Supabase affiliate_settings table:", err);
      return { ok: false, warning: "Salvo localmente no navegador." };
    }
  });

export const testShopeeConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        appId: z.string().trim().min(1, "App ID é obrigatório"),
        secret: z.string().trim().min(1, "Chave Secreta é obrigatória"),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    return testShopeeApiCredentials(data.appId, data.secret);
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

export const renameCategoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data) =>
      z
        .object({
          oldCategory: z.string().min(1, "Categoria original é obrigatória"),
          newCategory: z.string().trim().min(1, "Novo nome é obrigatório").max(80),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    return renameCategory(data.oldCategory, data.newCategory, context.supabase);
  });

export const deleteCategoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data) =>
      z
        .object({
          category: z.string().min(1, "Nome da categoria é obrigatório"),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    return deleteCategory(data.category, context.supabase);
  });

// ---- Browse Shopee Catalog (admin only) ----
export const browseShopeeCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        keyword: z.string().optional().nullable(),
        listType: z.number().int().optional(),
        sortType: z.number().int().optional(),
        page: z.number().int().optional(),
        limit: z.number().int().optional(),
        appId: z.string().optional().nullable(),
        secret: z.string().optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    let appId = data.appId?.trim() || null;
    let secret = data.secret?.trim() || null;

    if (!appId || !secret) {
      const creds = await getShopeeCredentials(context.supabase);
      if (creds.appId) appId = creds.appId;
      if (creds.secret) secret = creds.secret;
    }

    if (!appId || !secret) {
      return {
        items: [],
        hasNextPage: false,
        error:
          "Configure seu App ID e Chave Secreta para explorar o catálogo de produtos da Shopee.",
      };
    }

    return searchShopeeCatalog({
      keyword: data.keyword,
      listType: data.listType,
      sortType: data.sortType,
      page: data.page,
      limit: data.limit,
      appId,
      secret,
    });
  });

// ---- Batch Import Products into Vitrine (admin only) ----
export const batchImportProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        products: z.array(productSchema),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    return importProductsBatch(
      data.products as ProductInput[],
      context.userId,
      context.supabase,
    );
  });

// ---- Bulk Sync from Shopee Affiliate Vitrine/Catalog (admin only) ----
export const bulkSyncVitrine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        appId: z.string().optional().nullable(),
        secret: z.string().optional().nullable(),
        count: z.number().int().min(5).max(100).default(50),
        sortType: z.number().int().default(2),
        keyword: z.string().optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    let appId = data.appId?.trim() || null;
    let secret = data.secret?.trim() || null;

    if (!appId || !secret) {
      const creds = await getShopeeCredentials(context.supabase);
      if (creds.appId) appId = creds.appId;
      if (creds.secret) secret = creds.secret;
    }

    if (!appId || !secret) {
      throw new Error(
        "Configure seu App ID e Chave Secreta para sincronizar sua vitrine de afiliados Shopee.",
      );
    }

    const { items, error } = await bulkFetchAffiliateVitrine({
      appId,
      secret,
      count: data.count,
      sortType: data.sortType,
      keyword: data.keyword,
    });

    if (error) {
      throw new Error(`Erro na API Shopee: ${error}`);
    }

    if (!items.length) {
      return { count: 0, message: "Nenhum produto encontrado no catálogo Shopee." };
    }

    const toInsert: ProductInput[] = items.map((item, idx) => ({
      title: item.productName,
      image_url: item.imageUrl,
      price: item.price,
      original_price: item.priceMax,
      discount_pct: item.discount_pct ?? null,
      shopee_url: item.offerLink || item.productLink,
      category: item.shopName ?? "Geral",
      rating: item.ratingStar ?? null,
      sold_count: item.sales ?? 0,
      featured: idx < 4,
      sort_order: idx,
    }));

    const res = await importProductsBatch(
      toInsert,
      context.userId,
      context.supabase,
    );

    return {
      count: res.count,
      message: `${res.count} produtos da Shopee importados com sucesso para sua vitrine!`,
    };
  });
