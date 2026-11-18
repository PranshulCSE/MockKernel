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
      <div className="flex min-h-screen flex-col overflow-x-clip bg-base">
        <Navbar />
        <main id="main-content" className="relative flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-base">
      <Background />
      <Navbar />
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-3 pb-16 pt-5 sm:px-6 sm:pb-20 sm:pt-8 lg:px-8 lg:pt-10"
      >
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
