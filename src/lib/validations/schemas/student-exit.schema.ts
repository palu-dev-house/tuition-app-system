import { z } from "zod";

export const studentExitSchema = z.object({
  exitDate: z.coerce.date(),
  reason: z.string().min(1, "Reason is required").max(500),
});

export type StudentExitInput = z.infer<typeof studentExitSchema>;
