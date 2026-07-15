import { z } from 'zod';

export const symbolSchema = z
  .string()
  .trim()
  .min(1, 'Symbol is required')
  .max(10, 'Symbol is too long')
  .refine(
    (value) => /^[^\s\x00-\x1f;"]+$/.test(value),
    'Symbol contains forbidden characters'
  );

export const commodityDefinitionSchema = z
  .object({
    symbol: symbolSchema,
    note: z.string().trim().max(200, 'Note is too long').default(''),
    aliases: z.array(symbolSchema).max(10).default([]),
    decimalPlaces: z.number().int().min(0).max(8).nullable(),
    nomarket: z.boolean().default(false),
    isDefault: z.boolean().default(false),
  })
  .refine(
    (value) =>
      new Set([value.symbol, ...value.aliases]).size ===
      value.aliases.length + 1,
    { message: 'Aliases must be distinct from each other and the symbol' }
  );

export type CommodityDefinitionInput = z.infer<
  typeof commodityDefinitionSchema
>;

export const updateCommoditySchema = z.union([
  z.object({ symbol: symbolSchema, definition: commodityDefinitionSchema }),
  z.object({ symbol: symbolSchema, raw: z.string().max(2000) }),
]);

export type UpdateCommodityInput = z.infer<typeof updateCommoditySchema>;
