import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
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
  Download,
  Copy,
  FileSpreadsheet,
  Zap,
  Tag,
  Check,
  X,
  FolderPlus,
  SlidersHorizontal,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { SiteHeader } from "@/components/site-header";
import { ProductCard } from "@/components/product-card";
import { formatBRL } from "@/lib/format";
import {
  getProducts,
  getCurrentUser,
  addProduct,
  editProduct,
  removeProduct,
  renameCategoryFn,
  deleteCategoryFn,
  scrapeShopee,
  getShopeeSettings,
  saveShopeeSettingsFn,
  testShopeeConnection,
  browseShopeeCatalog,
  batchImportProducts,
  bulkSyncVitrine,
} from "@/lib/products.functions";
import type { Product, ProductInput } from "@/lib/products.server";
import type { ShopeeCatalogItem } from "@/lib/shopee-api.server";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Painel Admin — Legendários Store" },
      { name: "description", content: "Gerencie os produtos da sua vitrine Legendários Store." },
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

const INITIAL_DEFAULT_CATEGORIES = [
  "Eletrônicos & Fones",
  "Relógios & Smartwatch",
  "Moda Masculina",
  "Moda Feminina",
  "Tênis & Calçados",
  "Beleza & Saúde",
  "Casa & Cozinha",
  "Games & Acessórios",
];

const CATEGORIES_STORAGE_KEY = "shopee_managed_categories_v2";
const DELETED_CATEGORIES_KEY = "shopee_deleted_categories_v2";

