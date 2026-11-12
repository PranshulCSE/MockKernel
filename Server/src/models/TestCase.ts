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
    // Empty strings ('') are valid stdin/expectedOutput values in competitive programming.
    input: {
      type: String,
      default: '',
      validate: {
        validator: (v: unknown) => typeof v === 'string',
        message: 'input must be a string',
      },
    },
    expectedOutput: {
      type: String,
      required: [
        function (this: ITestCase): boolean {
          return typeof this.expectedOutput !== 'string';
        },
        'expectedOutput is required',
      ],
      validate: {
        validator: (v: unknown) => typeof v === 'string',
        message: 'expectedOutput must be a string',
      },
    },
    isSample: { type: Boolean, required: true, default: false },
    order: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'order must be a non-negative integer',
      },
    },
    explanation: { type: String },
  },
  { timestamps: true }
);

testCaseSchema.index({ problem: 1, isSample: 1, order: 1 });
// prevent duplicate order numbers within the same problem
testCaseSchema.index({ problem: 1, order: 1 }, { unique: true });

export const TestCase = model<ITestCase>('TestCase', testCaseSchema);
