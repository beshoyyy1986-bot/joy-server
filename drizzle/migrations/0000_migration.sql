CREATE TABLE public.kv_store (key text PRIMARY KEY, value jsonb NOT NULL DEFAULT '[]'::jsonb, updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.kv_store TO service_role;
ALTER TABLE public.kv_store ENABLE ROW LEVEL SECURITY;
INSERT INTO public.kv_store (key, value) VALUES ('api_keys','[]'),('server_proxies','[]');