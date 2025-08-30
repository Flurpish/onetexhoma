// Minimal Strapi v5 types (only what we use)
export type StrapiMedia = {
  id: number;
  url: string;
  alternativeText?: string;
  caption?: string;
};

export type StrapiRelation<T> = { data: { id: number; attributes: T } | null };
export type StrapiCollection<T> = { data: Array<{ id: number; attributes: T }> };

export type Business = {
  name: string;
  slug: string;
  isFeatured: boolean;
  products?: StrapiCollection<Product>;
};

export type Category = { name: string; slug: string; type?: string };

export type Product = {
  title: string;
  description?: string;
  image?: { data?: { id: number; attributes: StrapiMedia } | null };
  price?: number;
  currency?: string;
  sourceUrl?: string;
  primaryCategory?: string;
  secondaryCategories?: StrapiCollection<Category>;
  business?: StrapiRelation<Business>;
};
