/**
 * Shared topic verification for AI mock interviews.
 *
 * The interview UI lets candidates request any technical stack, but the server
 * must still reject empty, abusive, or clearly non-technical input before it is
 * sent to the AI provider. This module is intentionally dependency-free so it
 * can be reused by controllers and tests.
 */

export interface TopicVerificationResult {
  valid: boolean;
  normalized: string;
  message?: string;
}

const MIN_TOPIC_LENGTH = 2;
const MAX_TOPIC_LENGTH = 80;

/** Phrases and single tokens that are accepted as technical interview subjects. */
const TECH_TERMS = [
  'mern',
  'mern stack',
  'mean',
  'mean stack',
  'python',
  'python programming',
  'javascript',
  'typescript',
  'java',
  'c++',
  'cpp',
  'c#',
  'csharp',
  'c programming',
  'golang',
  'go',
  'rust',
  'ruby',
  'php',
  'swift',
  'kotlin',
  'scala',
  'dart',
  'r programming',
  'sql',
  'nosql',
  'html',
  'css',
  'react',
  'react.js',
  'reactjs',
  'react native',
  'next.js',
  'nextjs',
  'node',
  'node.js',
  'nodejs',
  'express',
  'express.js',
  'django',
  'flask',
  'fastapi',
  'spring',
  'spring boot',
  'vue',
  'vue.js',
  'angular',
  'laravel',
  'asp.net',
  '.net',
  'flutter',
  'tailwind',
  'tailwind css',
  'redux',
  'graphql',
  'operating systems',
  'os',
  'dbms',
  'database',
  'databases',
  'data structures',
  'dsa',
  'algorithms',
  'computer networks',
  'networking',
  'system design',
  'oop',
  'oops',
  'object oriented programming',
  'low level design',
  'lld',
  'high level design',
  'hld',
  'microservices',
  'distributed systems',
  'rest api',
  'restful api',
  'api',
  'mongodb',
  'mysql',
  'postgresql',
  'postgres',
  'redis',
  'cassandra',
  'dynamodb',
  'sqlite',
  'docker',
  'kubernetes',
  'k8s',
  'devops',
  'aws',
  'azure',
  'gcp',
  'google cloud',
  'cloud computing',
  'linux',
  'git',
  'ci',
  'cd',
  'ci/cd',
  'kafka',
  'rabbitmq',
  'machine learning',
  'deep learning',
  'artificial intelligence',
  'ai',
  'data science',
  'nlp',
  'computer vision',
  'pytorch',
  'tensorflow',
  'pandas',
  'numpy',
  'cyber security',
  'web security',
  'blockchain',
  'solidity',
  'web3',
  'testing',
  'jest',
  'cypress',
  'concurrency',
  'multithreading',
  'compiler design',
  'computer architecture',
  'software engineering',
] as const;

/** Canonical display names for exact aliases. */
const CANONICAL_BY_EXACT: Record<string, string> = {
  mern: 'MERN Stack',
  'mern stack': 'MERN Stack',
  mean: 'MEAN Stack',
  'mean stack': 'MEAN Stack',
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  java: 'Java',
  'c++': 'C++',
  cpp: 'C++',
  'c#': 'C#',
  csharp: 'C#',
  golang: 'Golang',
  go: 'Go',
  rust: 'Rust',
  ruby: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kotlin: 'Kotlin',
  scala: 'Scala',
  dart: 'Dart',
  sql: 'SQL',
  nosql: 'NoSQL',
  html: 'HTML',
  css: 'CSS',
  react: 'React',
  'react.js': 'React',
  reactjs: 'React',
  'next.js': 'Next.js',
  nextjs: 'Next.js',
  node: 'Node.js',
  'node.js': 'Node.js',
  nodejs: 'Node.js',
  express: 'Express.js',
  'express.js': 'Express.js',
  django: 'Django',
  flask: 'Flask',
  fastapi: 'FastAPI',
  spring: 'Spring',
  'spring boot': 'Spring Boot',
  vue: 'Vue.js',
  'vue.js': 'Vue.js',
  angular: 'Angular',
  laravel: 'Laravel',
  'asp.net': 'ASP.NET',
  '.net': '.NET',
  flutter: 'Flutter',
  tailwind: 'Tailwind CSS',
  'tailwind css': 'Tailwind CSS',
  redux: 'Redux',
  graphql: 'GraphQL',
  'operating systems': 'Operating Systems',
  os: 'Operating Systems',
  dbms: 'DBMS',
  database: 'Databases',
  databases: 'Databases',
  'data structures': 'Data Structures',
  dsa: 'DSA',
  algorithms: 'Algorithms',
  'computer networks': 'Computer Networks',
  networking: 'Computer Networks',
  'system design': 'System Design',
  oop: 'OOP',
  oops: 'OOP',
  'low level design': 'Low Level Design',
  lld: 'Low Level Design',
  'high level design': 'High Level Design',
  hld: 'High Level Design',
  microservices: 'Microservices',
  'distributed systems': 'Distributed Systems',
  'rest api': 'REST API',
  'restful api': 'REST API',
  mongodb: 'MongoDB',
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
  postgres: 'PostgreSQL',
  redis: 'Redis',
  cassandra: 'Cassandra',
  dynamodb: 'DynamoDB',
  sqlite: 'SQLite',
  docker: 'Docker',
  kubernetes: 'Kubernetes',
  k8s: 'Kubernetes',
  devops: 'DevOps',
  aws: 'AWS',
  azure: 'Azure',
  gcp: 'GCP',
  'google cloud': 'Google Cloud',
  'cloud computing': 'Cloud Computing',
  linux: 'Linux',
  git: 'Git',
  'ci/cd': 'CI/CD',
  kafka: 'Kafka',
  rabbitmq: 'RabbitMQ',
  'machine learning': 'Machine Learning',
  'deep learning': 'Deep Learning',
  'artificial intelligence': 'Artificial Intelligence',
  ai: 'AI',
  'data science': 'Data Science',
  nlp: 'NLP',
  'computer vision': 'Computer Vision',
  pytorch: 'PyTorch',
  tensorflow: 'TensorFlow',
  pandas: 'Pandas',
  numpy: 'NumPy',
  'cyber security': 'Cyber Security',
  'web security': 'Web Security',
  blockchain: 'Blockchain',
  solidity: 'Solidity',
  web3: 'Web3',
  testing: 'Testing',
  jest: 'Jest',
  cypress: 'Cypress',
};

