import { Schema, model } from 'mongoose';
import type { HydratedDocument, Types } from 'mongoose';

export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const SUPPORTED_LANGUAGES = [
  'python',
  'cpp',
  'java',
  'javascript',
] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export interface IProblem {
  title: string;
  statement: string;
  difficulty: Difficulty;
  constraints: string;
  supportedLanguages: SupportedLanguage[];
  starterCode?: Partial<Record<SupportedLanguage, string>>;
  createdBy: Types.ObjectId;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ProblemDocument = HydratedDocument<IProblem>;

const problemSchema = new Schema<IProblem>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: [3, 'Title must be at least 3 characters long'],
      maxlength: [150, 'Title cannot exceed 150 characters'],
    },
    statement: { type: String, required: true },
    difficulty: { type: String, enum: DIFFICULTIES, required: true },
    constraints: { type: String, required: true },
    supportedLanguages: {
      type: [{ type: String, enum: SUPPORTED_LANGUAGES }],
      required: true,
      validate: {
        validator: (v: SupportedLanguage[]) =>
          Array.isArray(v) && v.length > 0 && new Set(v).size === v.length,
        message: 'At least one unique supported language is required',
      },
    },
    starterCode: { type: Schema.Types.Mixed },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isPublished: { type: Boolean, required: true, default: false },
  },
  { timestamps: true }
);

problemSchema.index({ difficulty: 1, isPublished: 1 });
problemSchema.index({ title: 1 });
problemSchema.index({ createdBy: 1 });

export const Problem = model<IProblem>('Problem', problemSchema);
