import { BrowserRouter, Route, Routes } from 'react-router'
import { GuestOnly, RequireAuth, RequireRole } from './components/auth/RouteGuards'
import { AppLayout } from './components/layout/AppLayout'
import { ToastProvider } from './components/ui/Toast'
import ContestArenaPage from './pages/ContestArenaPage'
import ContestLeaderboardPage from './pages/ContestLeaderboardPage'
import ContestsPage from './pages/ContestsPage'
import InterviewPage from './pages/InterviewPage'
import InterviewRoomPage from './pages/InterviewRoomPage'
import InterviewSummaryPage from './pages/InterviewSummaryPage'
import InterviewHistoryPage from './pages/InterviewHistoryPage'
import DashboardPage from './pages/DashboardPage'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import PracticePage from './pages/PracticePage'
import ProblemWorkspacePage from './pages/ProblemWorkspacePage'
import SignupPage from './pages/SignupPage'
import AdminLayout from './pages/admin/AdminLayout'
import AdminOverviewPage from './pages/admin/AdminOverviewPage'
import AdminProblemsPage from './pages/admin/AdminProblemsPage'
import AdminContestsPage from './pages/admin/AdminContestsPage'
import AdminContestLivePage from './pages/admin/AdminContestLivePage'
import AdminUsersPage from './pages/admin/AdminUsersPage'

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
            <Route path="/contests" element={<ContestsPage />} />
            <Route path="/contests/:id/leaderboard" element={<ContestLeaderboardPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/contests/:id" element={<ContestArenaPage />} />
              <Route path="/practice" element={<PracticePage />} />
              <Route path="/problems" element={<PracticePage />} />
              <Route path="/problems/:id" element={<ProblemWorkspacePage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/interview" element={<InterviewPage />} />
              <Route path="/interview/:id" element={<InterviewRoomPage />} />
              <Route path="/interview/:id/summary" element={<InterviewSummaryPage />} />
              <Route path="/interviews" element={<InterviewHistoryPage />} />

              {/* Admin & SuperAdmin Suite */}
              <Route element={<RequireRole roles={['admin', 'superadmin']} />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminOverviewPage />} />
                  <Route path="problems" element={<AdminProblemsPage />} />
                  <Route path="contests" element={<AdminContestsPage />} />
                  <Route path="contests/:id/live" element={<AdminContestLivePage />} />
                  <Route path="users" element={<AdminUsersPage />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
