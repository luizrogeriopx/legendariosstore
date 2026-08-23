import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

async function sha256Hex(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type ShopeeCredentials = {
  appId: string | null;
  secret: string | null;
};

/**
 * Follow redirects to find the canonical Shopee product URL
 */
export async function resolveShopeeUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });
    return res.url || url;
  } catch {
    return url;
  }
}

/**
 * Get credentials from Supabase affiliate_settings with fallback to process.env
 */
export async function getShopeeCredentials(
  supabase?: SupabaseClient<Database>,
): Promise<ShopeeCredentials> {
  let appId = process.env["SHOPEE_APP_ID"] || null;
  let secret = process.env["SHOPEE_SECRET"] || null;

  if (supabase) {
    try {
      const { data } = await supabase
        .from("affiliate_settings")
        .select("shopee_app_id, shopee_secret")
        .eq("id", "default")
        .maybeSingle();

      if (data?.shopee_app_id) {
        appId = data.shopee_app_id.trim();
      }
      if (data?.shopee_secret) {
        secret = data.shopee_secret.trim();
      }
    } catch {
      // Ignore if table does not exist
    }
  }

  return { appId, secret };
}

/**
 * Calls a single GraphQL mutation on Shopee Affiliate Open API
 */
async function executeShopeeGraphQL(
  endpoint: string,
  payloadObj: object,
  appId: string,
  secret: string,
): Promise<{ shortLink?: string; error?: string }> {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify(payloadObj);
    const factor = `${appId}${timestamp}${payload}${secret}`;
    const signature = await sha256Hex(factor);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`,
      },
      body: payload,
    });

    const text = await response.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      return { error: `HTTP ${response.status}: ${text.slice(0, 100)}` };
    }

    if (json?.data?.generateShortLink?.shortLink) {
      return { shortLink: json.data.generateShortLink.shortLink };
    }

    if (json?.errors && Array.isArray(json.errors) && json.errors.length > 0) {
      const msg = json.errors.map((e: any) => e.message || JSON.stringify(e)).join(", ");
      return { error: msg };
    }

    if (!response.ok) {
      return { error: `HTTP ${response.status}: ${text.slice(0, 100)}` };
    }

    return { error: "Nenhum shortLink retornado pela API da Shopee." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Generate official Shopee affiliate short link using the Shopee Affiliate Open API (GraphQL)
 */
export async function generateShopeeAffiliateLink({
  url,
  appId,
  secret,
}: {
  url: string;
  appId: string;
  secret: string;
}): Promise<{ shortLink: string | null; error?: string }> {
  const cleanAppId = appId.trim();
  const cleanSecret = secret.trim();
  const cleanUrl = url.trim();

  if (!cleanAppId || !cleanSecret) {
    return { shortLink: null, error: "AppID ou Chave Secreta não informados." };
  }

  // Resolve canonical target URL if this is a short redirect link
  const resolvedUrl = await resolveShopeeUrl(cleanUrl);

  const urlsToTry = Array.from(new Set([cleanUrl, resolvedUrl]));
  const endpoints = [
    "https://open-api.affiliate.shopee.com.br/graphql",
    "https://open-api.affiliate.shopee.com/graphql",
  ];

  let lastError = "";

  for (const targetUrl of urlsToTry) {
    const payloadVariants = [
      {
        query: `mutation GenerateLink($originUrl: String!, $subIds: [String!]) {
  generateShortLink(input: { originUrl: $originUrl, subIds: $subIds }) {
    shortLink
  }
}`,
        variables: {
          originUrl: targetUrl,
          subIds: ["loja"],
        },
      },
      {
        query: `mutation GenerateLink($originUrl: String!) {
  generateShortLink(input: { originUrl: $originUrl }) {
    shortLink
  }
}`,
        variables: {
          originUrl: targetUrl,
        },
      },
    ];

    for (const endpoint of endpoints) {
      for (const payloadObj of payloadVariants) {
        const result = await executeShopeeGraphQL(
          endpoint,
          payloadObj,
          cleanAppId,
          cleanSecret,
        );

        if (result.shortLink) {
          return { shortLink: result.shortLink };
        }
        if (result.error) {
          lastError = result.error;
        }
      }
    }
  }

  return {
    shortLink: null,
    error: lastError || "Não foi possível gerar o link de afiliado oficial.",
  };
}
