import Groq from 'groq-sdk';
import { getEnvConfig } from '../config/env.js';
import { INTERVIEW_TOPICS, type InterviewTopic } from '../models/InterviewSession.js';
import { DIFFICULTIES, type Difficulty } from '../models/Problem.js';
import { HttpError } from '../utils/http.js';
import { isRecord } from '../utils/request.js';
import { withRetry, type RetryOptions } from './groqRetry.js';
import {
  buildFinalFeedbackPrompt,
  buildSystemPrompt,
  buildUserMessage,
  type InterviewTurnHistory,
} from './prompts/interviewPrompts.js';

const GROQ_TIMEOUT_MS = 30_000;

export interface GroqClientLike {
  chat: {
    completions: {
      create(
        body: {
          model: string;
          messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
          response_format: { type: 'json_object' };
          temperature: number;
        },
        options?: { timeout?: number }
      ): Promise<{
        choices: Array<{ message?: { content?: string | null } }>;
      }>;
    };
  };
}

export interface GroqServiceDeps {
  client?: GroqClientLike;
  retryOptions?: RetryOptions;
}

export interface InterviewTurnResult {
  evaluation?: {
    score: number;
    feedback: string;
  };
  nextQuestion?: {
    question: string;
    topic: InterviewTopic;
    difficulty: Difficulty;
  };
  isComplete: boolean;
}

function getGroqClient(deps?: GroqServiceDeps): GroqClientLike {
  if (deps?.client) {
    return deps.client;
  }
  const { groqApiKey } = getEnvConfig();
  if (!groqApiKey) {
    throw new HttpError(
      503,
      'AI_UNCONFIGURED',
      'GROQ_API_KEY is not configured on the server.'
    );
  }
  return new Groq({ apiKey: groqApiKey }) as unknown as GroqClientLike;
}

function isInterviewTopic(value: unknown): value is InterviewTopic {
  return (
    typeof value === 'string' &&
    (INTERVIEW_TOPICS as readonly string[]).includes(value)
  );
}

function isDifficulty(value: unknown): value is Difficulty {
  return (
    typeof value === 'string' &&
    (DIFFICULTIES as readonly string[]).includes(value)
  );
}

function clampScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  if (value < 0 || value > 10) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

/** Validates raw parsed JSON from Groq against the expected turn schema. */
export function validateNextTurnPayload(
  raw: unknown,
  options: {
    isInitial: boolean;
    expectComplete: boolean;
    allowedTopics: InterviewTopic[];
  }
): InterviewTurnResult {
  if (!isRecord(raw)) {
    throw new Error('Response is not a JSON object');
  }

  let evaluation: { score: number; feedback: string } | undefined;
  if (!options.isInitial) {
    if (!isRecord(raw.evaluation)) {
      throw new Error('Missing evaluation object');
    }
    const score = clampScore(raw.evaluation.score);
    const feedback =
      typeof raw.evaluation.feedback === 'string'
        ? raw.evaluation.feedback.trim()
        : '';

    if (score === null || feedback.length === 0) {
      throw new Error('Invalid evaluation.score or evaluation.feedback');
    }
    evaluation = { score, feedback };
  }

  const isComplete = options.expectComplete;
  let nextQuestion:
    | { question: string; topic: InterviewTopic; difficulty: Difficulty }
    | undefined;

  if (!isComplete) {
    if (!isRecord(raw.nextQuestion)) {
      throw new Error('Missing nextQuestion object');
    }
    const question =
      typeof raw.nextQuestion.question === 'string'
        ? raw.nextQuestion.question.trim()
        : '';

    if (question.length === 0) {
      throw new Error('nextQuestion.question must be a non-empty string');
    }

    const topic =
      isInterviewTopic(raw.nextQuestion.topic) &&
      options.allowedTopics.includes(raw.nextQuestion.topic)
        ? raw.nextQuestion.topic
        : (options.allowedTopics[0] ?? 'Data Structures');

    const difficulty = isDifficulty(raw.nextQuestion.difficulty)
      ? raw.nextQuestion.difficulty
      : 'Medium';

    nextQuestion = { question, topic, difficulty };
  }

  return {
    ...(evaluation ? { evaluation } : {}),
    ...(nextQuestion ? { nextQuestion } : {}),
    isComplete,
  };
}

