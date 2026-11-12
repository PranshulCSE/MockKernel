import type { Request, Response } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import type { QueryFilter } from 'mongoose';
import {
  DIFFICULTIES,
  Problem,
  SUPPORTED_LANGUAGES,
  type Difficulty,
  type IProblem,
  type ProblemDocument,
  type SupportedLanguage,
} from '../models/Problem.js';
import { TestCase, type TestCaseDocument } from '../models/TestCase.js';
import { Contest } from '../models/Contest.js';
import { getAuthUser } from '../middleware/auth.js';
import { HttpError } from '../utils/http.js';

type TestCaseInput = {
  input: string;
  expectedOutput: string;
  isSample: boolean;
  order: number;
  explanation?: string;
};

type ProblemCreateInput = {
  title: string;
  statement: string;
  difficulty: Difficulty;
  constraints: string;
  supportedLanguages: SupportedLanguage[];
  starterCode?: Partial<Record<SupportedLanguage, string>>;
  isPublished: boolean;
};

type ProblemUpdateInput = Partial<ProblemCreateInput>;

type ListOptions = {
  page: number;
  limit: number;
  filter: QueryFilter<IProblem>;
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const TITLE_MIN_LENGTH = 3;
const TITLE_MAX_LENGTH = 150;
const STATEMENT_MAX_LENGTH = 50_000;
const CONSTRAINTS_MAX_LENGTH = 10_000;
const TEST_CASE_TEXT_MAX_LENGTH = 1_000_000;
const EXPLANATION_MAX_LENGTH = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function readQueryString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `Query parameter "${field}" must be a single string value.`
    );
  }

  return value.trim();
}

function readString(
  value: unknown,
  field: string,
  options: { min?: number; max?: number; trim?: boolean } = {}
): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', `${field} must be a string.`);
  }

  const normalized = options.trim === false ? value : value.trim();
  const min = options.min ?? 1;
  const max = options.max ?? Number.POSITIVE_INFINITY;

  if (normalized.length < min || normalized.length > max) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${field} must be between ${min} and ${max} characters.`
    );
  }

  return normalized;
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new HttpError(400, 'VALIDATION_ERROR', `${field} must be a boolean.`);
  }

  return value;
}

function readInteger(value: unknown, field: string, min: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${field} must be an integer greater than or equal to ${min}.`
    );
  }

  return value;
}

function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

function parseDifficulty(value: unknown): Difficulty {
  if (
    typeof value !== 'string' ||
    !(DIFFICULTIES as readonly string[]).includes(value)
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `difficulty must be one of: ${DIFFICULTIES.join(', ')}.`
    );
  }

  return value as Difficulty;
}

function parseSupportedLanguages(value: unknown): SupportedLanguage[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'supportedLanguages must be a non-empty array.'
    );
  }

  const result: SupportedLanguage[] = [];

  for (const language of value) {
    if (typeof language !== 'string' || !isSupportedLanguage(language)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `supportedLanguages contains an unsupported language. Allowed values: ${SUPPORTED_LANGUAGES.join(', ')}.`
      );
    }

    if (result.includes(language)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `supportedLanguages contains duplicate value "${language}".`
      );
    }

    result.push(language);
  }

  return result;
}

function parseStarterCode(
  value: unknown,
  supportedLanguages: SupportedLanguage[]
): Partial<Record<SupportedLanguage, string>> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'starterCode must be an object keyed by supported language.'
    );
  }

  const allowedLanguages = new Set(supportedLanguages);
  const result: Partial<Record<SupportedLanguage, string>> = {};

  for (const [language, starterCode] of Object.entries(value)) {
    if (!isSupportedLanguage(language)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `starterCode contains an unsupported language "${language}".`
      );
    }

    if (!allowedLanguages.has(language)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `starterCode language "${language}" is not present in supportedLanguages.`
      );
    }

    if (typeof starterCode !== 'string') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `starterCode.${language} must be a string.`
      );
    }

    result[language] = starterCode;
  }

  return result;
}

