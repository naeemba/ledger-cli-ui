export type CommodityKind = 'crypto' | 'fiat' | 'manual';

export type CommoditySuggestion = {
  symbol: string;
  kind: CommodityKind;
  providerId: string | null;
  label: string;
  detail: string | null;
};

export type MappingRow = {
  symbol: string;
  kind: string;
  providerId: string | null;
  source: string;
  inUse: boolean;
};

export type UpsertMappingResult = { ok: true } | { ok: false; message: string };
