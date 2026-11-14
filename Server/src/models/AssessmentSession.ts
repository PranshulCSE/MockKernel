import { Schema, model } from 'mongoose';
import type { HydratedDocument, Types } from 'mongoose';

export const ASSESSMENT_SESSION_STATUSES = [
  'IN_PROGRESS',
  'SUBMITTED',
  'AUTO_SUBMITTED_VIOLATION',
  'AUTO_SUBMITTED_PAGE_RELOAD',
  'TIMED_OUT',
] as const;

export type AssessmentSessionStatus = (typeof ASSESSMENT_SESSION_STATUSES)[number];

export interface IViolationLog {
  timestamp: Date;
  type: string;
  reason: string;
  confidence: number;
}

export interface ICodeSubmissionItem {
  code: string;
  language: string;
  submittedAt: Date;
  status?: string;
  testCasesPassed?: number;
  totalTestCases?: number;
}

export interface IAssessmentSession {
  assessmentId: Types.ObjectId;
  userId: Types.ObjectId;
  codeSubmissions: Map<string, ICodeSubmissionItem>;
  strikes: number;
  status: AssessmentSessionStatus;
  violationLogs: IViolationLog[];
  startedAt: Date;
  submittedAt?: Date;
  score: number;
  testCasesPassed: number;
  totalTestCases: number;
  createdAt: Date;
  updatedAt: Date;
}

export type AssessmentSessionDocument = HydratedDocument<IAssessmentSession>;

const violationLogSchema = new Schema<IViolationLog>(
  {
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
  },
  { _id: false }
);

const assessmentSessionSchema = new Schema<IAssessmentSession>(
  {
    assessmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Assessment',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    codeSubmissions: {
      type: Map,
      of: new Schema(
        {
          code: { type: String, required: true },
          language: { type: String, required: true },
          submittedAt: { type: Date, default: Date.now },
          status: { type: String },
          testCasesPassed: { type: Number, default: 0 },
          totalTestCases: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      default: () => new Map(),
    },
    strikes: {
      type: Number,
      default: 0,
      min: 0,
      max: 3,
    },
    status: {
      type: String,
      enum: ASSESSMENT_SESSION_STATUSES,
      default: 'IN_PROGRESS',
      index: true,
    },
    violationLogs: {
      type: [violationLogSchema],
      default: () => [],
    },
    startedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    submittedAt: {
      type: Date,
    },
    score: {
      type: Number,
      default: 0,
      min: 0,
    },
    testCasesPassed: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalTestCases: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

assessmentSessionSchema.index({ assessmentId: 1, userId: 1 }, { unique: true });

export const AssessmentSession = model<IAssessmentSession>(
  'AssessmentSession',
  assessmentSessionSchema
);
