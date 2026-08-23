import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShoppingBag, Shield } from "lucide-react";

export function SiteHeader({ activeCategory }: { activeCategory?: string }) {
  const router = useRouter();
  const [session, setSession] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(!!s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl shopee-gradient text-primary-foreground shadow-sm">
            <ShoppingBag className="h-5 w-5" />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-foreground">
            Legendários <span className="text-primary">Store</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {activeCategory && (
            <span className="hidden rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground sm:inline">
              {activeCategory}
            </span>
          )}
          {session && (
            <Button
              size="sm"
              onClick={() => router.navigate({ to: "/admin" })}
              className="shopee-gradient text-primary-foreground"
            >
              <Shield className="mr-1.5 h-4 w-4" />
              Painel
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
