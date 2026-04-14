import { z } from "zod";

export const onlinePaymentItemSchema = z
  .object({
    tuitionId: z.string().uuid().optional(),
    feeBillId: z.string().uuid().optional(),
    serviceFeeBillId: z.string().uuid().optional(),
  })
  .superRefine((item, ctx) => {
    const set = [item.tuitionId, item.feeBillId, item.serviceFeeBillId].filter(
      Boolean,
    );
    if (set.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Exactly one of tuitionId, feeBillId, serviceFeeBillId required",
      });
    }
  });

export const createOnlinePaymentSchema = z.object({
  items: z.array(onlinePaymentItemSchema).min(1).max(50),
});

export type CreateOnlinePaymentInput = z.infer<
  typeof createOnlinePaymentSchema
>;
export type OnlinePaymentItemInput = z.infer<typeof onlinePaymentItemSchema>;

export const cancelOnlinePaymentSchema = z.object({
  onlinePaymentId: z.string().uuid(),
});

export type CancelOnlinePaymentInput = z.infer<
  typeof cancelOnlinePaymentSchema
>;

export const paymentSettingSchema = z.object({
  onlinePaymentEnabled: z.boolean(),
  maintenanceMessage: z.string().nullable().optional(),
});

export type PaymentSettingInput = z.infer<typeof paymentSettingSchema>;
