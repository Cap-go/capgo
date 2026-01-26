-- Add electron platform support

-- 1. Add 'electron' to platform_os enum
ALTER TYPE public.platform_os ADD VALUE IF NOT EXISTS 'electron';

-- 2. Add 'disablePlatformElectron' to stats_action enum
ALTER TYPE public.stats_action ADD VALUE IF NOT EXISTS 'disablePlatformElectron';

-- 3. Add electron boolean column to channels table
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS electron boolean DEFAULT true NOT NULL;
