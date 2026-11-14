import { Schema, model } from 'mongoose';
import type { HydratedDocument, Types } from 'mongoose';

export interface IContestParticipant {
  contest: Types.ObjectId;
  user: Types.ObjectId;
  joinedAt: Date;
  isDisqualified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ContestParticipantDocument = HydratedDocument<IContestParticipant>;

const contestParticipantSchema = new Schema<IContestParticipant>(
  {
    contest: {
      type: Schema.Types.ObjectId,
      ref: 'Contest',
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    joinedAt: { type: Date, required: true, default: Date.now },
    isDisqualified: { type: Boolean, required: true, default: false },
  },
  { timestamps: true }
);

// one user can join a contest only once
contestParticipantSchema.index({ contest: 1, user: 1 }, { unique: true });
contestParticipantSchema.index({ contest: 1, isDisqualified: 1 });
// student dashboard: count/fetch contests joined by one user
contestParticipantSchema.index({ user: 1, joinedAt: -1 });

export const ContestParticipant = model<IContestParticipant>(
  'ContestParticipant',
  contestParticipantSchema
);