function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getCurrentUserFn = useServerFn(getCurrentUser);
  const addProductFn = useServerFn(addProduct);
  const editProductFn = useServerFn(editProduct);
  const removeProductFn = useServerFn(removeProduct);
  const renameCategoryFnCall = useServerFn(renameCategoryFn);
  const deleteCategoryFnCall = useServerFn(deleteCategoryFn);
  const scrapeShopeeFn = useServerFn(scrapeShopee);
  const getShopeeSettingsFn = useServerFn(getShopeeSettings);
  const saveShopeeSettingsFnCall = useServerFn(saveShopeeSettingsFn);
  const testShopeeConnectionFn = useServerFn(testShopeeConnection);
  const browseShopeeCatalogFn = useServerFn(browseShopeeCatalog);
  const batchImportProductsFn = useServerFn(batchImportProducts);
  const bulkSyncVitrineFn = useServerFn(bulkSyncVitrine);

  const [syncingVitrine, setSyncingVitrine] = useState(false);
  const [showBulkSyncModal, setShowBulkSyncModal] = useState(false);
  const [bulkSyncCount, setBulkSyncCount] = useState(50);
  const [bulkSyncSort, setBulkSyncSort] = useState(2);
  const [bulkSyncKeyword, setBulkSyncKeyword] = useState("");

  // Category Management State
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [editingCategoryOldName, setEditingCategoryOldName] = useState<string | null>(null);
  const [editingCategoryNewName, setEditingCategoryNewName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

  const [managedCategories, setManagedCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(CATEGORIES_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return INITIAL_DEFAULT_CATEGORIES;
  });

  const [deletedCategories, setDeletedCategories] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(DELETED_CATEGORIES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    } catch {}
    return new Set();
  });

  // Vitrine Search & Category Filtering
  const [vitrineSearch, setVitrineSearch] = useState("");
  const [vitrineCategoryFilter, setVitrineCategoryFilter] = useState<string | null>(null);

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
    enabled: userQuery.data?.isAdmin === true,
  });

  const shopeeSettingsQuery = useQuery({
    queryKey: ["shopee-settings"],
    queryFn: () => getShopeeSettingsFn(),
    enabled: userQuery.data?.isAdmin === true,
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

  const products = useMemo(() => productsQuery.data?.products ?? [], [productsQuery.data?.products]);

  // Category counts from existing products
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    products.forEach((p) => {
      if (p.category?.trim()) {
        counts[p.category.trim()] = (counts[p.category.trim()] || 0) + 1;
      }
    });
    return counts;
  }, [products]);

  // All active unique categories (managed categories + products categories, minus deleted)
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    managedCategories.forEach((c) => {
      const trimmed = c.trim();
      if (trimmed && !deletedCategories.has(trimmed)) {
        set.add(trimmed);
      }
    });
    products.forEach((p) => {
      const trimmed = p.category?.trim();
      if (trimmed && !deletedCategories.has(trimmed)) {
        set.add(trimmed);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [products, managedCategories, deletedCategories]);

  // Vitrine search + category filter memo
  const filteredVitrineProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCat = !vitrineCategoryFilter || p.category === vitrineCategoryFilter;
      const matchesSearch =
        !vitrineSearch ||
        p.title.toLowerCase().includes(vitrineSearch.toLowerCase()) ||
        (p.description ?? "").toLowerCase().includes(vitrineSearch.toLowerCase()) ||
        (p.category ?? "").toLowerCase().includes(vitrineSearch.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [products, vitrineCategoryFilter, vitrineSearch]);

  const hasApiCredentials = Boolean(
    (appIdInput.trim() || shopeeSettingsQuery.data?.appId) &&
    (secretInput.trim() || savedSecret || shopeeSettingsQuery.data?.hasSecret),
  );

  function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newCategoryInput.trim();
    if (!trimmed) return;
    if (allCategories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Esta categoria já existe.");
      return;
    }

    const newDeleted = new Set(deletedCategories);
    if (newDeleted.has(trimmed)) {
      newDeleted.delete(trimmed);
      setDeletedCategories(newDeleted);
      try {
        localStorage.setItem(DELETED_CATEGORIES_KEY, JSON.stringify(Array.from(newDeleted)));
      } catch {}
    }

    const updated = Array.from(new Set([...managedCategories, trimmed]));
    setManagedCategories(updated);
    try {
      localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(updated));
    } catch {}

    setNewCategoryInput("");
    toast.success(`Categoria "${trimmed}" adicionada com sucesso!`);
  }

  async function handleRenameCategory(oldCat: string) {
    const trimmedNew = editingCategoryNewName.trim();
    if (!trimmedNew) {
      toast.error("O nome da categoria não pode ficar vazio.");
      return;
    }
    if (trimmedNew.toLowerCase() === oldCat.toLowerCase()) {
      setEditingCategoryOldName(null);
      return;
    }
    setSavingCategory(true);
    try {
      // 1. Mark oldCat as deleted so it never reappears
      const newDeleted = new Set(deletedCategories);
      newDeleted.add(oldCat);
      newDeleted.delete(trimmedNew);
      setDeletedCategories(newDeleted);
      try {
        localStorage.setItem(DELETED_CATEGORIES_KEY, JSON.stringify(Array.from(newDeleted)));
      } catch {}

      // 2. Replace in managedCategories list
      const updatedManaged = managedCategories
        .map((c) => (c === oldCat ? trimmedNew : c))
        .filter((c) => c !== oldCat);
      if (!updatedManaged.includes(trimmedNew)) {
        updatedManaged.push(trimmedNew);
      }
      setManagedCategories(updatedManaged);
      try {
        localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(updatedManaged));
      } catch {}

      // 3. Update database if any products used oldCat
      const count = categoryCounts[oldCat] || 0;
      if (count > 0) {
        await renameCategoryFnCall({
          data: { oldCategory: oldCat, newCategory: trimmedNew },
        });
      }

      if (vitrineCategoryFilter === oldCat) {
        setVitrineCategoryFilter(trimmedNew);
      }

      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(`Categoria alterada de "${oldCat}" para "${trimmedNew}"!`);
      setEditingCategoryOldName(null);
      setEditingCategoryNewName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar categoria.");
    } finally {
      setSavingCategory(false);
    }
  }

  async function handleDeleteCategory(cat: string) {
    const count = categoryCounts[cat] || 0;
    const msg =
      count > 0
        ? `Deseja excluir a categoria "${cat}"? ${count} produto(s) vinculado(s) ficarão sem categoria.`
        : `Deseja excluir a categoria "${cat}"?`;

    if (!confirm(msg)) return;

    setSavingCategory(true);
    try {
      // 1. Add to deletedCategories
      const newDeleted = new Set(deletedCategories);
      newDeleted.add(cat);
      setDeletedCategories(newDeleted);
      try {
        localStorage.setItem(DELETED_CATEGORIES_KEY, JSON.stringify(Array.from(newDeleted)));
      } catch {}

      // 2. Remove from managedCategories
      const updatedManaged = managedCategories.filter((c) => c !== cat);
      setManagedCategories(updatedManaged);
      try {
        localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(updatedManaged));
      } catch {}

      // 3. If products used this category, update database
      if (count > 0) {
        await deleteCategoryFnCall({ data: { category: cat } });
      }

      if (vitrineCategoryFilter === cat) {
        setVitrineCategoryFilter(null);
      }

      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(`Categoria "${cat}" excluída com sucesso!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir categoria.");
    } finally {
      setSavingCategory(false);
    }
  }

  function handleResetDefaultCategories() {
    if (!confirm("Deseja restaurar as categorias padrão do sistema?")) return;
    setDeletedCategories(new Set());
    try {
      localStorage.removeItem(DELETED_CATEGORIES_KEY);
    } catch {}
    setManagedCategories(INITIAL_DEFAULT_CATEGORIES);
    try {
      localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(INITIAL_DEFAULT_CATEGORIES));
    } catch {}
    queryClient.invalidateQueries({ queryKey: ["products"] });
    toast.success("Categorias padrão restauradas com sucesso!");
  }

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

  async function handleBulkSync(e?: React.FormEvent) {
    if (e) e.preventDefault();
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

    if (!activeAppId || !activeSecret) {
      toast.error("Configure seu App ID e Chave Secreta antes de sincronizar.");
      setShowSettings(true);
      return;
    }

    setSyncingVitrine(true);
    try {
      const res = await bulkSyncVitrineFn({
        data: {
          appId: activeAppId,
          secret: activeSecret,
          count: bulkSyncCount,
          sortType: bulkSyncSort,
          keyword: bulkSyncKeyword.trim() || undefined,
        },
      });

      toast.success(res.message);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setShowBulkSyncModal(false);
      setActiveTab("vitrine");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Erro ao sincronizar produtos da Shopee.",
      );
    } finally {
      setSyncingVitrine(false);
    }
  }

  function handleExportCSV() {
    if (products.length === 0) {
      toast.warning("Sua vitrine não possui produtos para exportar.");
      return;
    }

    const headers = [
      "ID",
      "Titulo",
      "Preco",
      "Preco Original",
      "Desconto (%)",
      "Link de Afiliado Shopee",
      "Categoria",
      "Avaliacao",
      "Vendidos",
      "Destaque",
      "URL Imagem",
    ];

    const rows = products.map((p) => [
      `"${p.id}"`,
      `"${(p.title || "").replace(/"/g, '""')}"`,
      p.price != null ? p.price.toFixed(2) : "",
      p.original_price != null ? p.original_price.toFixed(2) : "",
      p.discount_pct ?? "",
      `"${(p.shopee_url || "").replace(/"/g, '""')}"`,
      `"${(p.category || "").replace(/"/g, '""')}"`,
      p.rating ?? "",
      p.sold_count ?? 0,
      p.featured ? "SIM" : "NAO",
      `"${(p.image_url || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      "\uFEFF" +
      [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `vitrine_afiliados_shopee_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`${products.length} produtos exportados para planilha CSV!`);
  }

  function handleCopyFormattedLinks() {
    if (products.length === 0) {
      toast.warning("Sua vitrine não possui produtos para copiar.");
      return;
    }

    let text = "🛍️ *SELEÇÃO DE OFERTAS ESPECIAIS SHOPEE* 🛍️\n\n";
    products.forEach((p, idx) => {
      text += `${idx + 1}. *${p.title}*\n`;
      if (p.price != null) {
        text += `💰 *Por apenas ${formatBRL(p.price)}*`;
        if (p.original_price && p.original_price > p.price) {
          text += ` ~(${formatBRL(p.original_price)})~`;
        }
        if (p.discount_pct) {
          text += ` [${p.discount_pct}% OFF]`;
        }
        text += "\n";
      }
      text += `👉 *Compre aqui:* ${p.shopee_url}\n\n`;
    });

    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(text);
      toast.success("Lista de links formatada copiada para WhatsApp/Telegram!");
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
        category: null,
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
          category: null,
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
        title: meta.title ?? d.title ?? "",
        image_url: meta.image ?? d.image_url ?? null,
        description: meta.description ?? d.description ?? null,
        price: meta.price ?? d.price ?? null,
        original_price: meta.original_price ?? d.original_price ?? null,
        discount_pct: meta.discount_pct ?? d.discount_pct ?? null,
        rating: meta.rating ?? d.rating ?? null,
        sold_count: meta.sold_count ?? d.sold_count ?? 0,
        category: d.category || "",
      }));

      const gotRichData = Boolean(meta.image || meta.price);

      if (meta.isOfficialLink && gotRichData) {
        toast.success(
          "Produto importado e link convertido para seu link oficial de afiliado Shopee!",
        );
      } else if (meta.apiError) {
        toast.warning(
          `A API da Shopee retornou: ${meta.apiError}. Confira o AppID e a Chave Secreta.`,
        );
      } else if (!activeAppId || !activeSecret) {
        toast.warning(
          "A Shopee bloqueia a leitura automática de páginas. Configure seu AppID e Chave Secreta da API de Afiliados para importar título, imagem e preço automaticamente.",
        );
      } else if (!gotRichData) {
        toast.warning(
          "Não encontrei este produto na API de Afiliados. Preencha os campos manualmente abaixo.",
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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCategoriesModal(true)}
              className="border-primary/50 text-foreground hover:bg-primary/10"
              title="Gerenciar, criar e alterar categorias de produtos"
            >
              <Layers className="mr-1.5 h-4 w-4 text-primary" />
              Categorias ({allCategories.length})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBulkSyncModal(true)}
              className="border-primary/50 text-foreground hover:bg-primary/10"
            >
              <Zap className="mr-1.5 h-4 w-4 text-amber-500 fill-amber-500" />
              Sincronizar em Massa Shopee
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="text-xs"
              title="Baixar planilha CSV com todos os produtos e links de afiliado"
            >
              <FileSpreadsheet className="mr-1.5 h-4 w-4 text-emerald-600" />
              Exportar CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyFormattedLinks}
              className="text-xs"
              title="Copiar lista de ofertas formatada para WhatsApp / Telegram"
            >
              <Copy className="mr-1.5 h-4 w-4 text-primary" />
              Copiar Links
            </Button>
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
              {hasApiCredentials ? "API Shopee" : "Configurar API"}
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
                setActiveTab("vitrine");
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Novo produto
            </Button>
          </div>
        </div>

        {/* Bulk Sync Modal */}
        {showBulkSyncModal && (
          <Card className="mb-6 border-primary/40 bg-card p-5 shadow-lg">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Zap className="h-5 w-5 fill-amber-500 text-amber-500" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    Sincronização em Massa da Vitrine Shopee Afiliados
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Importe dezenas de produtos reais da Shopee automaticamente com seus links oficiais de afiliado gerados via API.
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowBulkSyncModal(false)}
              >
                ✕
              </Button>
            </div>

            <form onSubmit={handleBulkSync} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-foreground">
                    Quantidade de Produtos
                  </span>
                  <select
                    value={bulkSyncCount}
                    onChange={(e) => setBulkSyncCount(Number(e.target.value))}
                    className={inputCls}
                  >
                    <option value={20}>20 produtos</option>
                    <option value={50}>50 produtos (Recomendado)</option>
                    <option value={100}>100 produtos (Catálogo Completo)</option>
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-foreground">
                    Critério de Seleção
                  </span>
                  <select
                    value={bulkSyncSort}
                    onChange={(e) => setBulkSyncSort(Number(e.target.value))}
                    className={inputCls}
                  >
                    <option value={2}>🔥 Mais Vendidos da Shopee</option>
                    <option value={5}>💎 Maiores Comissões de Afiliado</option>
                    <option value={1}>⭐ Relevância / Em Alta</option>
                    <option value={6}>🏷️ Menor Preço</option>
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-foreground">
                    Nicho / Palavra-chave (Opcional)
                  </span>
                  <input
                    type="text"
                    value={bulkSyncKeyword}
                    onChange={(e) => setBulkSyncKeyword(e.target.value)}
                    placeholder="Ex: smartwatch, fone, beleza (ou vazio)"
                    className={inputCls}
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <p className="text-xs text-muted-foreground">
                  {hasApiCredentials ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      ✓ API Shopee conectada com seu AppID e Chave Secreta.
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                      ⚠️ Configure suas credenciais da Shopee para sincronizar.
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowBulkSyncModal(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={syncingVitrine}
                    className="shopee-gradient text-primary-foreground font-semibold"
                  >
                    {syncingVitrine ? (
                      <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        Sincronizando {bulkSyncCount} produtos...
                      </>
                    ) : (
                      <>
                        <Zap className="mr-1.5 h-4 w-4 fill-primary-foreground text-primary-foreground" />
                        Sincronizar {bulkSyncCount} Produtos Agora
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </Card>
        )}

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

            {/* Product Edit / Add Overlay Modal Dialog */}
            <Dialog
              open={showForm}
              onOpenChange={(open) => {
                if (!open) {
                  resetForm();
                } else {
                  setShowForm(true);
                }
              }}
            >
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
                    {editingId ? (
                      <Pencil className="h-5 w-5 text-primary" />
                    ) : (
                      <Plus className="h-5 w-5 text-primary" />
                    )}
                    {editingId ? "Editar Produto da Vitrine" : "Adicionar Novo Produto"}
                  </DialogTitle>
                  <DialogDescription>
                    {editingId
                      ? "Modifique os detalhes, fotos, valores ou categoria deste produto."
                      : "Preencha as informações do produto para disponibilizá-lo em sua vitrine."}
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={save} className="grid gap-4 sm:grid-cols-2 pt-2">
                  <Field label="Título do Produto" full>
                    <input
                      required
                      value={draft.title}
                      onChange={(e) =>
                        setDraft({ ...draft, title: e.target.value })
                      }
                      placeholder="Ex: Fone de Ouvido Bluetooth Sem Fio..."
                      className={inputCls}
                    />
                  </Field>

                  <Field label="Link de Afiliado Shopee" full>
                    <input
                      required
                      type="url"
                      value={draft.shopee_url}
                      onChange={(e) =>
                        setDraft({ ...draft, shopee_url: e.target.value })
                      }
                      placeholder="https://s.shopee.com.br/... ou link da Shopee"
                      className={inputCls}
                    />
                  </Field>

                  <Field label="URL da Imagem">
                    <div className="flex items-center gap-2">
                      {draft.image_url && (
                        <img
                          src={draft.image_url}
                          alt="Prévia"
                          className="h-10 w-10 shrink-0 rounded-md border border-border object-cover bg-secondary"
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
                    <div className="space-y-1.5">
                      <div className="flex gap-1.5">
                        <div className="relative flex-1">
                          <input
                            list="product-form-categories-list"
                            value={draft.category ?? ""}
                            onChange={(e) =>
                              setDraft({ ...draft, category: e.target.value })
                            }
                            placeholder="Selecione ou digite uma categoria..."
                            className={inputCls}
                          />
                          <datalist id="product-form-categories-list">
                            {allCategories.map((c) => (
                              <option key={c} value={c} />
                            ))}
                          </datalist>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowCategoriesModal(true)}
                          title="Gerenciar Categorias"
                          className="shrink-0"
                        >
                          <Layers className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Quick category badges */}
                      <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                        {allCategories.slice(0, 8).map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setDraft({ ...draft, category: c })}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition border ${
                              draft.category === c
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-secondary/60 text-muted-foreground border-border hover:bg-secondary hover:text-foreground"
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  </Field>

                  <Field label="Preço Promocional (R$)">
                    <input
                      type="number"
                      step="0.01"
                      value={draft.price ?? ""}
                      onChange={(e) => {
                        const priceVal = e.target.value ? Number(e.target.value) : null;
                        let disc = draft.discount_pct;
                        if (priceVal != null && draft.original_price && draft.original_price > priceVal) {
                          disc = Math.round(((draft.original_price - priceVal) / draft.original_price) * 100);
                        }
                        setDraft({
                          ...draft,
                          price: priceVal,
                          discount_pct: disc,
                        });
                      }}
                      placeholder="Ex: 89.90"
                      className={inputCls}
                    />
                  </Field>

                  <Field label="Preço Original (R$)">
                    <input
                      type="number"
                      step="0.01"
                      value={draft.original_price ?? ""}
                      onChange={(e) => {
                        const origVal = e.target.value ? Number(e.target.value) : null;
                        let disc = draft.discount_pct;
                        if (origVal != null && draft.price && origVal > draft.price) {
                          disc = Math.round(((origVal - draft.price) / origVal) * 100);
                        }
                        setDraft({
                          ...draft,
                          original_price: origVal,
                          discount_pct: disc,
                        });
                      }}
                      placeholder="Ex: 199.90"
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
                      placeholder="Ex: 45"
                      className={inputCls}
                    />
                  </Field>

                  <Field label="Avaliação (0 a 5 ⭐)">
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
                      placeholder="Ex: 4.8"
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
                      placeholder="Ex: 1250"
                      className={inputCls}
                    />
                  </Field>

                  <Field label="Descrição / Destaques" full>
                    <textarea
                      rows={3}
                      value={draft.description ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, description: e.target.value })
                      }
                      placeholder="Principais benefícios e informações do produto..."
                      className={inputCls}
                    />
                  </Field>

                  <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={!!draft.featured}
                      onChange={(e) =>
                        setDraft({ ...draft, featured: e.target.checked })
                      }
                      className="h-4 w-4 accent-[var(--primary)] rounded cursor-pointer"
                    />
                    <span className="font-medium">Destacar no Topo da vitrine</span>
                  </label>

                  <DialogFooter className="flex gap-2 sm:col-span-2 pt-3 border-t border-border">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={resetForm}
                      disabled={saving}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={saving}
                      className="shopee-gradient text-primary-foreground font-semibold"
                    >
                      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {editingId ? "Salvar alterações" : "Adicionar produto"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            {/* Category Manager Overlay Modal Dialog */}
            <Dialog open={showCategoriesModal} onOpenChange={setShowCategoriesModal}>
              <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto p-6">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
                    <Layers className="h-5 w-5 text-primary" />
                    Gerenciar Categorias
                  </DialogTitle>
                  <DialogDescription>
                    Crie novas categorias, altere nomes existentes ou remova categorias. As alterações são refletidas instantaneamente nos produtos.
                  </DialogDescription>
                </DialogHeader>

                {/* Form to create new category */}
                <form onSubmit={handleAddCategory} className="flex gap-2 pt-2">
                  <input
                    type="text"
                    value={newCategoryInput}
                    onChange={(e) => setNewCategoryInput(e.target.value)}
                    placeholder="Nova categoria (ex: Casa & Decoração)..."
                    className={inputCls}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!newCategoryInput.trim()}
                    className="shopee-gradient text-primary-foreground shrink-0"
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Criar Categoria
                  </Button>
                </form>

                {/* Category List */}
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between pb-1 text-xs font-semibold text-muted-foreground border-b border-border">
                    <span>Categoria ({allCategories.length})</span>
                    <span>Ações</span>
                  </div>

                  {allCategories.length === 0 ? (
                    <p className="text-center py-6 text-xs text-muted-foreground">
                      Nenhuma categoria disponível.
                    </p>
                  ) : (
                    allCategories.map((cat) => {
                      const count = categoryCounts[cat] || 0;
                      const isEditingThis = editingCategoryOldName === cat;

                      return (
                        <div
                          key={cat}
                          className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/80 bg-card hover:border-primary/40 transition"
                        >
                          {isEditingThis ? (
                            <div className="flex flex-1 items-center gap-1.5">
                              <input
                                type="text"
                                value={editingCategoryNewName}
                                onChange={(e) =>
                                  setEditingCategoryNewName(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleRenameCategory(cat);
                                  } else if (e.key === "Escape") {
                                    setEditingCategoryOldName(null);
                                  }
                                }}
                                autoFocus
                                className={inputCls + " py-1 h-8 text-xs"}
                              />
                              <Button
                                type="button"
                                size="sm"
                                disabled={savingCategory || !editingCategoryNewName.trim()}
                                onClick={() => handleRenameCategory(cat)}
                                className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                                title="Salvar novo nome"
                              >
                                {savingCategory ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={savingCategory}
                                onClick={() => setEditingCategoryOldName(null)}
                                className="h-8 px-2"
                                title="Cancelar edição"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 min-w-0">
                                <Tag className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span className="text-sm font-medium text-foreground truncate">
                                  {cat}
                                </span>
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                                  {count} {count === 1 ? "produto" : "produtos"}
                                </Badge>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditingCategoryOldName(cat);
                                    setEditingCategoryNewName(cat);
                                  }}
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                  title="Alterar / Renomear categoria"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={savingCategory}
                                  onClick={() => handleDeleteCategory(cat)}
                                  className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                                  title="Excluir categoria"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <DialogFooter className="mt-4 pt-2 border-t border-border flex items-center justify-between gap-2 sm:justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleResetDefaultCategories}
                    className="text-xs text-muted-foreground hover:text-foreground"
                    title="Restaurar lista inicial de categorias padrão"
                  >
                    Restaurar Padrões
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCategoriesModal(false)}
                  >
                    Fechar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Vitrine Filters: Search & Category Pills */}
            <div className="mb-5 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1 max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={vitrineSearch}
                    onChange={(e) => setVitrineSearch(e.target.value)}
                    placeholder="Filtrar por nome, categoria ou descrição..."
                    className="w-full rounded-lg border border-input bg-card py-2 pl-9 pr-8 text-sm text-foreground outline-none ring-ring transition focus:border-primary focus:ring-2 focus:ring-primary/30"
                  />
                  {vitrineSearch && (
                    <button
                      type="button"
                      onClick={() => setVitrineSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Exibindo {filteredVitrineProducts.length} de {products.length} produtos
                  </span>
                </div>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setVitrineCategoryFilter(null)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    vitrineCategoryFilter === null
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-secondary/70 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  Todos ({products.length})
                </button>
                {allCategories.map((cat) => {
                  const count = categoryCounts[cat] || 0;
                  if (count === 0 && vitrineCategoryFilter !== cat) return null;
                  const isSelected = vitrineCategoryFilter === cat;

                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setVitrineCategoryFilter(isSelected ? null : cat)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition flex items-center gap-1.5 ${
                        isSelected
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-secondary/70 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }`}
                    >
                      <span>{cat}</span>
                      <span
                        className={`text-[10px] px-1 rounded-full ${
                          isSelected
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

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
              ) : filteredVitrineProducts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center">
                  <Search className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
                  <p className="font-semibold text-foreground text-sm">
                    Nenhum produto encontrado com os filtros atuais
                  </p>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Tente buscar por outro termo ou limpar o filtro de categoria.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setVitrineSearch("");
                      setVitrineCategoryFilter(null);
                    }}
                  >
                    Limpar Filtros
                  </Button>
                </div>
              ) : (
                filteredVitrineProducts.map((p) => (
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
                        title="Editar produto"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => remove(p.id)}
                        title="Remover produto"
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
                  {["Todos", ...allCategories].map((cat) => (
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
