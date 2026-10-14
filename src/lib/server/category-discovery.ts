import "server-only";

import { searchProducts, type MLProduct } from "./mercadolivre";
import { getMockProducts } from "./mock-products";
import { isBlockedProductOrCategory } from "./offer-scoring-engine";

/**
 * ADAPTADOR E DESCOBERTA POR CATEGORIAS PRIORITÁRIAS
 * --------------------------------------------------
 * Radar de Ofertas | Achados que valem a pena
 * Foco em Moda, Tênis, Fitness, Suplementos/Creatina, Perfumes e Lifestyle
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
    id: "tenis",
    name: "Tênis e Calçados Esportivos",
    mlCategoryId: "MLB1088",
    fallbackQuery: "tenis nike adidas puma kappa corrida",
  },
  {
    id: "moda-fitness",
    name: "Moda Fitness e Academia",
    mlCategoryId: "MLB1430",
    fallbackQuery: "camiseta esportiva conjunto fitness bermuda legging",
  },
  {
    id: "suplementos",
    name: "Creatina e Suplementos",
    mlCategoryId: "MLB1271",
    fallbackQuery: "creatina monohidratada whey protein integralmedica max titanium",
  },
  {
    id: "perfumes",
    name: "Perfumes e Perfumaria Árabe",
    mlCategoryId: "MLB1276",
    fallbackQuery: "perfume arabe lattafa armaf importado masculino feminino",
  },
  {
    id: "roupas",
    name: "Roupas Masculinas e Femininas",
    mlCategoryId: "MLB1430",
    fallbackQuery: "camiseta algodao moletom calca jaqueta corta vento",
  },
  {
    id: "lifestyle-esporte",
    name: "Esporte, Beleza e Lifestyle",
    mlCategoryId: "MLB1246",
    fallbackQuery: "garrafa termica mochila esportiva smartwatch fone corrida",
  },
];

export interface CategoryDiscoveryResult {
  category: PriorityCategory;
  products: MLProduct[];
  error?: string;
}

/** Valida se um produto tem apelo real e atratividade para afiliados */
export function isAttractiveOffer(product: MLProduct): boolean {
  // 1. Preço mínimo configurado: no mínimo R$ 24,99
  if (product.price < 24.99) return false;

  // 2. Bloqueio estrito de livros, receitas, cursos e produtos digitais
  const blockedCheck = isBlockedProductOrCategory(product.title, product.categoryId, product.categoryName);
  if (blockedCheck.blocked) {
    return false;
  }

  // 3. Blacklist de miudezas e itens de baixo apelo
  const titleLower = product.title.toLowerCase();
  for (const junk of JUNK_KEYWORDS) {
    if (titleLower.includes(junk)) return false;
  }

  return true;
}

export async function discoverCategoryOffers(
  categoryIds?: string[],
  limitPerCategory = 8
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
