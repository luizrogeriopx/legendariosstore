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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  useServerFn,
  useQuery,
  useQueryClient,
} from "@tanstack/react-start";
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
} from "@/lib/products.functions";
import type { Product, ProductInput } from "@/lib/products.server";

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

function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getCurrentUserFn = useServerFn(getCurrentUser);
  const addProductFn = useServerFn(addProduct);
  const editProductFn = useServerFn(editProduct);
  const removeProductFn = useServerFn(removeProduct);
  const scrapeShopeeFn = useServerFn(scrapeShopee);

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

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductInput>(emptyDraft);
  const [shopeeLink, setShopeeLink] = useState("");
  const [scraping, setScraping] = useState(false);
  const [saving, setSaving] = useState(false);

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

  async function scrape() {
    if (!shopeeLink) return;
    setScraping(true);
    try {
      const meta = await scrapeShopeeFn({ data: { url: shopeeLink } });
      setDraft((d) => ({
        ...d,
        shopee_url: shopeeLink,
        title: meta.title ?? d.title,
        image_url: meta.image ?? d.image_url,
        description: meta.description ?? d.description,
        price: meta.price ?? d.price,
      }));
      toast.success("Dados importados do link!");
      setShowForm(true);
    } catch {
      toast.error("Não consegui ler o link. Preencha manualmente.");
      setDraft((d) => ({ ...d, shopee_url: shopeeLink }));
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
          <div className="flex gap-2">
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

        {/* Paste link box */}
        <Card className="mb-6 border-primary/20 bg-secondary/40 p-4">
          <label className="mb-2 block text-sm font-semibold text-foreground">
            Colar link da Shopee para importar
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={shopeeLink}
                onChange={(e) => setShopeeLink(e.target.value)}
                placeholder="https://shopee.com.br/..."
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
              Importar
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Importamos título, imagem e preço (quando disponível). Revise antes
            de salvar.
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
                <input
                  type="url"
                  value={draft.image_url ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, image_url: e.target.value })
                  }
                  className={inputCls}
                />
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
            <p className="py-10 text-center text-muted-foreground">
              Nenhum produto. Cole um link da Shopee acima para começar.
            </p>
          ) : (
            products.map((p) => (
              <Card
                key={p.id}
                className="flex flex-col gap-3 border-border/70 p-3 sm:flex-row sm:items-center"
              >
                <div className="flex flex-1 items-center gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-secondary">
                    {p.image_url && (
                      <img
                        src={p.image_url}
                        alt={p.title}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-foreground">
                        {p.title}
                      </h3>
                      {p.featured && (
                        <Badge variant="secondary" className="shrink-0">
                          <Star className="mr-1 h-3 w-3 text-primary" /> Top
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {p.category ? `${p.category} · ` : ""}
                      {p.price != null ? formatBRL(p.price) : "sem preço"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <a
                    href={p.shopee_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-primary"
                    title="Abrir na Shopee"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <button
                    onClick={() => startEdit(p)}
                    className="inline-flex items-center rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-primary"
                    title="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => remove(p.id)}
                    className="inline-flex items-center rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            ))
          )}
        </div>
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
