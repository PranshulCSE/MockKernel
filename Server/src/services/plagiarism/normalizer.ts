import type { SupportedLanguage } from '../../models/Problem.js';

/**
 * Known limitations of regex-based AST-lite normalization:
 * 1. Reordered independent statements are not detected.
 * 2. Complex macros / preprocessor tricks in C++ are not expanded.
 * 3. Without a full language parser, type names vs user identifiers in edge syntax
 *    are matched heuristically via language keywords & declaration patterns.
 */

const COMMON_KEYWORDS = new Set([
  'if',
  'else',
  'elif',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'default',
  'break',
  'continue',
  'return',
  'true',
  'false',
  'null',
  'none',
  'true',
  'false',
  'try',
  'catch',
  'except',
  'finally',
  'throw',
  'raise',
  'new',
  'this',
  'self',
  'class',
  'struct',
  'public',
  'private',
  'protected',
  'static',
  'void',
  'int',
  'long',
  'float',
  'double',
  'char',
  'bool',
  'boolean',
  'string',
  'str',
  'var',
  'let',
  'const',
  'function',
  'def',
  'import',
  'from',
  'include',
  'using',
  'namespace',
  'std',
  'in',
  'of',
  'and',
  'or',
  'not',
  'async',
  'await',
  'print',
  'console',
  'log',
  'length',
  'size',
  'push',
  'append',
  'main',
  'vector',
  'map',
  'set',
  'list',
  'dict',
  'len',
  'range',
]);

function stripCommentsAndStrings(
  code: string,
  language: SupportedLanguage
): string {
  if (language === 'python') {
    return code
      .replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, ' ')
      .replace(/#.*$/gm, '');
  }

  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, '');
}

function collectDeclaredIdentifiers(
  code: string,
  language: SupportedLanguage
): { vars: string[]; params: string[]; funcs: string[] } {
  const vars: string[] = [];
  const params: string[] = [];
  const funcs: string[] = [];

  if (language === 'python') {
    for (const match of code.matchAll(
      /\bdef\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)/g
    )) {
      if (match[1]) funcs.push(match[1]);
      if (match[2]) {
        for (const rawParam of match[2].split(',')) {
          const p = rawParam.trim().split(/[=:]/)[0]?.trim().replace(/^\*+/, '');
          if (p) params.push(p);
        }
      }
    }

    for (const match of code.matchAll(
      /(?:^|\n)\s*([a-zA-Z_]\w*(?:\s*,\s*[a-zA-Z_]\w*)*)\s*=(?!=)/g
    )) {
      if (match[1]) {
        for (const v of match[1].split(',')) {
          const trimmed = v.trim();
          if (trimmed) vars.push(trimmed);
        }
      }
    }
    for (const match of code.matchAll(/\bfor\s+([a-zA-Z_]\w*(?:\s*,\s*[a-zA-Z_]\w*)*)\s+in\b/g)) {
      if (match[1]) {
        for (const v of match[1].split(',')) {
          const trimmed = v.trim();
          if (trimmed) vars.push(trimmed);
        }
      }
    }
  } else if (language === 'javascript') {
    for (const match of code.matchAll(
      /\bfunction\s+([a-zA-Z_$][\w$]*)\s*\(([^)]*)\)/g
    )) {
      if (match[1]) funcs.push(match[1]);
      if (match[2]) {
        for (const rawParam of match[2].split(',')) {
          const p = rawParam.trim().split('=')[0]?.trim().replace(/^\.\.\./, '');
          if (p) params.push(p);
        }
      }
    }

    for (const match of code.matchAll(
      /\b(?:let|const|var)\s+([a-zA-Z_$][\w$]*)/g
    )) {
      if (match[1]) vars.push(match[1]);
    }
  } else {
    // C++ / Java
    for (const match of code.matchAll(
      /\b(?:int|long|float|double|char|bool|boolean|String|string|auto|void)\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)/g
    )) {
      if (match[1] && match[1] !== 'main') funcs.push(match[1]);
      if (match[2]) {
        for (const rawParam of match[2].split(',')) {
          const tokens = rawParam.trim().split(/\s+/);
          const last = tokens[tokens.length - 1]?.replace(/[&*[\]]/g, '');
          if (last) params.push(last);
        }
      }
    }

    for (const match of code.matchAll(
      /\b(?:int|long|float|double|char|bool|boolean|String|string|auto)\s+([a-zA-Z_]\w*)\s*(?:[=;,[])/g
    )) {
      if (match[1]) vars.push(match[1]);
    }
  }

  return { vars, params, funcs };
}

/**
 * Strips comments/whitespace and normalizes declared variable, parameter,
 * and function names into canonical tokens (V0, P0, F0, ...).
 */
export function normalizeCode(
  sourceCode: string,
  language: SupportedLanguage
): string {
  const stripped = stripCommentsAndStrings(sourceCode, language);
  const { vars, params, funcs } = collectDeclaredIdentifiers(stripped, language);

  const renameMap = new Map<string, string>();
  let fIdx = 0;
  let pIdx = 0;
  let vIdx = 0;

  for (const name of funcs) {
    if (!COMMON_KEYWORDS.has(name.toLowerCase()) && !renameMap.has(name)) {
      renameMap.set(name, `F${fIdx++}`);
    }
  }
  for (const name of params) {
    if (!COMMON_KEYWORDS.has(name.toLowerCase()) && !renameMap.has(name)) {
      renameMap.set(name, `P${pIdx++}`);
    }
  }
  for (const name of vars) {
    if (!COMMON_KEYWORDS.has(name.toLowerCase()) && !renameMap.has(name)) {
      renameMap.set(name, `V${vIdx++}`);
    }
  }

  const renamed = stripped.replace(/\b[a-zA-Z_$][\w$]*\b/g, (token) => {
    const mapped = renameMap.get(token);
    return mapped ?? token.toLowerCase();
  });

  return renamed.replace(/\s+/g, ' ').trim();
}