async function callGroqJson(
  client: GroqClientLike,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  retryOptions?: RetryOptions
): Promise<string> {
  const { groqModel } = getEnvConfig();
  try {
    const completion = await withRetry(
      () =>
        client.chat.completions.create(
          {
            model: groqModel,
            messages,
            response_format: { type: 'json_object' },
            temperature: 0.4,
          },
          { timeout: GROQ_TIMEOUT_MS }
        ),
      retryOptions
    );

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new HttpError(
        502,
        'AI_INVALID_RESPONSE',
        'AI returned an empty response.'
      );
    }
    return content;
  } catch (err) {
    if (err instanceof HttpError) {
      throw err;
    }
    throw new HttpError(
      503,
      'AI_UNAVAILABLE',
      'AI interviewer is temporarily unavailable. Please retry.'
    );
  }
}

export async function generateNextQuestion(
  context: {
    topics: InterviewTopic[];
    difficulty: Difficulty;
    questionCount: number;
    history: InterviewTurnHistory[];
    currentAnswer?: string;
  },
  deps?: GroqServiceDeps
): Promise<InterviewTurnResult> {
  const client = getGroqClient(deps);
  const isInitial = context.history.length === 0;
  const questionNumber = context.history.length;
  const expectComplete = !isInitial && questionNumber >= context.questionCount;

  const systemPrompt = buildSystemPrompt({
    topics: context.topics,
    difficulty: context.difficulty,
    questionCount: context.questionCount,
    questionNumber,
    isInitial,
  });

  const userMessage = buildUserMessage(context.history, context.currentAnswer);
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  const rawText = await callGroqJson(client, messages, deps?.retryOptions);

  try {
    return validateNextTurnPayload(JSON.parse(rawText), {
      isInitial,
      expectComplete,
      allowedTopics: context.topics,
    });
  } catch (firstErr) {
    const repairReason =
      firstErr instanceof Error ? firstErr.message : 'Invalid schema';
    const repairedText = await callGroqJson(
      client,
      [
        ...messages,
        { role: 'assistant', content: rawText },
        {
          role: 'user',
          content: `Your previous response failed JSON validation (${repairReason}). Respond ONLY with valid JSON matching the exact schema in the system prompt.`,
        },
      ],
      deps?.retryOptions
    );

    try {
      return validateNextTurnPayload(JSON.parse(repairedText), {
        isInitial,
        expectComplete,
        allowedTopics: context.topics,
      });
    } catch {
      throw new HttpError(
        502,
        'AI_INVALID_RESPONSE',
        'AI interviewer returned malformed evaluation data.'
      );
    }
  }
}

export async function generateFinalFeedback(
  context: {
    topics: InterviewTopic[];
    difficulty: Difficulty;
    history: InterviewTurnHistory[];
  },
  deps?: GroqServiceDeps
): Promise<{ overallScore: number; feedback: string }> {
  const client = getGroqClient(deps);
  const prompt = buildFinalFeedbackPrompt(context);

  const rawText = await callGroqJson(
    client,
    [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    deps?.retryOptions
  );

  try {
    const parsed: unknown = JSON.parse(rawText);
    if (!isRecord(parsed)) {
      throw new Error('Not an object');
    }

    const overallScore = clampScore(parsed.overallScore);
    const feedback =
      typeof parsed.feedback === 'string' ? parsed.feedback.trim() : '';

    if (overallScore === null || feedback.length === 0) {
      throw new Error('Invalid summary fields');
    }

    return { overallScore, feedback };
  } catch {
    throw new HttpError(
      502,
      'AI_INVALID_RESPONSE',
      'AI interviewer returned malformed summary feedback.'
    );
  }
}
