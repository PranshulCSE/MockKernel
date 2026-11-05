export type Difficulty = 'Easy' | 'Medium' | 'Hard'

export interface SampleProblem {
  id: string
  title: string
  topic: string
  difficulty: Difficulty
  acceptance: number
}

// Mock data. Replaced by GET /api/problems once F2 ships the contract.
export const sampleProblems: SampleProblem[] = [
  { id: 'two-sum', title: 'Two Sum', topic: 'Hash Map', difficulty: 'Easy', acceptance: 52 },
  { id: 'valid-parentheses', title: 'Valid Parentheses', topic: 'Stack', difficulty: 'Easy', acceptance: 41 },
  { id: 'lru-cache', title: 'LRU Cache', topic: 'Design', difficulty: 'Medium', acceptance: 40 },
  { id: 'number-of-islands', title: 'Number of Islands', topic: 'Graph', difficulty: 'Medium', acceptance: 57 },
  { id: 'merge-k-lists', title: 'Merge k Sorted Lists', topic: 'Heap', difficulty: 'Hard', acceptance: 50 },
  { id: 'edit-distance', title: 'Edit Distance', topic: 'Dynamic Programming', difficulty: 'Hard', acceptance: 58 },
]
