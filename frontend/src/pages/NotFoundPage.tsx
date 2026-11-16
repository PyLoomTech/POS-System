import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-5xl font-bold text-ink-3">404</p>
      <h1 className="text-lg font-semibold text-ink">Page not found</h1>
      <p className="max-w-sm text-sm text-ink-2">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link to="/" className="mt-2">
        <Button>Back to Dashboard</Button>
      </Link>
    </div>
  )
}
