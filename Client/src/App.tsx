import { BrowserRouter, Route, Routes } from 'react-router'
import { GuestOnly, RequireAuth } from './components/auth/RouteGuards'
import { AppLayout } from './components/layout/AppLayout'
import ContestArenaPage from './pages/ContestArenaPage'
import ContestLeaderboardPage from './pages/ContestLeaderboardPage'
import ContestsPage from './pages/ContestsPage'
import InterviewPage from './pages/InterviewPage'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import PracticePage from './pages/PracticePage'
import ProblemWorkspacePage from './pages/ProblemWorkspacePage'
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
          <Route path="/contests" element={<ContestsPage />} />
          <Route path="/contests/:id/leaderboard" element={<ContestLeaderboardPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/contests/:id" element={<ContestArenaPage />} />
            <Route path="/practice" element={<PracticePage />} />
            <Route path="/problems" element={<PracticePage />} />
            <Route path="/problems/:id" element={<ProblemWorkspacePage />} />
            <Route path="/interview" element={<InterviewPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
