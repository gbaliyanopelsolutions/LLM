-- Migration: Add style_json column to surveys table
-- This adds support for storing form styling/theme data (colors, logo, fonts)

ALTER TABLE public.surveys ADD COLUMN IF NOT EXISTS style_json jsonb DEFAULT NULL;

COMMENT ON COLUMN public.surveys.style_json IS 'Form styling/theme data: backgroundColor, textColor, accentColor, logoUrl (JSONB).';
