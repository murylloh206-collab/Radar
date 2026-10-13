import "server-only";

import { searchProducts, type MLProduct } from "./mercadolivre";
import { getMockProducts } from "./mock-products";

/**
 * ADAPTADOR E DESCOBERTA POR CATEGORIAS PRIORITÁRIAS
 * --------------------------------------------------
 * Radar de Ofertas | Achados que valem a pena
 */

export interface PriorityCategory {
  id: string;
  name: string;
  mlCategoryId: string;
  fallbackQuery: string;
}

/** Blacklist de itens irrelevantes que não têm apelo para grupos de ofertas de achados */
export const JUNK_KEYWORDS = [
  "almofada",
  "capa de almofada",
  "capa para almofada",
  "botons para calçados",
  "pins para",
  "pin para",
  "pingente crocs",
  "pano de prato",
  "pano de chão",
  "pano microfibra",
  "chaveiro",
  "adesivo",
  "etiqueta",
  "capa de botijão",
  "palmilha",
  "cadarço",
  "flanela",
  "presilha",
  "grampo",
  "esponja",
];

export const PRIORITY_CATEGORIES: PriorityCategory[] = [
  {
    id: "tecnologia",
    name: "Tecnologia e Eletrônicos",
    mlCategoryId: "MLB1000",
    fallbackQuery: "fone bluetooth xiaomi jbl",
  },
  {
    id: "celulares-informatica",
    name: "Celulares, Acessórios e Informática",
    mlCategoryId: "MLB1051",
    fallbackQuery: "ssd nvme kingston logitech",
  },
  {
    id: "games",
    name: "Games",
    mlCategoryId: "MLB1144",
    fallbackQuery: "controle ps5 xbox headset gamer",
  },
  {
    id: "casa-cozinha",
    name: "Casa e Cozinha",
    mlCategoryId: "MLB1574",
    fallbackQuery: "air fryer mondial cafeteira",
  },
  {
    id: "ferramentas",
    name: "Ferramentas",
    mlCategoryId: "MLB1500",
    fallbackQuery: "parafusadeira furadeira eletrica",
  },
  {
    id: "beleza",
    name: "Beleza e Cuidados Pessoais",
    mlCategoryId: "MLB1246",
    fallbackQuery: "escova secadora taiff barbeador",
  },
  {
    id: "moda-utilidades",
    name: "Moda e Itens Úteis do Dia a Dia",
    mlCategoryId: "MLB1430",
    fallbackQuery: "mochila antifurto garrafa termica",
  },
];

export interface CategoryDiscoveryResult {
  category: PriorityCategory;
  products: MLProduct[];
  error?: string;
}

/** Valida se um produto tem apelo real e atratividade para afiliados */
export function isAttractiveOffer(product: MLProduct): boolean {
  // Preço mínimo configurado: no mínimo R$ 24,99
  if (product.price < 24.99) return false;

  const titleLower = product.title.toLowerCase();
  for (const junk of JUNK_KEYWORDS) {
    if (titleLower.includes(junk)) return false;
  }

  return true;
}

export async function discoverCategoryOffers(
  categoryIds?: string[],
  limitPerCategory = 8,
): Promise<CategoryDiscoveryResult[]> {
  const targets = categoryIds && categoryIds.length > 0
    ? PRIORITY_CATEGORIES.filter((c) => categoryIds.includes(c.id))
    : PRIORITY_CATEGORIES;

  const results: CategoryDiscoveryResult[] = [];

  for (const cat of targets) {
    try {
      const rawProducts = await searchProducts(cat.fallbackQuery, limitPerCategory, cat.mlCategoryId);
      const filtered = rawProducts.filter(isAttractiveOffer);
      results.push({ category: cat, products: filtered });
    } catch (err) {
      console.warn(`[discovery] Erro ao buscar categoria ${cat.name}:`, err);
      try {
        const rawProducts = await searchProducts(cat.fallbackQuery, limitPerCategory);
        const filtered = rawProducts.filter(isAttractiveOffer);
        results.push({ category: cat, products: filtered });
      } catch (fallbackErr) {
        console.warn(`[discovery] Usando produtos inteligentes de catálogo para ${cat.name}:`, fallbackErr);
        const fallbackProducts = getMockProducts(cat.fallbackQuery).filter(isAttractiveOffer);
        results.push({
          category: cat,
          products: fallbackProducts,
        });
      }
    }
  }

  return results;
}
