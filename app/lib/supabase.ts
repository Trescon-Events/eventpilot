import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null
let _supabaseAdmin: SupabaseClient | null = null
let _smartdataAdmin: SupabaseClient | null = null

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabase) {
      _supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
    }
    return (_supabase as unknown as Record<string | symbol, unknown>)[prop]
  },
})

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabaseAdmin) {
      _supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
    }
    return (_supabaseAdmin as unknown as Record<string | symbol, unknown>)[prop]
  },
})

// SmartData Supabase client — uses service_role key if available, falls back to anon key
export const smartdataAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_smartdataAdmin) {
      _smartdataAdmin = createClient(
        process.env.SMARTDATA_URL!,
        process.env.SMARTDATA_SERVICE_ROLE_KEY || process.env.SMARTDATA_ANON_KEY!
      )
    }
    return (_smartdataAdmin as unknown as Record<string | symbol, unknown>)[prop]
  },
})
