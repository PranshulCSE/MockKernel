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
    input: { type: String, required: true },
    expectedOutput: { type: String, required: true },
    isSample: { type: Boolean, required: true },
    order: { type: Number, required: true },
    explanation: { type: String },
  },
  { timestamps: true }
);

testCaseSchema.index({ problem: 1, isSample: 1, order: 1 });

export const TestCase = model<ITestCase>('TestCase', testCaseSchema);
