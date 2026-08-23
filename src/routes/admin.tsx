import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  Pencil,
  Link2,
  LogOut,
  Star,
  ExternalLink,
  RefreshCw,
  Key,
  Settings,
  ShieldCheck,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Search,
  ShoppingBag,
  TrendingUp,
  Percent,
  Layers,
  CheckSquare,
  Square,
  Store,
  Flame,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/site-header";
import { ProductCard } from "@/components/product-card";
import { formatBRL } from "@/lib/format";
import {
  getProducts,
  getCurrentUser,
  addProduct,
  editProduct,
  removeProduct,
  scrapeShopee,
  getShopeeSettings,
  saveShopeeSettingsFn,
  testShopeeConnection,
  browseShopeeCatalog,
  batchImportProducts,
} from "@/lib/products.functions";
import type { Product, ProductInput } from "@/lib/products.server";
import type { ShopeeCatalogItem } from "@/lib/shopee-api.server";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Painel Admin — ShopPeça" },
      { name: "description", content: "Gerencie os produtos da sua vitrine." },
    ],
  }),
  beforeLoad: async () => {
    // No loader-side protected call: component checks session + admin via
    // server function and redirects when needed.
  },
  component: AdminPage,
});

const emptyDraft: ProductInput = {
  title: "",
  description: "",
  image_url: "",
  price: null,
  original_price: null,
  discount_pct: null,
  shopee_url: "",
  category: "",
  rating: null,
  sold_count: 0,
  featured: false,
  sort_order: 0,
};

const CATEGORY_QUICK_SEARCH = [
  "Todos",
  "Eletrônicos & Fones",
  "Relógios & Smartwatch",
  "Moda Masculina",
  "Moda Feminina",
  "Tênis & Calçados",
  "Beleza & Saúde",
  "Casa & Cozinha",
  "Games & Acessórios",
];

