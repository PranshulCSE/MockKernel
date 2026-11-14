import { Outlet, useLocation } from 'react-router'
import { Background } from './Background'
import { Navbar } from './Navbar'
import { Footer } from './Footer'

export function AppLayout() {
  const location = useLocation()

  // Full-screen IDE workspaces that manage their own fixed layout without page footer
  const isWorkspace =
    location.pathname.startsWith('/problems/') ||
    (location.pathname.startsWith('/contests/') && !location.pathname.includes('/leaderboard'))

  if (isWorkspace) {
    return (
      <div className="flex flex-col min-h-screen bg-base">
        <Navbar />
        <main className="flex-1 relative overflow-hidden">
          <Outlet />
        </main>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-base">
      <Background />
      <Navbar />
      <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pb-20 pt-6 sm:pt-10 flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
