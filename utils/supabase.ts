
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://brgmdozyasjreofznlkf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyZ21kb3p5YXNqcmVvZnpubGtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NTg2MzgsImV4cCI6MjA4NTMzNDYzOH0.Jo3xb-qD7d9nqeptMKCzVh86mUv-rkGtegOIpGb5LIw";

console.log('Supabase: Initializing client with URL:', SUPABASE_URL);

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

console.log('Supabase: Client initialized successfully');
