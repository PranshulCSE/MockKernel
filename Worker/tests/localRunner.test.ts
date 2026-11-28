import { describe, expect, it } from 'vitest';
import { LocalRunnerService } from '../src/services/localRunner.js';

describe('LocalRunnerService', () => {
  const runner = new LocalRunnerService();

  it('executes JavaScript code and compares output', async () => {
    const code = `
      const fs = require('fs');
      const input = fs.readFileSync(0, 'utf8').trim();
      const num = parseInt(input, 10);
      console.log(num * 2);
    `;
    const res = await runner.executeTestCase(code, 'javascript', '21', '42');
    expect(res.verdict).toBe('ACCEPTED');
    expect(res.passed).toBe(true);
    expect(res.stdout?.trim()).toBe('42');
  });

  it('marks WRONG_ANSWER when output does not match', async () => {
    const code = 'console.log("foo");';
    const res = await runner.executeTestCase(code, 'javascript', '', 'bar');
    expect(res.verdict).toBe('WRONG_ANSWER');
    expect(res.passed).toBe(false);
  });

  it('handles RUNTIME_ERROR gracefully', async () => {
    const code = 'throw new Error("test crash");';
    const res = await runner.executeTestCase(code, 'javascript');
    expect(res.verdict).toBe('RUNTIME_ERROR');
    expect(res.passed).toBe(false);
    expect(res.stderr).toContain('test crash');
  });

  it('handles TLE timeout guard', async () => {
    const code = 'while(true) {}';
    const res = await runner.executeTestCase(code, 'javascript', '', '', 1); // 1s timeout
    expect(res.verdict).toBe('TLE');
    expect(res.passed).toBe(false);
  }, 5000);

  it('executes Python code successfully', async () => {
    const code = 'import sys\nval = sys.stdin.read().strip()\nprint(f"Echo: {val}")';
    const res = await runner.executeTestCase(code, 'python', 'Hello', 'Echo: Hello');
    expect(res.verdict).toBe('ACCEPTED');
    expect(res.passed).toBe(true);
    expect(res.stdout?.trim()).toBe('Echo: Hello');
  });

  it('executes C++ code and catches compile error', async () => {
    const badCode = 'int main() { syntax error }';
    const res = await runner.executeTestCase(badCode, 'cpp');
    expect(res.verdict).toBe('COMPILE_ERROR');
    expect(res.passed).toBe(false);
    expect(res.compileOutput).toBeDefined();
  });

  it('passes all seeded Two Sum cases with the reset C++ starter code', async () => {
    const code = `#include <iostream>
#include <unordered_map>
#include <vector>
using namespace std;
vector<int> twoSum(const vector<int>& nums, int target) {
  unordered_map<int, int> seen;
  for (int i = 0; i < static_cast<int>(nums.size()); i++) {
    auto match = seen.find(target - nums[i]);
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
  int target = values.back();
  values.pop_back();
  const auto result = twoSum(values, target);
  for (size_t i = 0; i < result.size(); i++) {
    if (i) cout << ' ';
    cout << result[i];
  }
  cout << endl;
}
`;
    const cases = [
      ['2 7 11 15\n9', '0 1'],
      ['3 2 4\n6', '1 2'],
      ['3 3\n6', '0 1'],
      ['-4 8 3 12\n-1', '0 2'],
      ['1000000000 -1000000000 5\n0', '0 1'],
    ] as const;

    for (const [input, expected] of cases) {
      const result = await runner.executeTestCase(code, 'cpp', input, expected);
      expect(result.verdict, `input ${JSON.stringify(input)}`).toBe('ACCEPTED');
      expect(result.passed).toBe(true);
    }
  }, 30_000);
});
