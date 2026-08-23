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

export type ShopeeProductOffer = {
  itemId: string;
  productName: string;
  imageUrl: string;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  discount_pct?: number | null;
  offerLink?: string | null;
  ratingStar?: number | null;
  sales?: number | null;
  shopName?: string | null;
  commissionRate?: number | null;
};

const SHOPEE_ENDPOINTS = [
  "https://open-api.affiliate.shopee.com.br/graphql",
  "https://open-api.affiliate.shopee.com/graphql",
];

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
 * Extract slug name, shopId, and itemId from Shopee product URL
 */
export function extractShopeeParams(url: string): {
  slug: string | null;
  shopId: string | null;
  itemId: string | null;
} {
  try {
    const u = new URL(url);
    const pathname = u.pathname;

    // Format 1: /slug-name-i.123456.789012
    const m1 = pathname.match(/\/([^/]+)-i\.(\d+)\.(\d+)/);
    if (m1 && m1[1] && m1[2] && m1[3]) {
      const slug = decodeURIComponent(m1[1]).replace(/-/g, " ").trim();
      return {
        slug: slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : null,
        shopId: m1[2],
        itemId: m1[3],
      };
    }

    // Format 2: /product/123456/789012
    const m2 = pathname.match(/\/product\/(\d+)\/(\d+)/);
    if (m2 && m2[1] && m2[2]) {
      return { slug: null, shopId: m2[1], itemId: m2[2] };
    }

    // Format 3: -i.123456.789012 without leading slug
    const m3 = pathname.match(/-i\.(\d+)\.(\d+)/);
    if (m3 && m3[1] && m3[2]) {
      return { slug: null, shopId: m3[1], itemId: m3[2] };
    }
  } catch {}
  return { slug: null, shopId: null, itemId: null };
}

function mapOfferNode(match: any): ShopeeProductOffer {
  const priceVal = parseFloat(
    match.price || match.priceMin || match.priceMax || 0,
  );
  const pMax = match.priceMax ? parseFloat(match.priceMax) : null;
  const pMin = match.priceMin ? parseFloat(match.priceMin) : null;
  let discount_pct: number | null = null;
  if (pMax && priceVal && pMax > priceVal) {
    discount_pct = Math.round(((pMax - priceVal) / pMax) * 100);
  }
  return {
    itemId: String(match.itemId),
    productName: match.productName,
    imageUrl: match.imageUrl,
    price: priceVal > 0 ? priceVal : null,
    priceMin: pMin,
    priceMax: pMax,
    discount_pct,
    offerLink: match.offerLink || null,
    ratingStar: match.ratingStar ? parseFloat(match.ratingStar) : null,
    sales: match.sales ? parseInt(match.sales, 10) : null,
    shopName: match.shopName || null,
    commissionRate: match.commissionRate ? parseFloat(match.commissionRate) : null,
  };
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
 * Executes a GraphQL call with Shopee SHA256 Authorization header
 */
async function callShopeeGraphQL(
  endpoint: string,
  payloadObj: object,
  appId: string,
  secret: string,
): Promise<{ data?: any; errors?: Array<{ message: string }>; rawText?: string; ok: boolean }> {
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

    const rawText = await response.text();
    let json: any = null;
    try {
      json = JSON.parse(rawText);
    } catch {
      return { ok: false, rawText };
    }

    if (json?.data) {
      return { ok: true, data: json.data, errors: json.errors };
    }

    if (json?.errors) {
      return { ok: false, errors: json.errors, rawText };
    }

    return { ok: response.ok, rawText };
  } catch (err) {
    return {
      ok: false,
      errors: [{ message: err instanceof Error ? err.message : String(err) }],
    };
  }
}

/**
 * Test Shopee API credentials by querying productOfferV2(limit: 1)
 */
export async function testShopeeApiCredentials(
  appId: string,
  secret: string,
): Promise<{ ok: boolean; message: string }> {
  const cleanAppId = appId.trim();
  const cleanSecret = secret.trim();

  if (!cleanAppId || !cleanSecret) {
    return { ok: false, message: "App ID e Chave Secreta são obrigatórios." };
  }

  const payload = {
    query: `query TestQuery {
  productOfferV2(page: 1, limit: 1) {
    pageInfo {
      page
      limit
    }
  }
}`,
  };

  let lastError = "";

  for (const endpoint of SHOPEE_ENDPOINTS) {
    const res = await callShopeeGraphQL(endpoint, payload, cleanAppId, cleanSecret);
    if (res.ok && res.data?.productOfferV2) {
      return {
        ok: true,
        message: "Conexão com a API Oficial da Shopee validada com sucesso!",
      };
    }
    if (res.errors && res.errors.length > 0) {
      lastError = res.errors.map((e) => e.message).join(", ");
    } else if (res.rawText) {
      lastError = res.rawText.slice(0, 150);
    }
  }

  return {
    ok: false,
    message: lastError || "Falha ao autenticar na API Shopee. Verifique se o App ID e a Chave Secreta estão corretos.",
  };
}

