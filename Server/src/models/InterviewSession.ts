import { Schema, model } from 'mongoose';
import type { HydratedDocument, Types } from 'mongoose';
import { DIFFICULTIES, type Difficulty } from './Problem.js';

export const INTERVIEW_STATUSES = [
  'in_progress',
  'completed',
  'abandoned',
] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const INTERVIEW_TOPICS = [
  'Operating Systems',
  'DBMS',
  'Data Structures',
] as const;
export type InterviewTopic = (typeof INTERVIEW_TOPICS)[number];

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
  topics: InterviewTopic[];
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
    score: { type: Number, min: 0, max: 10 },
    feedback: { type: String },
    askedAt: { type: Date, required: true, default: Date.now },
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
    questionCount: { type: Number, required: true, min: 1, max: 20 },
    topics: {
      type: [{ type: String, enum: INTERVIEW_TOPICS }],
      validate: {
        validator: (v: InterviewTopic[]) => v.length > 0,
        message: 'At least one topic is required',
      },
    },
    status: {
      type: String,
      enum: INTERVIEW_STATUSES,
      required: true,
      default: 'in_progress',
    },
    questions: { type: [interviewQuestionSchema], default: [] },
    overallScore: { type: Number, min: 0, max: 10 },
    feedback: { type: String },
    startedAt: { type: Date, required: true, default: Date.now },
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
