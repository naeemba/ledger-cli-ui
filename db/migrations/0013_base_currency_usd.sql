-- Custom SQL migration file, put your code below! --

-- Pricing base is now USD (CoinGecko cannot quote USDT). Repoint existing
-- users off USDT so `-X USD` valuation finds the regenerated price rows.
UPDATE "userSetting" SET "baseCurrency" = 'USD' WHERE "baseCurrency" = 'USDT';
