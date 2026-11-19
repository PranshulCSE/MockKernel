import { client } from './client'

export interface UserStats {
  solvedProblems: number
  attemptedProblems: number
  totalSubmissions: number
  acceptedSubmissions: number
  contestsJoined: number
  interviewsStarted: number
  interviewsCompleted: number
  interviewsInProgress: number
  interviewsAbandoned: number
  averageInterviewScore: number | null
}

export async function getMyStats(): Promise<UserStats> {
  const response = await client.get<{ data: UserStats }>('/api/users/me/stats')
  return response.data
}
