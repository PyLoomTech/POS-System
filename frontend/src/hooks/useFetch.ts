import { useCallback, useEffect, useState } from 'react'
import { api, getErrorMessage } from '@/lib/api'

interface UseFetchResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

export function useFetch<T>(url: string): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<T>(url)
      setData(response.data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, loading, error, reload: () => void reload() }
}
