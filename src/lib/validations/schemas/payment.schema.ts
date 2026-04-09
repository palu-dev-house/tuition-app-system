import { z } from "zod";

export const paymentSchema = z.object({
  tuitionId: z.string().min(1),
  amount: z.coerce.number().positive(),
  notes: z.string().optional(),
});

export type PaymentInput = z.infer<typeof paymentSchema>;
