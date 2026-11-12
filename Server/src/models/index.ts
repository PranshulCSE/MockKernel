// Barrel file — ensures all Mongoose models are registered before use.
// Import this once in the app entry point (Index.ts).

export {
  User,
  Student,
  type IUser,
  type IStudent,
  type UserDocument,
  type StudentDocument,
  type UserRole,
  USER_ROLES,
} from './User.js';
export { Admin, type IAdmin, type AdminDocument } from './Admin.js';
export { SuperAdmin, type ISuperAdmin, type SuperAdminDocument } from './SuperAdmin.js';
export {
  Problem,
  type IProblem,
  type ProblemDocument,
  DIFFICULTIES,
  SUPPORTED_LANGUAGES,
  type Difficulty,
  type SupportedLanguage,
} from './Problem.js';
export { TestCase, type ITestCase, type TestCaseDocument } from './TestCase.js';
export {
  Submission,
  type ISubmission,
  type SubmissionDocument,
  SUBMISSION_MODES,
  SUBMISSION_VERDICTS,
  type SubmissionMode,
  type SubmissionVerdict,
  type ITestCaseResult,
  type IPlagiarismResult,
} from './Submission.js';
export {
  Contest,
  type IContest,
  type ContestDocument,
  CONTEST_STATUSES,
  type ContestStatus,
  type IContestProblem,
} from './Contest.js';
export {
  ContestParticipant,
  type IContestParticipant,
  type ContestParticipantDocument,
} from './ContestParticipant.js';
export {
  InterviewSession,
  type IInterviewSession,
  type InterviewSessionDocument,
  INTERVIEW_STATUSES,
  type InterviewStatus,
  INTERVIEW_TOPICS,
  type InterviewTopic,
} from './InterviewSession.js';
