/**
 * Longest strictly-increasing subsequence, O(n log n), returning the selected
 * indices. Used to pick the maximum-cardinality monotonic candidate chain —
 * the global optimum for candidate count (unlike middle-out bisection, which
 * commits to a root before seeing the whole chain).
 */
export function longestIncreasingSubsequence(
  values: readonly number[],
): number[] {
  // tailIndices[len] = index of the smallest tail value of any increasing
  // subsequence of length len+1; parents reconstruct the chain.
  const tailIndices: number[] = [];
  const parents = new Array<number>(values.length).fill(-1);
  for (let i = 0; i < values.length; i++) {
    const value = values[i]!;
    // Binary search: first tail whose value >= value (strict increase).
    let lo = 0;
    let hi = tailIndices.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (values[tailIndices[mid]!]! < value) lo = mid + 1;
      else hi = mid;
    }
    parents[i] = lo > 0 ? tailIndices[lo - 1]! : -1;
    tailIndices[lo] = i;
  }
  const result: number[] = [];
  let at = tailIndices.length > 0 ? tailIndices[tailIndices.length - 1]! : -1;
  while (at !== -1) {
    result.push(at);
    at = parents[at]!;
  }
  return result.reverse();
}
