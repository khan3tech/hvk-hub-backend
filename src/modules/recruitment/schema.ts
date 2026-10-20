import { z } from "zod";

// Request/response validation for the recruitment module.
// See specs/005-recruitment-ats/spec.md for the functional requirements.
export const JobPostingStatusSchema = z.enum(["OPEN", "ON_HOLD", "CLOSED"]);
export type JobPostingStatus = z.infer<typeof JobPostingStatusSchema>;

export const CreateJobPostingRequestSchema = z.object({
  title: z.string().min(1),
  departmentId: z.string(),
  openings: z.number().int().positive(),
});
export type CreateJobPostingRequest = z.infer<typeof CreateJobPostingRequestSchema>;

export const UpdateJobPostingRequestSchema = z.object({
  status: JobPostingStatusSchema.optional(),
  openings: z.number().int().positive().optional(),
});
export type UpdateJobPostingRequest = z.infer<typeof UpdateJobPostingRequestSchema>;

export const JobPostingSchema = z.object({
  id: z.string(),
  title: z.string(),
  departmentId: z.string(),
  status: JobPostingStatusSchema,
  openings: z.number().int().positive(),
});
export type JobPosting = z.infer<typeof JobPostingSchema>;

export const CreateCandidateRequestSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  resumeUrl: z.string().url(),
});
export type CreateCandidateRequest = z.infer<typeof CreateCandidateRequestSchema>;

export const CandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  resumeUrl: z.string().url(),
});
export type Candidate = z.infer<typeof CandidateSchema>;

export const ApplicationStageSchema = z.enum([
  "APPLIED",
  "SCREEN",
  "INTERVIEW",
  "OFFER",
  "HIRED",
  "REJECTED",
]);
export type ApplicationStage = z.infer<typeof ApplicationStageSchema>;

export const ApplicationSchema = z.object({
  id: z.string(),
  candidateId: z.string(),
  jobPostingId: z.string(),
  stage: ApplicationStageSchema,
});
export type Application = z.infer<typeof ApplicationSchema>;

export const UpdateApplicationStageRequestSchema = z.object({
  stage: ApplicationStageSchema,
});
export type UpdateApplicationStageRequest = z.infer<typeof UpdateApplicationStageRequestSchema>;

export const InterviewResultSchema = z.enum(["PENDING", "PASS", "FAIL"]);
export type InterviewResult = z.infer<typeof InterviewResultSchema>;

export const ScheduleInterviewRequestSchema = z.object({
  interviewerId: z.string(),
  scheduledAt: z.string().datetime(),
});
export type ScheduleInterviewRequest = z.infer<typeof ScheduleInterviewRequestSchema>;

export const InterviewRoundSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  interviewerId: z.string(),
  scheduledAt: z.string().datetime(),
  result: InterviewResultSchema,
});
export type InterviewRound = z.infer<typeof InterviewRoundSchema>;
