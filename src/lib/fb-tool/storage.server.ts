// kv_store wrapper (JSON blobs keyed by name) — server-only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function kvGet<T = unknown>(key: string, fallback: T): Promise<T> {
  const { data, error } = await supabaseAdmin
    .from("kv_store")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  if (!data) return fallback;
  return (data.value as T) ?? fallback;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const { error } = await supabaseAdmin
    .from("kv_store")
    .upsert({ key, value: value as never, updated_at: new Date().toISOString() });
  if (error) throw error;
}
