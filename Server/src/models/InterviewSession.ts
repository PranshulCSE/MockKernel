import { Schema, model } from 'mongoose';
import type { HydratedDocument, Types } from 'mongoose';
import { DIFFICULTIES, type Difficulty } from './Problem';

export const INTERVIEW_STATUSES = [
  'in_progress',
  'completed',
  'abandoned',
] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export interface IInterviewQuestion {
  question: string;
  answer?: string;
  score?: number;
  feedback?: string;
  askedAt: Date;
  answeredAt?: Date;
}

export interface IInterviewSession {
  user: Types.ObjectId;
  difficulty: Difficulty;
  questionCount: number;
  topics: string[];
  status: InterviewStatus;
  questions: IInterviewQuestion[];
  overallScore?: number;
  feedback?: string;
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type InterviewSessionDocument = HydratedDocument<IInterviewSession>;

const interviewQuestionSchema = new Schema<IInterviewQuestion>(
  {
    question: { type: String, required: true },
    answer: { type: String },
    score: { type: Number },
    feedback: { type: String },
    askedAt: { type: Date, required: true },
    answeredAt: { type: Date },
  },
  { _id: false }
);

const interviewSessionSchema = new Schema<IInterviewSession>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    difficulty: { type: String, enum: DIFFICULTIES, required: true },
    questionCount: { type: Number, required: true },
    topics: [{ type: String }],
    status: { type: String, enum: INTERVIEW_STATUSES, required: true },
    questions: { type: [interviewQuestionSchema], default: [] },
    overallScore: { type: Number },
    feedback: { type: String },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

interviewSessionSchema.index({ user: 1, createdAt: -1 });
interviewSessionSchema.index({ status: 1 });

export const InterviewSession = model<IInterviewSession>(
  'InterviewSession',
  interviewSessionSchema
);
