import { z } from "zod";

// Request/response validation for engagement surveys (specs/018-employee-engagement-surveys).
export const QuestionSchema = z.object({
  type: z.enum(["ENPS", "TEXT"]),
  prompt: z.string().trim().min(3).max(500),
});

export const CreateSurveyRequestSchema = z
  .object({
    title: z.string().trim().min(3).max(150),
    audienceType: z.enum(["COMPANY", "DEPARTMENT"]),
    departmentId: z.string().optional(),
    minResponses: z.number().int().min(2).max(100).optional(),
    questions: z.array(QuestionSchema).min(1).max(30),
  })
  .refine((v) => v.questions.some((q) => q.type === "ENPS"), { message: "Include at least one 0-10 eNPS question.", path: ["questions"] })
  .refine((v) => v.audienceType !== "DEPARTMENT" || Boolean(v.departmentId), { message: "departmentId is required for a department survey.", path: ["departmentId"] });
export type CreateSurveyRequest = z.infer<typeof CreateSurveyRequestSchema>;

export const SubmitResponseRequestSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string(),
        score: z.number().int().min(0).max(10).optional(),
        text: z.string().trim().max(5000).optional(),
      }),
    )
    .min(1),
});
export type SubmitResponseRequest = z.infer<typeof SubmitResponseRequestSchema>;