function parseTestCases(value: unknown): TestCaseInput[] {
  if (!Array.isArray(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'testCases must be an array.');
  }

  return value.map((testCase, index) => {
    if (!isRecord(testCase)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `testCases[${index}] must be an object.`
      );
    }

    const prefix = `testCases[${index}]`;
    const input = readString(testCase.input, `${prefix}.input`, {
      trim: false,
      max: TEST_CASE_TEXT_MAX_LENGTH,
    });
    const expectedOutput = readString(
      testCase.expectedOutput,
      `${prefix}.expectedOutput`,
      { trim: false, max: TEST_CASE_TEXT_MAX_LENGTH }
    );
    const isSample = readBoolean(testCase.isSample, `${prefix}.isSample`);
    const order = readInteger(testCase.order, `${prefix}.order`, 0);

    let explanation: string | undefined;
    if (hasOwn(testCase, 'explanation')) {
      explanation = readString(
        testCase.explanation,
        `${prefix}.explanation`,
        { min: 0, max: EXPLANATION_MAX_LENGTH }
      );
    }

    return {
      input,
      expectedOutput,
      isSample,
      order,
      ...(explanation !== undefined ? { explanation } : {}),
    };
  });
}

function parseProblemCreateInput(body: unknown): {
  input: ProblemCreateInput;
  testCases: TestCaseInput[];
} {
  if (!isRecord(body)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Request body must be a JSON object.'
    );
  }

  const supportedLanguages = parseSupportedLanguages(body.supportedLanguages);
  const input: ProblemCreateInput = {
    title: readString(body.title, 'title', {
      min: TITLE_MIN_LENGTH,
      max: TITLE_MAX_LENGTH,
    }),
    statement: readString(body.statement, 'statement', {
      max: STATEMENT_MAX_LENGTH,
    }),
    difficulty: parseDifficulty(body.difficulty),
    constraints: readString(body.constraints, 'constraints', {
      max: CONSTRAINTS_MAX_LENGTH,
    }),
    supportedLanguages,
    isPublished: hasOwn(body, 'isPublished')
      ? readBoolean(body.isPublished, 'isPublished')
      : false,
  };

  const starterCode = parseStarterCode(body.starterCode, supportedLanguages);
  if (starterCode !== undefined) {
    input.starterCode = starterCode;
  }

  const testCases = hasOwn(body, 'testCases')
    ? parseTestCases(body.testCases)
    : [];

  return { input, testCases };
}

function parseProblemUpdateInput(
  body: unknown,
  existingLanguages: SupportedLanguage[]
): { input: ProblemUpdateInput; testCases: TestCaseInput[] | undefined } {
  if (!isRecord(body)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Request body must be a JSON object.'
    );
  }

  const input: ProblemUpdateInput = {};
  let supportedLanguages = existingLanguages;

  if (hasOwn(body, 'supportedLanguages')) {
    supportedLanguages = parseSupportedLanguages(body.supportedLanguages);
    input.supportedLanguages = supportedLanguages;
  }

  if (hasOwn(body, 'title')) {
    input.title = readString(body.title, 'title', {
      min: TITLE_MIN_LENGTH,
      max: TITLE_MAX_LENGTH,
    });
  }

  if (hasOwn(body, 'statement')) {
    input.statement = readString(body.statement, 'statement', {
      max: STATEMENT_MAX_LENGTH,
    });
  }

  if (hasOwn(body, 'difficulty')) {
    input.difficulty = parseDifficulty(body.difficulty);
  }

  if (hasOwn(body, 'constraints')) {
    input.constraints = readString(body.constraints, 'constraints', {
      max: CONSTRAINTS_MAX_LENGTH,
    });
  }

  if (hasOwn(body, 'starterCode')) {
    const starterCode = parseStarterCode(body.starterCode, supportedLanguages);
    if (starterCode !== undefined) {
      input.starterCode = starterCode;
    }
  }

  if (hasOwn(body, 'isPublished')) {
    input.isPublished = readBoolean(body.isPublished, 'isPublished');
  }

  const testCases = hasOwn(body, 'testCases')
    ? parseTestCases(body.testCases)
    : undefined;

  if (Object.keys(input).length === 0 && testCases === undefined) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'At least one problem field or testCases must be provided.'
    );
  }

  return { input, testCases };
}

function parsePage(value: unknown): number {
  const raw = readQueryString(value, 'page');

  if (raw === undefined || raw === '') {
    return DEFAULT_PAGE;
  }

  const page = Number(raw);
  if (!Number.isInteger(page) || page < 1) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'page must be a positive integer.');
  }

  return page;
}

