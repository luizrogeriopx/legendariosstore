import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ShoppingBag, Mail, Lock, User as UserIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — ShopPeça" },
      {
        name: "description",
        content: "Acesse o painel de afiliados ShopPeça.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success("Conta criada! Você já pode acessar o painel.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success("Bem-vindo de volta!");
      }
      navigate({ to: "/admin" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na autenticação");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1">
        {/* Left brand panel */}
        <div className="relative hidden w-1/2 overflow-hidden bg-primary lg:block">
          <div className="absolute inset-0 hero-glow opacity-90" aria-hidden />
          <div className="relative flex h-full flex-col justify-between p-12 text-primary-foreground">
            <Link to="/" className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground/20">
                <ShoppingBag className="h-6 w-6" />
              </span>
              <span className="text-xl font-extrabold">ShopPeça</span>
            </Link>
            <div className="space-y-4">
              <h1 className="text-4xl font-extrabold leading-tight">
                Gerencie sua vitrine de afiliados Shopee
              </h1>
              <p className="max-w-sm text-primary-foreground/80">
                Cole um link, e puxamos título, imagem e preço
                automaticamente. Adicione, edite e destaque produtos em segundos.
              </p>
            </div>
            <p className="text-sm text-primary-foreground/60">
              O primeiro cadastro vira administrador automaticamente.
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
          <div className="w-full max-w-sm space-y-6">
            <div className="space-y-1 text-center lg:text-left">
              <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
                {mode === "signup" ? "Criar conta" : "Entrar"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {mode === "signup"
                  ? "Crie sua conta para gerenciar a loja."
                  : "Acesse o painel de administração."}
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  E-mail
                </span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@email.com"
                    className="w-full rounded-lg border border-input bg-card py-2.5 pl-9 pr-3 text-sm text-foreground outline-none ring-ring transition focus:border-primary focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Senha
                </span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="mínimo 6 caracteres"
                    className="w-full rounded-lg border border-input bg-card py-2.5 pl-9 pr-3 text-sm text-foreground outline-none ring-ring transition focus:border-primary focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </label>

              <Button
                type="submit"
                disabled={loading}
                className="w-full shopee-gradient text-primary-foreground"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "signup" ? "Criar conta" : "Entrar"}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              {mode === "signup" ? "Já tem conta?" : "Não tem conta?"}{" "}
              <button
                onClick={() =>
                  setMode(mode === "signup" ? "signin" : "signup")
                }
                className="font-semibold text-primary hover:underline"
              >
                {mode === "signup" ? "Entrar" : "Criar conta"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
