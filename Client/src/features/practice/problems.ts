export type Difficulty = 'Easy' | 'Medium' | 'Hard'

export interface SampleProblem {
  id: string
  serialNo: number
  title: string
  topic: string
  difficulty: Difficulty
  acceptance: number
}

// Problem catalog with assigned serial numbers
export const sampleProblems: SampleProblem[] = [
  { id: 'two-sum', serialNo: 1, title: 'Two Sum', topic: 'Hash Map', difficulty: 'Easy', acceptance: 52 },
  { id: 'valid-parentheses', serialNo: 2, title: 'Valid Parentheses', topic: 'Stack', difficulty: 'Easy', acceptance: 41 },
  { id: 'lru-cache', serialNo: 3, title: 'LRU Cache', topic: 'Design', difficulty: 'Medium', acceptance: 40 },
  { id: 'number-of-islands', serialNo: 4, title: 'Number of Islands', topic: 'Graph', difficulty: 'Medium', acceptance: 57 },
  { id: 'merge-k-lists', serialNo: 5, title: 'Merge k Sorted Lists', topic: 'Heap', difficulty: 'Hard', acceptance: 50 },
  { id: 'edit-distance', serialNo: 6, title: 'Edit Distance', topic: 'Dynamic Programming', difficulty: 'Hard', acceptance: 58 },
  { id: 'best-time-to-buy-and-sell-stock', serialNo: 7, title: 'Best Time to Buy and Sell Stock', topic: 'Array', difficulty: 'Easy', acceptance: 54 },
  { id: 'longest-substring-without-repeating-characters', serialNo: 8, title: 'Longest Substring Without Repeating Characters', topic: 'Sliding Window', difficulty: 'Medium', acceptance: 34 },
  { id: 'binary-tree-maximum-path-sum', serialNo: 9, title: 'Binary Tree Maximum Path Sum', topic: 'Tree', difficulty: 'Hard', acceptance: 39 },
  { id: 'trapping-rain-water', serialNo: 10, title: 'Trapping Rain Water', topic: 'Two Pointers', difficulty: 'Hard', acceptance: 60 },
]
