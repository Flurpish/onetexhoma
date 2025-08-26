// cms/services/ingestor/src/lib/normalize.ts
export type RawProduct = {
  title?: string;
  description?: string;
  image?: string;
  price?: number | string;
  currency?: string;
  sourceUrl: string;
  businessId: number;
  raw?: any;
};

export type NormalizedProduct = {
  title: string;
  description?: string;
  image?: string;
  price?: number;
  currency?: string;
  sourceUrl: string;
  businessId: number;
  primaryCategory?: string;
  secondaryCategoryNames?: string[];
  raw?: any; // source snapshot / traceability
};

// Light keyword map (editable later)
const SEC_MAP: Record<string, RegExp> = {
  BBQ: /(\bbbq\b|barbecue|smoked|brisket|ribs)/i,
  Tacos: /(\btaco|al\s*pastor|carnitas|asada|barbacoa)/i,
  Sushi: /(maki|nigiri|sashimi|temaki|uramaki|chirashi)/i,
  Asian: /(ramen|pho|lo\s*mein|pad\s*thai|dumpling|bibimbap|teriyaki)/i,
  Ribs: /\bribs?\b/i,
};

export function normalizeProduct(raw: RawProduct): NormalizedProduct {
  const toNumber = (v: unknown) => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const n = Number(v.replace(/[^0-9.]/g, ''));
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  };

  return {
    title: (raw.title || '').trim() || 'Untitled',
    description: raw.description?.trim(),
    image: raw.image,
    price: toNumber(raw.price),
    currency: raw.currency || 'USD',
    sourceUrl: raw.sourceUrl,
    businessId: raw.businessId,
    raw: raw.raw,
  };
}

export function classifyCategories(p: NormalizedProduct) {
  // For now, default to Food. You can expand later via Business metadata.
  const primaryCategory = 'Food';
  const text = `${p.title} ${p.description ?? ''}`;
  const secondaryCategoryNames: string[] = [];
  for (const [name, rx] of Object.entries(SEC_MAP)) {
    if (rx.test(text)) secondaryCategoryNames.push(name);
  }
  return { primaryCategory, secondaryCategoryNames };
}