/** Words that should stay uppercase when formatting a multi-word topic. */
const ACRONYM_WORDS: Record<string, string> = {
  mern: 'MERN',
  mean: 'MEAN',
  dsa: 'DSA',
  sql: 'SQL',
  nosql: 'NoSQL',
  html: 'HTML',
  css: 'CSS',
  api: 'API',
  rest: 'REST',
  restful: 'RESTful',
  oop: 'OOP',
  oops: 'OOP',
  dbms: 'DBMS',
  os: 'OS',
  aws: 'AWS',
  gcp: 'GCP',
  ai: 'AI',
  nlp: 'NLP',
  ci: 'CI',
  cd: 'CD',
  k8s: 'K8s',
  lld: 'LLD',
  hld: 'HLD',
  devops: 'DevOps',
  graphql: 'GraphQL',
  grpc: 'gRPC',
};

function formatMultiWordTopic(input: string): string {
  return input
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      const acronym = ACRONYM_WORDS[lower];
      if (acronym) {
        return acronym;
      }
      if (lower === 'and' || lower === 'for' || lower === 'the' || lower === 'of') {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[\s,&;:()[\]]+/)
    .map((token) => token.replace(/^[-/]+|[-/]+$/g, ''))
    .filter(Boolean);
}

function matchesTechnicalTerm(normalizedLower: string, tokens: string[]): boolean {
  return TECH_TERMS.some((term) => {
    if (term.includes(' ')) {
      return normalizedLower === term || normalizedLower.includes(term);
    }
    return tokens.includes(term);
  });
}

/**
 * Validates and normalizes a candidate-entered interview subject.
 */
export function verifyInterviewTopic(raw: string): TopicVerificationResult {
  const trimmed = raw.trim().replace(/\s+/g, ' ');

  if (!trimmed) {
    return {
      valid: false,
      normalized: '',
      message: 'Please enter a technical subject or framework name.',
    };
  }

  if (trimmed.length < MIN_TOPIC_LENGTH) {
    return {
      valid: false,
      normalized: trimmed,
      message: `Subject must be at least ${MIN_TOPIC_LENGTH} characters.`,
    };
  }

  if (trimmed.length > MAX_TOPIC_LENGTH) {
    return {
      valid: false,
      normalized: trimmed,
      message: `Subject name cannot exceed ${MAX_TOPIC_LENGTH} characters.`,
    };
  }

  if (!/^[a-zA-Z0-9\s.+\-#&/()]+$/.test(trimmed)) {
    return {
      valid: false,
      normalized: trimmed,
      message:
        'Subject contains invalid characters. Use letters, numbers, and common symbols like +, #, ., -, &.',
    };
  }

  if (!/[a-zA-Z]/.test(trimmed)) {
    return {
      valid: false,
      normalized: trimmed,
      message: 'Subject must contain alphabetic characters.',
    };
  }

  if (/^(.)\1{3,}$/i.test(trimmed)) {
    return {
      valid: false,
      normalized: trimmed,
      message: 'Invalid subject: repetitive characters detected.',
    };
  }

  const lower = trimmed.toLowerCase();
  const tokens = tokenize(trimmed);

  if (!matchesTechnicalTerm(lower, tokens)) {
    return {
      valid: false,
      normalized: trimmed,
      message: `"${trimmed}" was not recognized as a standard technical domain. Examples: MERN Stack, Python, Golang, Spring Boot, DevOps, Docker.`,
    };
  }

  return {
    valid: true,
    normalized: CANONICAL_BY_EXACT[lower] ?? formatMultiWordTopic(trimmed),
  };
}
