import { Schema, model } from 'mongoose';
import type { HydratedDocument, Types } from 'mongoose';

export const ASSESSMENT_STATUSES = ['DRAFT', 'ACTIVE', 'COMPLETED'] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export interface IAssessment {
  title: string;
  description: string;
  code: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  problems: Types.ObjectId[];
  allowCustomProblems: boolean;
  createdBy: Types.ObjectId;
  status: AssessmentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type AssessmentDocument = HydratedDocument<IAssessment>;

const assessmentSchema = new Schema<IAssessment>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: [3, 'Title must be at least 3 characters long'],
      maxlength: [150, 'Title cannot exceed 150 characters'],
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: [5, 'Duration must be at least 5 minutes'],
      max: [1440, 'Duration cannot exceed 24 hours'],
    },
    problems: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Problem',
        required: true,
      },
    ],
    allowCustomProblems: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
    status: {
      type: String,
      enum: ASSESSMENT_STATUSES,
      default: 'DRAFT',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

assessmentSchema.index({ startTime: 1, endTime: 1 });
assessmentSchema.index({ createdBy: 1 });

export const Assessment = model<IAssessment>('Assessment', assessmentSchema);
