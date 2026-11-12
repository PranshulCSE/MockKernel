import { Schema, model } from 'mongoose';
import type { HydratedDocument, Types } from 'mongoose';

export const SUPPORTED_LANGUAGES = [
  'python',
  'cpp',
  'java',
  'javascript',
] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const SUBMISSION_MODES = ['run', 'submit'] as const;
export type SubmissionMode = (typeof SUBMISSION_MODES)[number];

export const SUBMISSION_VERDICTS = [
  'PENDING',
  'RUNNING',
  'ACCEPTED',
  'WRONG_ANSWER',
  'TLE',
  'RUNTIME_ERROR',
  'COMPILE_ERROR',
  'INTERNAL_ERROR',
  'PLAGIARISM_FLAGGED',
] as const;
export type SubmissionVerdict = (typeof SUBMISSION_VERDICTS)[number];

export interface ITestCaseResult {
  testCase: Types.ObjectId;
  passed: boolean;
  verdict?: SubmissionVerdict;
  runtime?: number;
  memory?: number;
  stdout?: string;
  stderr?: string;
}

export interface IPlagiarismResult {
  flagged: boolean;
  similarity?: number;
  matchedSubmission?: Types.ObjectId;
}

export interface ISubmission {
  user: Types.ObjectId;
  problem: Types.ObjectId;
  contest?: Types.ObjectId;
  language: SupportedLanguage;
  sourceCode: string;
  mode: SubmissionMode;
  verdict: SubmissionVerdict;
  judge0Token?: string;
  runtime?: number;
  memory?: number;
  compileOutput?: string;
  testCaseResults?: ITestCaseResult[];
  plagiarism?: IPlagiarismResult;
  createdAt: Date;
  updatedAt: Date;
}

export type SubmissionDocument = HydratedDocument<ISubmission>;

const testCaseResultSchema = new Schema<ITestCaseResult>(
  {
    testCase: {
      type: Schema.Types.ObjectId,
      ref: 'TestCase',
      required: true,
    },
    passed: { type: Boolean, required: true },
    verdict: { type: String, enum: SUBMISSION_VERDICTS },
    runtime: { type: Number },
    memory: { type: Number },
    stdout: { type: String },
    stderr: { type: String },
  },
  { _id: false }
);

const plagiarismResultSchema = new Schema<IPlagiarismResult>(
  {
    flagged: { type: Boolean, required: true, default: false },
    similarity: { type: Number },
    matchedSubmission: {
      type: Schema.Types.ObjectId,
      ref: 'Submission',
    },
  },
  { _id: false }
);

const submissionSchema = new Schema<ISubmission>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    problem: {
      type: Schema.Types.ObjectId,
      ref: 'Problem',
      required: true,
    },
    contest: {
      type: Schema.Types.ObjectId,
      ref: 'Contest',
    },
    language: {
      type: String,
      enum: SUPPORTED_LANGUAGES,
      required: true,
    },
    sourceCode: { type: String, required: true },
    mode: { type: String, enum: SUBMISSION_MODES, required: true },
    verdict: {
      type: String,
      enum: SUBMISSION_VERDICTS,
      required: true,
      default: 'PENDING',
    },
    judge0Token: { type: String, sparse: true },
    runtime: { type: Number },
    memory: { type: Number },
    compileOutput: { type: String },
    testCaseResults: { type: [testCaseResultSchema], default: undefined },
    plagiarism: { type: plagiarismResultSchema, default: undefined },
  },
  { timestamps: true }
);

submissionSchema.index({ user: 1, createdAt: -1 });
submissionSchema.index({ problem: 1, createdAt: -1 });
submissionSchema.index({ contest: 1, verdict: 1 });
submissionSchema.index({ contest: 1, problem: 1, verdict: 1 });

export const Submission = model<ISubmission>('Submission', submissionSchema);
