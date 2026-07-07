/**
 * Generic API client for VP Access Home backend.
 * Provides typed fetch wrapper with error handling.
 */

const BASE_URL = 'http://localhost:4000/api'

export interface ApiResponse<T> {
  success: boolean
  statusCode: number
  message: string
  data: T
}

/**
 * Performs a GET request to the API.
 * @param path - API path (e.g. "/vp-access-home/total-service/summary")
 * @param params - Optional query parameters
 * @returns Typed response data
 */
export async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value)
      }
    })
  }

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`API Error: ${res.status}`)

  const json: ApiResponse<T> = await res.json()
  if (!json.success) throw new Error(json.message)
  return json.data
}
