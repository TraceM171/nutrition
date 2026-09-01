import { z } from 'zod';
import { searchUSDA, fetchFoodDetails, extractNutrients, extractMeasuresUSDA } from '../../../app/src/sources/usdaSource.js';
import { searchOFF, lookupOFFProduct, normalizeOFFNutrients, extractMeasuresOFF, inferCarbBasis } from '../../../app/src/sources/offSource.js';

const usdaKey = () => process.env.USDA_API_KEY || 'DEMO_KEY';

export function registerNutritionTools(server) {
  server.registerTool(
    'search_usda_foods',
    {
      description: 'Search USDA FoodData Central by name. Returns candidate foods with fdcId, description, and dataType — use get_usda_food_detail on a chosen fdcId for full nutrients.',
      inputSchema: z.object({ query: z.string().describe('Food name to search for, e.g. "chicken breast raw"') }),
    },
    async ({ query }) => {
      const data = await searchUSDA(query, usdaKey());
      const foods = (data.foods || []).map(f => ({ fdcId: f.fdcId, description: f.description, dataType: f.dataType, brandName: f.brandName }));
      return { content: [{ type: 'text', text: JSON.stringify({ foods }, null, 2) }] };
    }
  );

  server.registerTool(
    'get_usda_food_detail',
    {
      description: 'Fetch full nutrient data for a USDA fdcId, in the canonical nutrient-key space Nourish uses internally (per 100g / per-serving basis per the food\'s own measures).',
      inputSchema: z.object({ fdcId: z.union([z.string(), z.number()]).describe('fdcId from search_usda_foods') }),
    },
    async ({ fdcId }) => {
      const data = await fetchFoodDetails(fdcId, usdaKey());
      const nutrients = extractNutrients(data);
      const measures = extractMeasuresUSDA(data);
      return { content: [{ type: 'text', text: JSON.stringify({ fdcId: String(fdcId), name: data.description, nutrients, measures }, null, 2) }] };
    }
  );

  server.registerTool(
    'search_off_products',
    {
      description: 'Search Open Food Facts by name — covers branded/packaged foods USDA search often misses.',
      inputSchema: z.object({ query: z.string().describe('Product name to search for') }),
    },
    async ({ query }) => {
      const data = await searchOFF(query);
      const products = (data.products || []).map(p => ({
        code: p.code, name: p.product_name, brands: p.brands,
        nutrients: normalizeOFFNutrients(p),
        measures: extractMeasuresOFF(p),
        carbBasis: inferCarbBasis(p),
      }));
      return { content: [{ type: 'text', text: JSON.stringify({ products }, null, 2) }] };
    }
  );

  server.registerTool(
    'lookup_barcode',
    {
      description: 'Look up a product by its already-decoded barcode number in Open Food Facts. Does not decode barcode images — supply the numeric code directly.',
      inputSchema: z.object({ code: z.string().describe('The barcode digits, e.g. "3017620422003"') }),
    },
    async ({ code }) => {
      const product = await lookupOFFProduct(code);
      if (!product) return { content: [{ type: 'text', text: JSON.stringify({ found: false }) }] };
      const result = {
        found: true,
        code,
        name: product.product_name,
        brands: product.brands,
        nutrients: normalizeOFFNutrients(product),
        measures: extractMeasuresOFF(product),
        carbBasis: inferCarbBasis(product),
      };
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}