/**
 * Generate official Shopee affiliate short link using generateShortLink mutation
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

  const resolvedUrl = await resolveShopeeUrl(cleanUrl);
  const urlsToTry = Array.from(new Set([cleanUrl, resolvedUrl]));

  let lastError = "";

  for (const targetUrl of urlsToTry) {
    const payloads = [
      {
        query: `mutation GenerateLink($originUrl: String!, $subIds: [String!]) {
  generateShortLink(input: { originUrl: $originUrl, subIds: $subIds }) {
    shortLink
  }
}`,
        variables: { originUrl: targetUrl, subIds: ["loja"] },
      },
      {
        query: `mutation GenerateLink($originUrl: String!) {
  generateShortLink(input: { originUrl: $originUrl }) {
    shortLink
  }
}`,
        variables: { originUrl: targetUrl },
      },
    ];

    for (const endpoint of SHOPEE_ENDPOINTS) {
      for (const p of payloads) {
        const res = await callShopeeGraphQL(endpoint, p, cleanAppId, cleanSecret);
        if (res.ok && res.data?.generateShortLink?.shortLink) {
          return { shortLink: res.data.generateShortLink.shortLink };
        }
        if (res.errors && res.errors.length > 0) {
          lastError = res.errors.map((e) => e.message).join(", ");
        }
      }
    }
  }

  return {
    shortLink: null,
    error: lastError || "Não foi possível gerar o link de afiliado oficial.",
  };
}

/**
 * Query Shopee Affiliate Open API productOfferV2 for official product info
 */
export async function fetchShopeeProductOffer({
  itemId,
  keyword,
  appId,
  secret,
}: {
  itemId?: string | null;
  keyword?: string | null;
  appId: string;
  secret: string;
}): Promise<ShopeeProductOffer | null> {
  const cleanAppId = appId.trim();
  const cleanSecret = secret.trim();

  if (!cleanAppId || !cleanSecret) return null;

  // 1) Exact lookup by itemId (most reliable when the link has the item id)
  if (itemId && /^\d+$/.test(String(itemId))) {
    const idPayload = {
      query: `query ItemOffer($itemId: Int64) {
  productOfferV2(itemId: $itemId, page: 1, limit: 1) {
    nodes {
      itemId
      productName
      productLink
      offerLink
      imageUrl
      priceMin
      priceMax
      price
      commissionRate
      ratingStar
      sales
      shopName
    }
  }
}`,
      variables: { itemId: Number(itemId) },
    };

    for (const endpoint of SHOPEE_ENDPOINTS) {
      const res = await callShopeeGraphQL(endpoint, idPayload, cleanAppId, cleanSecret);
      const node = res.data?.productOfferV2?.nodes?.[0];
      if (res.ok && node) return mapOfferNode(node);
    }
  }

  // 2) Keyword search fallback
  const searchTerms: string[] = [];
  if (keyword) {
    const cleaned = keyword.replace(/[^\w\s\u00C0-\u00FF]/gi, " ").trim();
    if (cleaned) {
      searchTerms.push(cleaned);
      // Also try first 4 main words
      const words = cleaned.split(/\s+/).slice(0, 4).join(" ");
      if (words && words !== cleaned) searchTerms.push(words);
    }
  }


  for (const term of searchTerms) {
    const payload = {
      query: `query SearchProductOffer($keyword: String, $page: Int, $limit: Int) {
  productOfferV2(keyword: $keyword, page: $page, limit: $limit) {
    nodes {
      itemId
      productName
      productLink
      offerLink
      imageUrl
      priceMin
      priceMax
      price
      commissionRate
      ratingStar
      sales
      shopName
    }
  }
}`,
      variables: {
        keyword: term,
        page: 1,
        limit: 10,
      },
    };

    for (const endpoint of SHOPEE_ENDPOINTS) {
      const res = await callShopeeGraphQL(endpoint, payload, cleanAppId, cleanSecret);
      if (res.ok && res.data?.productOfferV2?.nodes) {
        const nodes = res.data.productOfferV2.nodes;
        if (Array.isArray(nodes) && nodes.length > 0) {
          // If itemId is given, prefer exact matching node
          let match = itemId
            ? nodes.find((n: any) => String(n.itemId) === String(itemId))
            : null;
          if (!match) match = nodes[0];

          if (match) {
            const priceVal = parseFloat(match.price || match.priceMin || match.priceMax || 0);
            const pMax = match.priceMax ? parseFloat(match.priceMax) : null;
            const pMin = match.priceMin ? parseFloat(match.priceMin) : null;
            let discount_pct: number | null = null;

            if (pMax && priceVal && pMax > priceVal) {
              discount_pct = Math.round(((pMax - priceVal) / pMax) * 100);
            }

            return {
              itemId: String(match.itemId),
              productName: match.productName,
              imageUrl: match.imageUrl,
              price: priceVal > 0 ? priceVal : null,
              priceMin: pMin,
              priceMax: pMax,
              discount_pct,
              offerLink: match.offerLink || null,
              ratingStar: match.ratingStar ? parseFloat(match.ratingStar) : null,
              sales: match.sales ? parseInt(match.sales, 10) : null,
              shopName: match.shopName || null,
              commissionRate: match.commissionRate ? parseFloat(match.commissionRate) : null,
            };
          }
        }
      }
    }
  }

  return null;
}
