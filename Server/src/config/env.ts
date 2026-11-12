export interface EnvConfig {
  nodeEnv: string;
  port: number;
  mongoUri: string;
  redisHost: string;
  redisPort: number;
  redisPassword?: string;
  redisUrl?: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  googleClientId?: string;
  groqApiKey?: string;
  groqModel: string;
  judge0ApiUrl: string;
  judge0ApiKey?: string;
  submissionQueueName: string;
  clientUrl: string;
  plagiarismThreshold: number;
}

const REQUIRED_AT_BOOT = ['MONGODB_URI', 'JWT_SECRET'] as const;

/** Validates mandatory startup environment variables and returns a typed config. */
export function validateEnv(): EnvConfig {
  const missing = REQUIRED_AT_BOOT.filter((key) => {
    const val = process.env[key];
    return typeof val !== 'string' || val.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}`
    );
  }

  const config = getEnvConfig();

  if (!config.groqApiKey) {
    console.warn('[Env] GROQ_API_KEY is not set - AI interview endpoints will return 503.');
  }
  if (!config.googleClientId) {
    console.warn('[Env] GOOGLE_CLIENT_ID is not set - Google OAuth verification will reject tokens.');
  }

  return config;
}

/** Reads current process.env into a typed configuration object. */
export function getEnvConfig(): EnvConfig {
  const rawThreshold = Number(process.env.PLAGIARISM_THRESHOLD);
  const plagiarismThreshold =
    Number.isFinite(rawThreshold) && rawThreshold > 0 && rawThreshold <= 1
      ? rawThreshold
      : 0.85;

  const rawPort = Number(process.env.PORT);
  const port = Number.isInteger(rawPort) && rawPort > 0 ? rawPort : 3000;

  const rawRedisPort = Number(process.env.REDIS_PORT);
  const redisPort =
    Number.isInteger(rawRedisPort) && rawRedisPort > 0 ? rawRedisPort : 6379;

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port,
    mongoUri: process.env.MONGODB_URI || '',
    redisHost: process.env.REDIS_HOST || '127.0.0.1',
    redisPort,
    ...(process.env.REDIS_PASSWORD
      ? { redisPassword: process.env.REDIS_PASSWORD }
      : {}),
    ...(process.env.REDIS_URL ? { redisUrl: process.env.REDIS_URL } : {}),
    jwtSecret: process.env.JWT_SECRET || '',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    ...(process.env.GOOGLE_CLIENT_ID
      ? { googleClientId: process.env.GOOGLE_CLIENT_ID }
      : {}),
    ...(process.env.GROQ_API_KEY
      ? { groqApiKey: process.env.GROQ_API_KEY }
      : {}),
    groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    judge0ApiUrl: process.env.JUDGE0_API_URL || 'http://localhost:2358',
    ...(process.env.JUDGE0_API_KEY
      ? { judge0ApiKey: process.env.JUDGE0_API_KEY }
      : {}),
    submissionQueueName:
      process.env.SUBMISSION_QUEUE_NAME || 'submission-queue',
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
    plagiarismThreshold,
  };
}
