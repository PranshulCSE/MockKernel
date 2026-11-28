import dotenv from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getJudge0Service } from '../services/judge0.js';
import type { SupportedLanguage } from '../models/Submission.js';

// Verify the same Judge0 endpoint and credentials configured for the Server.
// The Worker environment may intentionally point at a local development runner.
const serverEnvPath = resolve(process.cwd(), '../Server/.env');
if (existsSync(serverEnvPath)) {
  const serverEnv = dotenv.parse(readFileSync(serverEnvPath));
  if (serverEnv.JUDGE0_API_URL) {
    process.env.JUDGE0_API_URL = serverEnv.JUDGE0_API_URL;
    process.env.USE_LOCAL_RUNNER = 'false';
  }
  const apiKey = serverEnv.JUDGE0_API_KEY || serverEnv.JUDGE0_AUTH_TOKEN;
  if (apiKey) process.env.JUDGE0_API_KEY = apiKey;
}

const programs: Array<{ language: SupportedLanguage; sourceCode: string }> = [
  {
    language: 'cpp',
    sourceCode: `#include <iostream>
#include <unordered_map>
#include <vector>
using namespace std;

vector<int> twoSum(const vector<int>& nums, int target) {
  unordered_map<int, int> seen;
  for (int i = 0; i < static_cast<int>(nums.size()); i++) {
    const auto match = seen.find(target - nums[i]);
    if (match != seen.end()) return {match->second, i};
    seen[nums[i]] = i;
  }
  return {};
}

int main() {
  vector<int> values;
  int value;
  while (cin >> value) values.push_back(value);
  if (values.empty()) return 0;
  const int target = values.back();
  values.pop_back();
  const auto result = twoSum(values, target);
  for (size_t i = 0; i < result.size(); i++) {
    if (i) cout << ' ';
    cout << result[i];
  }
  cout << endl;
}
`,
  },
  {
    language: 'python',
    sourceCode: `import sys

def two_sum(nums, target):
    seen = {}
    for index, value in enumerate(nums):
        complement = target - value
        if complement in seen:
            return [seen[complement], index]
        seen[value] = index
    return []

def main():
    data = list(map(int, sys.stdin.read().split()))
    if not data:
        return
    nums, target = data[:-1], data[-1]
    print(*two_sum(nums, target))

if __name__ == '__main__':
    main()
`,
  },
  {
    language: 'java',
    sourceCode: `import java.util.*;

public class Main {
    static int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int complement = target - nums[i];
            if (seen.containsKey(complement)) return new int[] {seen.get(complement), i};
            seen.put(nums[i], i);
        }
        return new int[] {};
    }

    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        List<Integer> values = new ArrayList<>();
        while (scanner.hasNextInt()) values.add(scanner.nextInt());
        if (values.isEmpty()) return;
        int target = values.get(values.size() - 1);
        int[] nums = new int[values.size() - 1];
        for (int i = 0; i < nums.length; i++) nums[i] = values.get(i);
        int[] result = twoSum(nums, target);
        for (int i = 0; i < result.length; i++) {
            if (i > 0) System.out.print(' ');
            System.out.print(result[i]);
        }
        System.out.println();
    }
}
`,
  },
  {
    language: 'javascript',
    sourceCode: `const fs = require('fs');

function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (seen.has(complement)) return [seen.get(complement), i];
    seen.set(nums[i], i);
  }
  return [];
}

const input = fs.readFileSync(0, 'utf8').trim().split(/\\s+/).filter(Boolean).map(Number);
if (input.length > 0) {
  const target = input[input.length - 1];
  const nums = input.slice(0, -1);
  console.log(twoSum(nums, target).join(' '));
}
`,
  },
];

const cases: Array<[input: string, expectedOutput: string]> = [
  ['2 7 11 15\n9', '0 1'],
  ['3 2 4\n6', '1 2'],
  ['3 3\n6', '0 1'],
  ['-4 8 3 12\n-1', '0 2'],
  ['1000000000 -1000000000 5\n0', '0 1'],
];

async function main(): Promise<void> {
  const judge0 = getJudge0Service();
  const health = await judge0.checkHealth();
  if (!health.ok) {
    throw new Error(`Configured Judge0 health check failed: ${health.message ?? 'unavailable'}`);
  }
  console.log('Configured Judge0 health: ok');

  let failed = 0;
  for (const program of programs) {
    for (let index = 0; index < cases.length; index++) {
      const [input, expectedOutput] = cases[index]!;
      const result = await judge0.executeTestCase(
        program.sourceCode,
        program.language,
        input,
        expectedOutput,
        2,
        256_000
      );
      console.log(`Two Sum ${program.language} case ${index + 1}: ${result.verdict}`);
      if (!result.passed) failed++;
    }
  }

  const totalCases = programs.length * cases.length;
  console.log(`Judge0 Two Sum result: ${totalCases - failed}/${totalCases} passed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
