import { Schema, model } from 'mongoose';
import type { HydratedDocument, Types } from 'mongoose';

export const CONTEST_STATUSES = ['draft', 'live', 'ended'] as const;
export type ContestStatus = (typeof CONTEST_STATUSES)[number];

export interface IContestProblem {
  problem: Types.ObjectId;
  points: number;
  order: number;
}

export interface IContest {
  title: string;
  description: string;
  problems: IContestProblem[];
  startTime: Date;
  endTime: Date;
  status: ContestStatus;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type ContestDocument = HydratedDocument<IContest>;

const contestProblemSchema = new Schema<IContestProblem>(
  {
    problem: {
      type: Schema.Types.ObjectId,
      ref: 'Problem',
      required: true,
    },
    points: { type: Number, required: true, min: 1 },
    order: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const contestSchema = new Schema<IContest>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    problems: {
      type: [contestProblemSchema],
      validate: {
        validator: (v: IContestProblem[]) => v.length > 0,
        message: 'Contest must have at least one problem',
      },
    },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    status: {
      type: String,
      enum: CONTEST_STATUSES,
      required: true,
      default: 'draft',
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

// participants moved to ContestParticipant model

contestSchema.pre('validate', function () {
  if (this.startTime && this.endTime && this.endTime <= this.startTime) {
    this.invalidate('endTime', 'endTime must be after startTime');
  }
});

contestSchema.index({ status: 1, startTime: 1 });
contestSchema.index({ createdBy: 1 });

export const Contest = model<IContest>('Contest', contestSchema);
