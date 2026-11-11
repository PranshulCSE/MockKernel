import { Outlet } from 'react-router'
import { Background } from './Background'
import { Navbar } from './Navbar'

export function AppLayout() {
  return (
    <>
      <Background />
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-6 pb-24 pt-12">
        <Outlet />
      </main>
      <footer className="border-t border-white/10 py-6 text-center text-sm text-muted">
        MockKernel. Practice code, then practice explaining it.
      </footer>
    </>
  )
}
