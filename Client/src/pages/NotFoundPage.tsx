import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <h1 className="text-4xl font-bold">Page not found</h1>
      <p className="text-muted">The page you opened does not exist or was moved.</p>
      <Link to="/" className="rounded-full bg-brand px-6 py-2.5 font-semibold shadow-glow">
        Back to home
      </Link>
    </div>
  )
}
