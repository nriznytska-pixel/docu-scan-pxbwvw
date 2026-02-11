
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Get backend URL from app.json configuration
const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl;

if (!BACKEND_URL) {
  console.error('[API] ❌ Backend URL not configured in app.json');
} else {
  console.log('[API] ✅ Backend URL configured:', BACKEND_URL);
}

/**
 * Generic API call wrapper with error handling
 */
async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null }> {
  try {
    const url = `${BACKEND_URL}${endpoint}`;
    console.log(`[API] ${options.method || 'GET'} ${url}`);
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    console.log(`[API] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[API] Error response:`, errorText);
      return {
        data: null,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const data = await response.json();
    console.log(`[API] Response data:`, JSON.stringify(data, null, 2));

    return { data, error: null };
  } catch (error: any) {
    console.error(`[API] Exception:`, error);
    return {
      data: null,
      error: error?.message || 'Unknown error occurred',
    };
  }
}

/**
 * Authenticated API call wrapper with Supabase session token
 */
async function authenticatedApiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null }> {
  try {
    // Get the current session token from Supabase
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      console.error('[API] No active session for authenticated request');
      return {
        data: null,
        error: 'Authentication required. Please log in.',
      };
    }

    const url = `${BACKEND_URL}${endpoint}`;
    console.log(`[API] Authenticated ${options.method || 'GET'} ${url}`);
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        ...options.headers,
      },
    });

    console.log(`[API] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[API] Error response:`, errorText);
      
      if (response.status === 401) {
        return {
          data: null,
          error: 'Authentication failed. Please log in again.',
        };
      }
      
      return {
        data: null,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const data = await response.json();
    console.log(`[API] Response data:`, JSON.stringify(data, null, 2));

    return { data, error: null };
  } catch (error: any) {
    console.error(`[API] Exception:`, error);
    return {
      data: null,
      error: error?.message || 'Unknown error occurred',
    };
  }
}

/**
 * GET request helper
 */
export async function apiGet<T>(endpoint: string) {
  return apiCall<T>(endpoint, { method: 'GET' });
}

/**
 * POST request helper
 */
export async function apiPost<T>(endpoint: string, body: any) {
  return apiCall<T>(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * PUT request helper
 */
export async function apiPut<T>(endpoint: string, body: any) {
  return apiCall<T>(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/**
 * DELETE request helper
 */
export async function apiDelete<T>(endpoint: string) {
  return apiCall<T>(endpoint, { method: 'DELETE' });
}

/**
 * Authenticated GET request helper
 */
export async function authenticatedGet<T>(endpoint: string) {
  return authenticatedApiCall<T>(endpoint, { method: 'GET' });
}

/**
 * Authenticated POST request helper
 */
export async function authenticatedPost<T>(endpoint: string, body: any) {
  return authenticatedApiCall<T>(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Authenticated PUT request helper
 */
export async function authenticatedPut<T>(endpoint: string, body: any) {
  return authenticatedApiCall<T>(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/**
 * Authenticated DELETE request helper
 */
export async function authenticatedDelete<T>(endpoint: string) {
  return authenticatedApiCall<T>(endpoint, { method: 'DELETE' });
}

// ============================================
// SCANS API
// ============================================

export interface Scan {
  id: string;
  language: string;
  createdAt: string;
}

/**
 * Create a new scan with the specified language
 */
export async function createScan(language: string = 'uk'): Promise<{ data: Scan | null; error: string | null }> {
  console.log('[API] Creating scan with language:', language);
  return apiPost<Scan>('/scans', { language });
}

/**
 * Get all scans
 */
export async function getAllScans(): Promise<{ data: Scan[] | null; error: string | null }> {
  console.log('[API] Fetching all scans');
  return apiGet<Scan[]>('/scans');
}

/**
 * Get a scan by ID
 */
export async function getScanById(id: string): Promise<{ data: Scan | null; error: string | null }> {
  console.log('[API] Fetching scan by ID:', id);
  return apiGet<Scan>(`/scans/${id}`);
}

// ============================================
// GENERATE RESPONSE API
// ============================================

export interface GenerateResponseRequest {
  analysis: any; // The full letter analysis object
}

export interface GenerateResponseResponse {
  response: string; // The generated Dutch response letter
}

/**
 * Generate a professional response letter in Dutch using AI
 * Public endpoint - no authentication required
 */
export async function generateResponseLetter(
  scanId: string,
  analysis: any
): Promise<{ data: GenerateResponseResponse | null; error: string | null }> {
  console.log('[API] Generating response letter for scan:', scanId);
  console.log('[API] Analysis data:', JSON.stringify(analysis, null, 2));
  
  return apiPost<GenerateResponseResponse>(
    `/api/scans/${scanId}/generate-response`,
    { analysis }
  );
}
