import { BrowserRouter, Route, Routes } from 'react-router'
import { GuestOnly, RequireAuth } from './components/auth/RouteGuards'
import { AppLayout } from './components/layout/AppLayout'
import InterviewPage from './pages/InterviewPage'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import PracticePage from './pages/PracticePage'
import SignupPage from './pages/SignupPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
        </Route>
        <Route element={<AppLayout />}>
          <Route index element={<LandingPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/practice" element={<PracticePage />} />
            <Route path="/interview" element={<InterviewPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
