// cms/services/ingestor/src/lib/jsonld.ts
import type { CheerioAPI } from 'cheerio';
import type { RawProduct } from './normalize';

function flatten<T>(x: T | T[] | undefined | null): T[] {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

function parseScriptJSON(nodeText: string): any[] {
  try {
    const data = JSON.parse(nodeText);
    return flatten(data);
  } catch {
    return [];
  }
}

export default {
  extractProducts($: CheerioAPI, businessId: number, pageUrl: string): RawProduct[] {
    const scripts = $('script[type="application/ld+json"]')
      .map((_, el) => $(el).contents().text())
      .get();

    const nodes = scripts.flatMap(parseScriptJSON);
    const candidates = nodes.flatMap((n) => {
      // Handle @graph
      if (n && Array.isArray(n['@graph'])) return n['@graph'];
      return [n];
    });

    const isProductLike = (t: any) => {
      const type = (t?.['@type'] && flatten(t['@type']).join(',')) || '';
      return /Product|MenuItem|Offer|OfferCatalog/i.test(type);
    };

    const products: RawProduct[] = [];
    for (const node of candidates) {
      if (!isProductLike(node)) continue;
      const title = node.name || node.title || node.itemOffered?.name || '';
      const desc = node.description || node.itemOffered?.description || '';
      const price = node.offers?.price || node.price || node.itemOffered?.offers?.price;
      const currency = node.offers?.priceCurrency || node.priceCurrency || node.itemOffered?.offers?.priceCurrency;
      const image = Array.isArray(node.image) ? node.image[0] : node.image || node.photo;

      if (title) {
        products.push({
          title,
          description: desc,
          price,
          currency,
          image,
          sourceUrl: pageUrl,
          businessId,
          raw: { jsonld: node },
        });
      }
    }
    return products;
  },
};
