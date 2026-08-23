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
 * Get credentials from Supabase affiliate_settings with fallback to process.env
 */
export async function getShopeeCredentials(
  supabase: SupabaseClient<Database>,
): Promise<ShopeeCredentials> {
  let appId = process.env["SHOPEE_APP_ID"] || null;
  let secret = process.env["SHOPEE_SECRET"] || null;

  try {
    const { data } = await supabase
      .from("affiliate_settings")
      .select("shopee_app_id, shopee_secret")
      .eq("id", "default")
      .maybeSingle();

    if (data?.shopee_app_id) {
      appId = data.shopee_app_id;
    }
    if (data?.shopee_secret) {
      secret = data.shopee_secret;
    }
  } catch (err) {
    console.warn("Could not read affiliate_settings from db, using env if available:", err);
  }

  return { appId, secret };
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
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const query = `mutation GenerateLink($originUrl: String!, $subIds: [String!]) {
  generateShortLink(input: { originUrl: $originUrl, subIds: $subIds }) {
    shortLink
  }
}`;
    const payloadObj = {
      query,
      variables: {
        originUrl: url,
        subIds: ["loja"],
      },
    };
    const payload = JSON.stringify(payloadObj);
    const factor = `${appId}${timestamp}${payload}${secret}`;
    const signature = await sha256Hex(factor);

    const endpoints = [
      "https://open-api.affiliate.shopee.com.br/graphql",
      "https://open-api.affiliate.shopee.com/graphql",
    ];

    let lastError = "";

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`,
          },
          body: payload,
        });

        if (response.ok) {
          const result = (await response.json()) as {
            data?: { generateShortLink?: { shortLink?: string } };
            errors?: Array<{ message: string }>;
          };
          if (result?.data?.generateShortLink?.shortLink) {
            return { shortLink: result.data.generateShortLink.shortLink };
          }
          if (result?.errors && result.errors.length > 0) {
            lastError = result.errors.map((e) => e.message).join(", ");
          }
        } else {
          const errText = await response.text();
          lastError = `HTTP ${response.status}: ${errText}`;
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    return {
      shortLink: null,
      error: lastError || "Não foi possível gerar o link de afiliado oficial.",
    };
  } catch (err) {
    return {
      shortLink: null,
      error: err instanceof Error ? err.message : "Erro desconhecido na API Shopee",
    };
  }
}
