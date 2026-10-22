import { z } from "zod";

// Request/response validation for the recruitment module.
// See specs/005-recruitment-ats/spec.md for the functional requirements.
export const JobPostingStatusSchema = z.enum(["OPEN", "ON_HOLD", "CLOSED"]);
export type JobPostingStatus = z.infer<typeof JobPostingStatusSchema>;

export const CreateJobPostingRequestSchema = z.object({
  title: z.string().min(1),
  departmentId: z.string(),
  openings: z.number().int().positive(),
  // 020: shown on the public careers page
  description: z.string().trim().max(5000).optional(),
});
export type CreateJobPostingRequest = z.infer<typeof CreateJobPostingRequestSchema>;

export const UpdateJobPostingRequestSchema = z
  .object({
    status: JobPostingStatusSchema.optional(),
    openings: z.number().int().positive().optional(),
    description: z.string().trim().max(5000).nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.openings !== undefined || v.description !== undefined, {
    message: "Provide status, openings and/or description.",
  });
export type UpdateJobPostingRequest = z.infer<typeof UpdateJobPostingRequestSchema>;

export const JobPostingSchema = z.object({
  id: z.string(),
  title: z.string(),
  departmentId: z.string(),
  status: JobPostingStatusSchema,
  openings: z.number().int().positive(),
  description: z.string().nullable().optional(),
});
export type JobPosting = z.infer<typeof JobPostingSchema>;

export const CreateCandidateRequestSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(5).max(30).optional(),
  // v0.1: a link to the stored resume file (spec Assumptions — one file, no parsing).
  resumeUrl: z.string().url(),
});
export type CreateCandidateRequest = z.infer<typeof CreateCandidateRequestSchema>;

export const CandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
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

export const CreateApplicationRequestSchema = z.object({
  candidateId: z.string(),
  jobPostingId: z.string(),
});
export type CreateApplicationRequest = z.infer<typeof CreateApplicationRequestSchema>;

export const ApplicationSchema = z.object({
  id: z.string(),
  candidateId: z.string(),
  jobPostingId: z.string(),
  stage: ApplicationStageSchema,
  isTerminal: z.boolean(),
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

export const ReassignInterviewRequestSchema = z.object({
  interviewerId: z.string(),
});
export type ReassignInterviewRequest = z.infer<typeof ReassignInterviewRequestSchema>;

export const RecordInterviewResultRequestSchema = z.object({
  result: z.enum(["PASS", "FAIL"]),
  feedback: z.string().max(5000).optional(),
});
export type RecordInterviewResultRequest = z.infer<typeof RecordInterviewResultRequestSchema>;

export const InterviewRoundSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  interviewerId: z.string(),
  scheduledAt: z.string().datetime(),
  result: InterviewResultSchema,
  feedback: z.string().nullable(),
});
export type InterviewRound = z.infer<typeof InterviewRoundSchema>;

export const ApplicationDetailSchema = ApplicationSchema.extend({
  candidate: CandidateSchema,
  jobPosting: JobPostingSchema,
  interviewRounds: z.array(InterviewRoundSchema),
});