function parseLimit(value: unknown): number {
  const raw = readQueryString(value, 'limit');

  if (raw === undefined || raw === '') {
    return DEFAULT_LIMIT;
  }

  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `limit must be an integer between 1 and ${MAX_LIMIT}.`
    );
  }

  return limit;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseListOptions(req: Request, includeUnpublished: boolean): ListOptions {
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit);
  const filter: QueryFilter<IProblem> = {};

  if (!includeUnpublished) {
    filter.isPublished = true;
  }

  const search = readQueryString(req.query.search, 'search');
  if (search) {
    filter.title = {
      $regex: escapeRegex(search),
      $options: 'i',
    };
  }

  const difficulty = readQueryString(req.query.difficulty, 'difficulty');
  if (difficulty) {
    filter.difficulty = parseDifficulty(difficulty);
  }

  if (includeUnpublished) {
    const isPublished = readQueryString(req.query.isPublished, 'isPublished');
    if (isPublished !== undefined && isPublished !== '') {
      if (isPublished !== 'true' && isPublished !== 'false') {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'isPublished must be either "true" or "false".'
        );
      }

      filter.isPublished = isPublished === 'true';
    }

    const createdBy = readQueryString(req.query.createdBy, 'createdBy');
    if (createdBy) {
      if (!isValidObjectId(createdBy)) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'createdBy must be a valid MongoDB ObjectId.'
        );
      }

      filter.createdBy = new Types.ObjectId(createdBy);
    }
  }

  return { page, limit, filter };
}

