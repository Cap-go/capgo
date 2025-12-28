ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS allow_device boolean NOT NULL DEFAULT true;

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS allow_prod boolean NOT NULL DEFAULT true;
