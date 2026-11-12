import { Schema, model } from 'mongoose';
import type { HydratedDocument, Types } from 'mongoose';

export interface ITestCase {
  problem: Types.ObjectId;
  input: string;
  expectedOutput: string;
  isSample: boolean;
  order: number;
  explanation?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type TestCaseDocument = HydratedDocument<ITestCase>;

const testCaseSchema = new Schema<ITestCase>(
  {
    problem: {
      type: Schema.Types.ObjectId,
      ref: 'Problem',
      required: true,
    },
    // default: '' allows no-stdin problems (empty input is valid)
    input: { type: String, default: '' },
    expectedOutput: { type: String, required: true },
    isSample: { type: Boolean, required: true, default: false },
    order: { type: Number, required: true, min: 0 },
    explanation: { type: String },
  },
  { timestamps: true }
);

testCaseSchema.index({ problem: 1, isSample: 1, order: 1 });
// prevent duplicate order numbers within the same problem
testCaseSchema.index({ problem: 1, order: 1 }, { unique: true });

export const TestCase = model<ITestCase>('TestCase', testCaseSchema);