function getPagination(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

function toPublicSummary(problem: ProblemDocument) {
  return {
    id: problem.id,
    title: problem.title,
    difficulty: problem.difficulty,
    supportedLanguages: problem.supportedLanguages,
    createdAt: problem.createdAt,
  };
}

function toPublicProblem(problem: ProblemDocument) {
  return {
    ...toPublicSummary(problem),
    statement: problem.statement,
    constraints: problem.constraints,
    starterCode: problem.starterCode,
    updatedAt: problem.updatedAt,
  };
}

function toAdminProblem(problem: ProblemDocument) {
  return {
    ...toPublicProblem(problem),
    isPublished: problem.isPublished,
    createdBy: problem.createdBy.toString(),
  };
}

function toTestCaseResponse(testCase: TestCaseDocument) {
  return {
    id: testCase.id,
    input: testCase.input,
    expectedOutput: testCase.expectedOutput,
    isSample: testCase.isSample,
    order: testCase.order,
    ...(testCase.explanation !== undefined
      ? { explanation: testCase.explanation }
      : {}),
  };
}

async function findProblemOrThrow(id: unknown): Promise<ProblemDocument> {
  if (typeof id !== 'string' || !isValidObjectId(id)) {
    throw new HttpError(
      400,
      'INVALID_ID',
      'Problem id is not a valid MongoDB ObjectId.'
    );
  }

  const problem = await Problem.findById(id).exec();
  if (!problem) {
    throw new HttpError(404, 'PROBLEM_NOT_FOUND', 'Problem not found.');
  }

  return problem;
}

async function findPublishedProblemOrThrow(
  id: unknown
): Promise<ProblemDocument> {
  if (typeof id !== 'string' || !isValidObjectId(id)) {
    throw new HttpError(
      400,
      'INVALID_ID',
      'Problem id is not a valid MongoDB ObjectId.'
    );
  }

  const problem = await Problem.findOne({ _id: id, isPublished: true }).exec();
  if (!problem) {
    throw new HttpError(404, 'PROBLEM_NOT_FOUND', 'Problem not found.');
  }

  return problem;
}

async function sendAdminProblem(
  res: Response,
  problem: ProblemDocument,
  statusCode = 200
): Promise<void> {
  const testCases = await TestCase.find({ problem: problem._id })
    .sort({ isSample: -1, order: 1 })
    .exec();

  res.status(statusCode).json({
    data: {
      ...toAdminProblem(problem),
      testCases: testCases.map(toTestCaseResponse),
    },
  });
}

async function insertTestCases(
  problemId: Types.ObjectId,
  testCases: TestCaseInput[]
): Promise<void> {
  if (testCases.length === 0) {
    return;
  }

  await TestCase.insertMany(
    testCases.map((testCase) => ({
      ...testCase,
      problem: problemId,
    }))
  );
}

async function replaceTestCases(
  problemId: Types.ObjectId,
  testCases: TestCaseInput[]
): Promise<void> {
  const existingTestCases = await TestCase.find({ problem: problemId }).exec();
  const existingData: TestCaseInput[] = existingTestCases.map((testCase) => ({
    input: testCase.input,
    expectedOutput: testCase.expectedOutput,
    isSample: testCase.isSample,
    order: testCase.order,
    ...(testCase.explanation !== undefined
      ? { explanation: testCase.explanation }
      : {}),
  }));

  await TestCase.deleteMany({ problem: problemId }).exec();

  if (testCases.length === 0) {
    return;
  }

  try {
    await insertTestCases(problemId, testCases);
  } catch (error) {
    if (existingData.length > 0) {
      try {
        await insertTestCases(problemId, existingData);
      } catch (restoreError) {
        console.error('Failed to restore problem test cases:', restoreError);
      }
    }

    throw error;
  }
}

export async function listPublicProblems(
  req: Request,
  res: Response
): Promise<void> {
  const { page, limit, filter } = parseListOptions(req, false);

  const [problems, total] = await Promise.all([
    Problem.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Problem.countDocuments(filter).exec(),
  ]);

  res.status(200).json({
    data: problems.map(toPublicSummary),
    pagination: getPagination(page, limit, total),
  });
}

export async function getPublicProblem(
  req: Request,
  res: Response
): Promise<void> {
  const problem = await findPublishedProblemOrThrow(req.params.id);
  const sampleTestCases = await TestCase.find({
    problem: problem._id,
    isSample: true,
  })
    .sort({ order: 1 })
    .exec();

  res.status(200).json({
    data: {
      ...toPublicProblem(problem),
      sampleTestCases: sampleTestCases.map(toTestCaseResponse),
    },
  });
}

export async function listAdminProblems(
  req: Request,
  res: Response
): Promise<void> {
  const { page, limit, filter } = parseListOptions(req, true);

  const [problems, total] = await Promise.all([
    Problem.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Problem.countDocuments(filter).exec(),
  ]);

  res.status(200).json({
    data: problems.map(toAdminProblem),
    pagination: getPagination(page, limit, total),
  });
}

export async function getAdminProblem(
  req: Request,
  res: Response
): Promise<void> {
  const problem = await findProblemOrThrow(req.params.id);
  await sendAdminProblem(res, problem);
}

export async function createProblem(
  req: Request,
  res: Response
): Promise<void> {
  const authUser = getAuthUser(req);
  const { input, testCases } = parseProblemCreateInput(req.body as unknown);

  const problem = new Problem({
    ...input,
    createdBy: authUser.id,
  });

  await problem.save();

  try {
    await insertTestCases(problem._id, testCases);
  } catch (error) {
    await Problem.findByIdAndDelete(problem._id).exec();
    throw error;
  }

  await sendAdminProblem(res, problem, 201);
}

export async function updateProblem(
  req: Request,
  res: Response
): Promise<void> {
  const problem = await findProblemOrThrow(req.params.id);
  const { input, testCases } = parseProblemUpdateInput(
    req.body as unknown,
    problem.supportedLanguages
  );

  const nextLanguages = input.supportedLanguages;
  if (nextLanguages && problem.starterCode) {
    const invalidLanguages = Object.keys(problem.starterCode).filter(
      (language) => !nextLanguages.includes(language as SupportedLanguage)
    );

    if (invalidLanguages.length > 0) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `starterCode contains languages that are no longer supported: ${invalidLanguages.join(', ')}.`
      );
    }
  }

  problem.set(input);
  await problem.save();

  if (testCases !== undefined) {
    await replaceTestCases(problem._id, testCases);
  }

  await sendAdminProblem(res, problem);
}

export async function deleteProblem(
  req: Request,
  res: Response
): Promise<void> {
  const problem = await findProblemOrThrow(req.params.id);

  const liveContest = await Contest.exists({
    status: 'live',
    'problems.problem': problem._id,
  }).exec();

  if (liveContest) {
    throw new HttpError(
      409,
      'PROBLEM_IN_LIVE_CONTEST',
      'Cannot delete a problem that is part of a live contest.'
    );
  }

  await Promise.all([
    Problem.findByIdAndDelete(problem._id).exec(),
    TestCase.deleteMany({ problem: problem._id }).exec(),
  ]);

  res.status(204).send();
}
