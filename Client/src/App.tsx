import { BrowserRouter, Route, Routes } from 'react-router'
import { GuestOnly, RequireAuth } from './components/auth/RouteGuards'
import { AppLayout } from './components/layout/AppLayout'
import { ToastProvider } from './components/ui/Toast'
import InterviewPage from './pages/InterviewPage'
import InterviewRoomPage from './pages/InterviewRoomPage'
import InterviewSummaryPage from './pages/InterviewSummaryPage'
import InterviewHistoryPage from './pages/InterviewHistoryPage'
import DashboardPage from './pages/DashboardPage'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import PracticePage from './pages/PracticePage'
import SignupPage from './pages/SignupPage'

export default function App() {
  return (
    <ToastProvider>
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
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/interview" element={<InterviewPage />} />
              <Route path="/interview/:id" element={<InterviewRoomPage />} />
              <Route path="/interview/:id/summary" element={<InterviewSummaryPage />} />
              <Route path="/interviews" element={<InterviewHistoryPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