function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getCurrentUserFn = useServerFn(getCurrentUser);
  const addProductFn = useServerFn(addProduct);
  const editProductFn = useServerFn(editProduct);
  const removeProductFn = useServerFn(removeProduct);
  const scrapeShopeeFn = useServerFn(scrapeShopee);
  const getShopeeSettingsFn = useServerFn(getShopeeSettings);
  const saveShopeeSettingsFnCall = useServerFn(saveShopeeSettingsFn);
  const testShopeeConnectionFn = useServerFn(testShopeeConnection);
  const browseShopeeCatalogFn = useServerFn(browseShopeeCatalog);
  const batchImportProductsFn = useServerFn(batchImportProducts);

  const userQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: () => getCurrentUserFn(),
    retry: false,
  });

  // Redirect unauthenticated / non-admin away.
  useEffect(() => {
    if (userQuery.isError) {
      navigate({ to: "/auth" });
    }
  }, [userQuery.isError, navigate]);

  const productsQuery = useQuery({
    queryKey: ["products"],
    queryFn: () => getProducts(),
    enabled: userQuery.data?.isAdmin,
  });

  const shopeeSettingsQuery = useQuery({
    queryKey: ["shopee-settings"],
    queryFn: () => getShopeeSettingsFn(),
    enabled: userQuery.data?.isAdmin,
  });

  const LOCAL_STORAGE_KEY = "shopee_affiliate_creds_v1";

  const [activeTab, setActiveTab] = useState<"vitrine" | "catalog">("vitrine");
  const [showSettings, setShowSettings] = useState(false);
  const [appIdInput, setAppIdInput] = useState("");
  const [secretInput, setSecretInput] = useState("");
  const [savedSecret, setSavedSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingApi, setTestingApi] = useState(false);

  // Catalog State
  const [catalogKeyword, setCatalogKeyword] = useState("");
  const [catalogSortType, setCatalogSortType] = useState(2);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogItems, setCatalogItems] = useState<ShopeeCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importingBatch, setImportingBatch] = useState(false);
  const [importingItemId, setImportingItemId] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.appId) setAppIdInput(parsed.appId);
        if (parsed.secret) {
          setSecretInput(parsed.secret);
          setSavedSecret(parsed.secret);
        }
      }
    } catch {}
  }, []);

  // Sync settings when backend query is loaded (if not already in localStorage)
  useEffect(() => {
    if (shopeeSettingsQuery.data?.appId && !appIdInput) {
      setAppIdInput(shopeeSettingsQuery.data.appId);
    }
  }, [shopeeSettingsQuery.data]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductInput>(emptyDraft);
  const [shopeeLink, setShopeeLink] = useState("");
  const [scraping, setScraping] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasApiCredentials = Boolean(
    (appIdInput.trim() || shopeeSettingsQuery.data?.appId) &&
    (secretInput.trim() || savedSecret || shopeeSettingsQuery.data?.hasSecret),
  );

  if (userQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (userQuery.isError || !userQuery.data?.isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const products = productsQuery.data?.products ?? [];

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    const cleanId = appIdInput.trim();
    const cleanSecret = secretInput.trim() || savedSecret.trim();

    if (!cleanId || !cleanSecret) {
      toast.error("Preencha o App ID e a Chave Secreta.");
      return;
    }
    setSavingSettings(true);
    try {
      // 1. Always save in localStorage immediately for guaranteed persistence
      localStorage.setItem(
        LOCAL_STORAGE_KEY,
        JSON.stringify({ appId: cleanId, secret: cleanSecret }),
      );
      setSavedSecret(cleanSecret);

      // 2. Try saving to Supabase backend
      await saveShopeeSettingsFnCall({
        data: { appId: cleanId, secret: cleanSecret },
      });

      toast.success("Credenciais da API Shopee salvas com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["shopee-settings"] });
      setShowSettings(false);
    } catch {
      toast.success("Credenciais salvas com sucesso no navegador!");
      setShowSettings(false);
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleTestApi() {
    const cleanId = appIdInput.trim();
    const cleanSecret = secretInput.trim() || savedSecret.trim();

    if (!cleanId || !cleanSecret) {
      toast.error("Preencha o App ID e a Chave Secreta antes de testar.");
      return;
    }
    setTestingApi(true);
    try {
      const res = await testShopeeConnectionFn({
        data: { appId: cleanId, secret: cleanSecret },
      });
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao testar API Shopee.",
      );
    } finally {
      setTestingApi(false);
    }
  }

  async function handleBrowseCatalog(kw?: string, sort?: number, pageNum = 1) {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      let activeAppId = appIdInput.trim();
      let activeSecret = secretInput.trim() || savedSecret.trim();

      if (!activeAppId || !activeSecret) {
        try {
          const local = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (local) {
            const p = JSON.parse(local);
            if (p.appId && !activeAppId) activeAppId = p.appId;
            if (p.secret && !activeSecret) activeSecret = p.secret;
          }
        } catch {}
      }

      const term = kw !== undefined ? kw : catalogKeyword;
      const sType = sort !== undefined ? sort : catalogSortType;

      const res = await browseShopeeCatalogFn({
        data: {
          keyword: term.trim() || undefined,
          sortType: sType,
          page: pageNum,
          limit: 20,
          appId: activeAppId || undefined,
          secret: activeSecret || undefined,
        },
      });

      if (res.error) {
        setCatalogError(res.error);
      } else {
        setCatalogItems(res.items || []);
        setSelectedIds(new Set());
        setCatalogPage(pageNum);
      }
    } catch (err) {
      setCatalogError(
        err instanceof Error ? err.message : "Erro ao carregar catálogo.",
      );
    } finally {
      setCatalogLoading(false);
    }
  }

  async function handleImportCatalogItem(item: ShopeeCatalogItem) {
    setImportingItemId(item.itemId);
    try {
      let activeAppId = appIdInput.trim();
      let activeSecret = secretInput.trim() || savedSecret.trim();

      if (!activeAppId || !activeSecret) {
        try {
          const local = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (local) {
            const p = JSON.parse(local);
            if (p.appId && !activeAppId) activeAppId = p.appId;
            if (p.secret && !activeSecret) activeSecret = p.secret;
          }
        } catch {}
      }

      let finalUrl = item.offerLink || item.productLink;
      if (
        (!item.offerLink || (!item.offerLink.includes("shp.ee") && !item.offerLink.includes("s.shopee"))) &&
        activeAppId &&
        activeSecret &&
        item.productLink
      ) {
        try {
          const linkRes = await scrapeShopeeFn({
            data: {
              url: item.productLink,
              appId: activeAppId,
              secret: activeSecret,
            },
          });
          if (linkRes.affiliateUrl) finalUrl = linkRes.affiliateUrl;
        } catch {}
      }

      const pInput: ProductInput = {
        title: item.productName,
        image_url: item.imageUrl,
        price: item.price,
        original_price: item.priceMax,
        discount_pct: item.discount_pct ?? null,
        shopee_url: finalUrl,
        category: item.shopName ?? "Geral",
        rating: item.ratingStar ?? null,
        sold_count: item.sales ?? 0,
        featured: false,
        sort_order: 0,
      };

      await addProductFn({ data: pInput });
      toast.success(`"${item.productName.slice(0, 30)}..." adicionado à sua vitrine!`);
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao importar produto.",
      );
    } finally {
      setImportingItemId(null);
    }
  }

  async function handleBatchImport(itemsToImport: ShopeeCatalogItem[]) {
    if (!itemsToImport.length) return;
    setImportingBatch(true);
    try {
      const productsToInsert: ProductInput[] = itemsToImport.map(
        (item, idx) => ({
          title: item.productName,
          image_url: item.imageUrl,
          price: item.price,
          original_price: item.priceMax,
          discount_pct: item.discount_pct ?? null,
          shopee_url: item.offerLink || item.productLink,
          category: item.shopName ?? "Geral",
          rating: item.ratingStar ?? null,
          sold_count: item.sales ?? 0,
          featured: false,
          sort_order: idx,
        }),
      );

      const res = await batchImportProductsFn({
        data: { products: productsToInsert },
      });

      toast.success(
        `${res.count} produtos importados com sucesso para sua vitrine!`,
      );
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setActiveTab("vitrine");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao importar em lote.",
      );
    } finally {
      setImportingBatch(false);
    }
  }

  function toggleSelectId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === catalogItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(catalogItems.map((i) => i.itemId)));
    }
  }

  async function scrape() {
    const rawLink = shopeeLink.trim();
    if (!rawLink) return;
    setScraping(true);
    try {
      let activeAppId = appIdInput.trim();
      let activeSecret = secretInput.trim() || savedSecret.trim();

      if (!activeAppId || !activeSecret) {
        try {
          const local = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (local) {
            const p = JSON.parse(local);
            if (p.appId && !activeAppId) activeAppId = p.appId;
            if (p.secret && !activeSecret) activeSecret = p.secret;
          }
        } catch {}
      }

      const meta = await scrapeShopeeFn({
        data: {
          url: rawLink,
          appId: activeAppId || undefined,
          secret: activeSecret || undefined,
        },
      });

      const finalUrl = meta.affiliateUrl || rawLink;

      setDraft((d) => ({
        ...d,
        shopee_url: finalUrl,
        title: meta.title ?? d.title,
        image_url: meta.image ?? d.image_url,
        description: meta.description ?? d.description,
        price: meta.price ?? d.price,
        original_price: meta.original_price ?? d.original_price,
        discount_pct: meta.discount_pct ?? d.discount_pct,
        rating: meta.rating ?? d.rating,
        sold_count: meta.sold_count ?? d.sold_count,
        category: meta.category ?? d.category,
      }));

      if (meta.isOfficialLink) {
        toast.success(
          "Produto importado e link convertido para seu link oficial de afiliado Shopee!",
        );
      } else if (meta.apiError) {
        toast.warning(
          `Produto importado, mas a API Shopee retornou: ${meta.apiError}. Verifique seu AppID e Senha.`,
        );
      } else if (!activeAppId || !activeSecret) {
        toast.info(
          "Produto importado! Configure seu AppID e Senha no topo para gerar links de afiliado automaticamente.",
        );
      } else {
        toast.success("Dados do produto importados com sucesso!");
      }
      setShowForm(true);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Não consegui ler o link. Preencha os campos manualmente.",
      );
      setDraft((d) => ({ ...d, shopee_url: rawLink }));
      setShowForm(true);
    } finally {
      setScraping(false);
    }
  }

  function startEdit(p: Product) {
    setEditingId(p.id);
    setDraft({
      title: p.title,
      description: p.description ?? "",
      image_url: p.image_url ?? "",
      price: p.price,
      original_price: p.original_price,
      discount_pct: p.discount_pct,
      shopee_url: p.shopee_url,
      category: p.category ?? "",
      rating: p.rating,
      sold_count: p.sold_count ?? 0,
      featured: p.featured,
      sort_order: p.sort_order,
    });
    setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await editProductFn({
          data: { id: editingId, fields: draft },
        });
        toast.success("Produto atualizado.");
      } else {
        await addProductFn({ data: draft });
        toast.success("Produto adicionado.");
      }
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao salvar produto.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remover este produto?")) return;
    try {
      await removeProductFn({ data: { id } });
      toast.success("Produto removido.");
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover.");
    }
  }

  function resetForm() {
    setDraft(emptyDraft);
    setEditingId(null);
    setShowForm(false);
    setShopeeLink("");
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              Painel do afiliado
            </h1>
            <p className="text-sm text-muted-foreground">
              {products.length} produtos na vitrine
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              className={
                hasApiCredentials
                  ? "border-emerald-500/40 text-foreground hover:bg-secondary"
                  : "border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
              }
            >
              <Key className="mr-1.5 h-4 w-4" />
              {hasApiCredentials ? "API Shopee Conectada" : "Configurar API Shopee"}
            </Button>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="mr-1.5 h-4 w-4" /> Sair
            </Button>
            <Button
              size="sm"
              className="shopee-gradient text-primary-foreground"
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Novo produto
            </Button>
          </div>
        </div>

        {/* Settings Card */}
        {showSettings && (
          <Card className="mb-6 border-primary/30 bg-card p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Key className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    Configurações da API Oficial Shopee Afiliados
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Gera seus links oficiais de afiliado automaticamente ao colar qualquer link da Shopee.
                  </p>
                </div>
              </div>
              {hasApiCredentials ? (
                <Badge className="border-0 bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400">
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Conectado
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-amber-500/40 text-amber-600 dark:text-amber-400"
                >
                  <AlertCircle className="mr-1 h-3.5 w-3.5" /> Não configurado
                </Badge>
              )}
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-foreground">
                    App ID (Shopee Open API)
                  </span>
                  <input
                    type="text"
                    required
                    value={appIdInput}
                    onChange={(e) => setAppIdInput(e.target.value)}
                    placeholder="Ex: 123456789"
                    className={inputCls}
                  />
                </label>

                <label className="block space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      Chave Secreta (Secret / Senha da API)
                    </span>
                    {shopeeSettingsQuery.data?.hasSecret && (
                      <span className="text-[11px] text-muted-foreground">
                        Atual: {shopeeSettingsQuery.data.maskedSecret}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showSecret ? "text" : "password"}
                      required
                      value={secretInput}
                      onChange={(e) => setSecretInput(e.target.value)}
                      placeholder={
                        shopeeSettingsQuery.data?.hasSecret
                          ? "Digite a nova senha para atualizar"
                          : "Cole sua chave secreta da Shopee"
                      }
                      className={inputCls + " pr-10"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showSecret ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-xs text-muted-foreground">
                  Obtenha suas credenciais no portal da Shopee em{" "}
                  <a
                    href="https://affiliate.shopee.com.br/open_api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-primary underline"
                  >
                    affiliate.shopee.com.br/open_api{" "}
                    <ExternalLink className="inline h-3 w-3" />
                  </a>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={testingApi}
                    onClick={handleTestApi}
                  >
                    {testingApi ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-1.5 h-4 w-4 text-emerald-500" />
                    )}
                    Testar Conexão
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSettings(false)}
                  >
                    Fechar
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={savingSettings}
                    className="shopee-gradient text-primary-foreground"
                  >
                    {savingSettings && (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    )}
                    Salvar Credenciais
                  </Button>
                </div>
              </div>
            </form>
          </Card>
        )}

        {/* Navigation Tabs */}
        <div className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3">
          <button
            onClick={() => setActiveTab("vitrine")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === "vitrine"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <Store className="h-4 w-4" />
            Minha Vitrine ({products.length})
          </button>
          <button
            onClick={() => {
              setActiveTab("catalog");
              if (catalogItems.length === 0 && !catalogLoading) {
                handleBrowseCatalog("", 2, 1);
              }
            }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === "catalog"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <Sparkles className="h-4 w-4 text-amber-300" />
            Explorar Catálogo Shopee & Importar em Lote
          </button>
        </div>

        {/* TAB 1: VITRINE & SINGLE IMPORT */}
        {activeTab === "vitrine" && (
          <div>
            {/* Paste link box */}
            <Card className="mb-6 border-primary/20 bg-secondary/40 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label className="block text-sm font-semibold text-foreground">
                  Importar produto individual por link da Shopee
                </label>
                {hasApiCredentials ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <Sparkles className="h-3.5 w-3.5" /> Geração de link de afiliado ativa
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSettings(true)}
                    className="inline-flex items-center gap-1 text-xs text-amber-600 hover:underline dark:text-amber-400"
                  >
                    <AlertCircle className="h-3.5 w-3.5" /> Configurar AppID para gerar links automáticos
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={shopeeLink}
                    onChange={(e) => setShopeeLink(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        scrape();
                      }
                    }}
                    placeholder="https://shopee.com.br/... ou link encurtado"
                    className="w-full rounded-lg border border-input bg-card py-2.5 pl-9 pr-3 text-sm text-foreground outline-none ring-ring transition focus:border-primary focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <Button
                  onClick={scrape}
                  disabled={scraping || !shopeeLink}
                  className="shopee-gradient text-primary-foreground"
                >
                  {scraping ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-4 w-4" />
                  )}
                  Importar Produto
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Ao importar, buscamos automaticamente o título, imagem, preço e geramos o seu link de afiliado oficial.
              </p>
            </Card>

            {showForm && (
              <Card className="mb-6 p-4">
                <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
                  <Field label="Título" full>
                    <input
                      required
                      value={draft.title}
                      onChange={(e) =>
                        setDraft({ ...draft, title: e.target.value })
                      }
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Link da Shopee (afiliado)" full>
                    <input
                      required
                      type="url"
                      value={draft.shopee_url}
                      onChange={(e) =>
                        setDraft({ ...draft, shopee_url: e.target.value })
                      }
                      className={inputCls}
                    />
                  </Field>
                  <Field label="URL da imagem">
                    <div className="flex items-center gap-2">
                      {draft.image_url && (
                        <img
                          src={draft.image_url}
                          alt="Prévia"
                          className="h-10 w-10 shrink-0 rounded-md border border-border object-cover"
                        />
                      )}
                      <input
                        type="url"
                        value={draft.image_url ?? ""}
                        onChange={(e) =>
                          setDraft({ ...draft, image_url: e.target.value })
                        }
                        placeholder="https://down-br.img.susercontent.com/file/..."
                        className={inputCls}
                      />
                    </div>
                  </Field>
                  <Field label="Categoria">
                    <input
                      value={draft.category ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, category: e.target.value })
                      }
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Preço (R$)">
                    <input
                      type="number"
                      step="0.01"
                      value={draft.price ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          price: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Preço original (R$)">
                    <input
                      type="number"
                      step="0.01"
                      value={draft.original_price ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          original_price: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Desconto (%)">
                    <input
                      type="number"
                      value={draft.discount_pct ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          discount_pct: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Avaliação (0-5)">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="5"
                      value={draft.rating ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          rating: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Vendidos">
                    <input
                      type="number"
                      value={draft.sold_count ?? 0}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          sold_count: Number(e.target.value),
                        })
                      }
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Descrição" full>
                    <textarea
                      rows={2}
                      value={draft.description ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, description: e.target.value })
                      }
                      className={inputCls}
                    />
                  </Field>
                  <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={!!draft.featured}
                      onChange={(e) =>
                        setDraft({ ...draft, featured: e.target.checked })
                      }
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                    Destacar na vitrine (Top)
                  </label>

                  <div className="flex gap-2 sm:col-span-2">
                    <Button
                      type="submit"
                      disabled={saving}
                      className="shopee-gradient text-primary-foreground"
                    >
                      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {editingId ? "Salvar alterações" : "Adicionar produto"}
                    </Button>
                    <Button type="button" variant="outline" onClick={resetForm}>
                      Cancelar
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {/* Product list */}
            <div className="space-y-3">
              {products.length === 0 && !productsQuery.isLoading ? (
                <div className="rounded-xl border border-dashed border-border p-12 text-center">
                  <ShoppingBag className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
                  <p className="font-semibold text-foreground">
                    Sua vitrine está vazia
                  </p>
                  <p className="mb-4 text-xs text-muted-foreground">
                    Você pode importar produtos individuais acima ou navegar no Catálogo Shopee para adicionar dezenas de produtos com 1 clique.
                  </p>
                  <Button
                    size="sm"
                    className="shopee-gradient text-primary-foreground"
                    onClick={() => {
                      setActiveTab("catalog");
                      handleBrowseCatalog("", 2, 1);
                    }}
                  >
                    <Sparkles className="mr-1.5 h-4 w-4" />
                    Explorar Catálogo Shopee
                  </Button>
                </div>
              ) : (
                products.map((p) => (
                  <Card
                    key={p.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.title}
                          className="h-16 w-16 shrink-0 rounded-lg border border-border object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                          Sem foto
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-semibold text-foreground">
                            {p.title}
                          </h3>
                          {p.featured && (
                            <Badge className="bg-primary/20 text-primary hover:bg-primary/30">
                              Destaque
                            </Badge>
                          )}
                          {p.category && (
                            <Badge variant="outline">{p.category}</Badge>
                          )}
                        </div>
                        <p className="text-sm font-bold text-primary">
                          {formatBRL(p.price)}
                          {p.original_price && p.original_price > (p.price ?? 0) && (
                            <span className="ml-2 text-xs font-normal text-muted-foreground line-through">
                              {formatBRL(p.original_price)}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.sold_count ?? 0} vendidos • ⭐ {p.rating ?? "—"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startEdit(p)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => remove(p.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 2: EXPLORAR CATÁLOGO SHOPEE */}
        {activeTab === "catalog" && (
          <div className="space-y-6">
            <Card className="border-primary/30 bg-card p-5 shadow-sm">
              <div className="mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h2 className="text-base font-bold text-foreground">
                    Catálogo Oficial Shopee Afiliados
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pesquise e importe produtos reais da Shopee diretamente para sua vitrine com links de afiliado gerados automaticamente.
                </p>
              </div>

              {/* Search Bar & Filters */}
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={catalogKeyword}
                      onChange={(e) => setCatalogKeyword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleBrowseCatalog(catalogKeyword, catalogSortType, 1);
                        }
                      }}
                      placeholder="Buscar no catálogo Shopee (ex: smartwatch, fone bluetooth, camisa, tênis)..."
                      className="w-full rounded-lg border border-input bg-background py-2.5 pl-9 pr-3 text-sm text-foreground outline-none ring-ring transition focus:border-primary focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <Button
                    onClick={() => handleBrowseCatalog(catalogKeyword, catalogSortType, 1)}
                    disabled={catalogLoading}
                    className="shopee-gradient text-primary-foreground"
                  >
                    {catalogLoading ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="mr-1.5 h-4 w-4" />
                    )}
                    Buscar Ofertas
                  </Button>
                </div>

                {/* Sort filters */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Ordenar por:
                  </span>
                  {[
                    { id: 2, label: "Mais Vendidos 🔥", sort: 2 },
                    { id: 5, label: "Maiores Comissões 💎", sort: 5 },
                    { id: 1, label: "Relevância ⭐", sort: 1 },
                    { id: 6, label: "Menor Preço 🏷️", sort: 6 },
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setCatalogSortType(s.sort);
                        handleBrowseCatalog(catalogKeyword, s.sort, 1);
                      }}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        catalogSortType === s.sort
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* Category Quick Chips */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Categorias rápidas:
                  </span>
                  {CATEGORY_QUICK_SEARCH.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => {
                        const term = cat === "Todos" ? "" : cat;
                        setCatalogKeyword(term);
                        handleBrowseCatalog(term, catalogSortType, 1);
                      }}
                      className="rounded-md border border-border/80 bg-background/50 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary/50 hover:bg-secondary hover:text-foreground"
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            {/* Error state */}
            {catalogError && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-600 dark:text-amber-400">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertCircle className="h-4 w-4" />
                  Aviso da API Shopee
                </div>
                <p className="mt-1 text-xs">{catalogError}</p>
              </div>
            )}

            {/* Batch Action Header */}
            {catalogItems.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleSelectAll}
                    className="text-xs"
                  >
                    {selectedIds.size === catalogItems.length ? (
                      <CheckSquare className="mr-1.5 h-4 w-4 text-primary" />
                    ) : (
                      <Square className="mr-1.5 h-4 w-4" />
                    )}
                    {selectedIds.size === catalogItems.length
                      ? "Desmarcar Todos"
                      : "Selecionar Todos (" + catalogItems.length + ")"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {selectedIds.size} de {catalogItems.length} selecionados
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    disabled={selectedIds.size === 0 || importingBatch}
                    onClick={() => {
                      const selected = catalogItems.filter((i) =>
                        selectedIds.has(i.itemId),
                      );
                      handleBatchImport(selected);
                    }}
                    className="shopee-gradient text-primary-foreground"
                  >
                    {importingBatch ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-1.5 h-4 w-4" />
                    )}
                    Importar Selecionados ({selectedIds.size})
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={importingBatch}
                    onClick={() => handleBatchImport(catalogItems)}
                  >
                    Importar Todos da Página ({catalogItems.length})
                  </Button>
                </div>
              </div>
            )}

            {/* Catalog Grid */}
            {catalogLoading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-64 animate-pulse rounded-xl border border-border bg-secondary/40"
                  />
                ))}
              </div>
            ) : catalogItems.length === 0 && !catalogError ? (
              <div className="rounded-xl border border-dashed border-border p-12 text-center">
                <Search className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
                <p className="font-semibold text-foreground">
                  Nenhum produto encontrado
                </p>
                <p className="text-xs text-muted-foreground">
                  Digite uma palavra-chave acima ou clique em uma das categorias para buscar no catálogo Shopee.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {catalogItems.map((item) => {
                  const isSelected = selectedIds.has(item.itemId);
                  const isImporting = importingItemId === item.itemId;

                  return (
                    <Card
                      key={item.itemId}
                      className={`group relative flex flex-col overflow-hidden border transition hover:border-primary/60 hover:shadow-md ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border bg-card"
                      }`}
                    >
                      {/* Checkbox badge */}
                      <button
                        type="button"
                        onClick={() => toggleSelectId(item.itemId)}
                        className="absolute left-2.5 top-2.5 z-10 rounded-md bg-background/80 p-1 shadow-sm backdrop-blur-sm transition hover:bg-background"
                      >
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-primary" />
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>

                      {/* Commission / Discount badge */}
                      <div className="absolute right-2.5 top-2.5 z-10 flex flex-col gap-1 items-end">
                        {item.discount_pct && (
                          <Badge className="bg-destructive text-destructive-foreground text-[10px] font-bold">
                            -{item.discount_pct}%
                          </Badge>
                        )}
                        {item.commissionRate && (
                          <Badge className="bg-emerald-600 text-white text-[10px] font-bold">
                            +{item.commissionRate}% comissão
                          </Badge>
                        )}
                      </div>

                      {/* Image */}
                      <div className="relative aspect-square w-full overflow-hidden bg-secondary">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.productName}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                            Sem imagem
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex flex-1 flex-col p-3.5">
                        <h4 className="line-clamp-2 text-xs font-semibold text-foreground">
                          {item.productName}
                        </h4>

                        <div className="mt-2 flex items-baseline gap-1.5">
                          <span className="text-base font-extrabold text-primary">
                            {formatBRL(item.price)}
                          </span>
                          {item.priceMax && item.priceMax > (item.price ?? 0) && (
                            <span className="text-xs text-muted-foreground line-through">
                              {formatBRL(item.priceMax)}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{item.sales ?? 0} vendidos</span>
                          {item.ratingStar && (
                            <span className="flex items-center gap-0.5 text-amber-500 font-medium">
                              <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                              {item.ratingStar.toFixed(1)}
                            </span>
                          )}
                        </div>

                        {item.shopName && (
                          <span className="mt-1 truncate text-[10px] text-muted-foreground/80">
                            🏬 {item.shopName}
                          </span>
                        )}

                        <div className="mt-auto pt-3">
                          <Button
                            size="sm"
                            disabled={isImporting}
                            onClick={() => handleImportCatalogItem(item)}
                            className="w-full shopee-gradient text-primary-foreground text-xs"
                          >
                            {isImporting ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Plus className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Adicionar à Minha Vitrine
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {catalogItems.length > 0 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={catalogPage <= 1 || catalogLoading}
                  onClick={() =>
                    handleBrowseCatalog(
                      catalogKeyword,
                      catalogSortType,
                      catalogPage - 1,
                    )
                  }
                >
                  Página Anterior
                </Button>
                <span className="text-xs font-semibold text-muted-foreground px-2">
                  Página {catalogPage}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={catalogLoading}
                  onClick={() =>
                    handleBrowseCatalog(
                      catalogKeyword,
                      catalogSortType,
                      catalogPage + 1,
                    )
                  }
                >
                  Próxima Página
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-input bg-card py-2 px-3 text-sm text-foreground outline-none ring-ring transition focus:border-primary focus:ring-2 focus:ring-primary/30";

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={"block space-y-1.5 " + (full ? "sm:col-span-2" : "")}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
