import { Prisma } from "@/generated/prisma/client";
import { createApiHandler } from "@/lib/api-adapter";
import {
  reverseFeeBillPayment,
  reverseServiceFeeBillPayment,
  settleOnlinePayment,
  updateOnlinePaymentStatus,
} from "@/lib/business-logic/online-payment-processor";
import { assertSingleBillTarget } from "@/lib/business-logic/payment-items";
import { verifySignature } from "@/lib/midtrans";
import { prisma } from "@/lib/prisma";

/**
 * Midtrans webhook notification handler
 * This is a PUBLIC endpoint — authenticated via signature verification only
 */
async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawPayload = JSON.stringify(body);

    const {
      order_id: orderId,
      transaction_status: transactionStatus,
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key: signatureKey,
      payment_type: paymentType,
      transaction_time: transactionTime,
      settlement_time: settlementTime,
    } = body;

    // Find related online payment
    const onlinePayment = await prisma.onlinePayment.findUnique({
      where: { orderId },
      include: { items: true },
    });

    // Log webhook
    await prisma.midtransWebhookLog.create({
      data: {
        orderId,
        transactionStatus: transactionStatus || "unknown",
        statusCode: statusCode || "unknown",
        signatureKey: signatureKey || "",
        rawPayload,
        onlinePaymentId: onlinePayment?.id,
        isValid: false, // Will update after verification
      },
    });

    // Verify signature
    if (!verifySignature(orderId, statusCode, grossAmount, signatureKey)) {
      console.error("Midtrans webhook: invalid signature for", orderId);
      // Update log
      await prisma.midtransWebhookLog.updateMany({
        where: { orderId, isValid: false },
        data: {
          errorMessage: "Invalid signature",
          processedAt: new Date(),
        },
      });
      return Response.json(
        { status: "error", message: "Invalid signature" },
        { status: 403 },
      );
    }

    // Mark webhook as valid
    await prisma.midtransWebhookLog.updateMany({
      where: { orderId, isValid: false },
      data: { isValid: true },
    });

    if (!onlinePayment) {
      console.error("Midtrans webhook: order not found", orderId);
      return Response.json({ status: "ok" });
    }

    // Extract bank/VA info from webhook
    let bank: string | undefined;
    let vaNumber: string | undefined;
    let billKey: string | undefined;
    let billerCode: string | undefined;

    if (paymentType === "bank_transfer") {
      if (body.va_numbers?.[0]) {
        bank = body.va_numbers[0].bank;
        vaNumber = body.va_numbers[0].va_number;
      } else if (body.permata_va_number) {
        bank = "permata";
        vaNumber = body.permata_va_number;
      }
    } else if (paymentType === "echannel") {
      bank = "mandiri";
      billKey = body.bill_key;
      billerCode = body.biller_code;
    }

    // Handle based on transaction status
    switch (transactionStatus) {
      case "settlement":
      case "capture":
        await settleOnlinePayment(
          orderId,
          {
            paymentType,
            bank,
            vaNumber,
            billKey,
            billerCode,
            settlementTime,
            transactionTime,
            rawResponse: rawPayload,
          },
          prisma,
        );
        break;

      case "expire":
        await updateOnlinePaymentStatus(orderId, "EXPIRE", rawPayload, prisma);
        break;

      case "cancel":
        await updateOnlinePaymentStatus(orderId, "CANCEL", rawPayload, prisma);
        // Reverse any already-applied payments for this order (idempotent guard)
        if (onlinePayment.status === "SETTLEMENT") {
          await prisma.$transaction(async (tx) => {
            for (const item of onlinePayment.items) {
              assertSingleBillTarget({
                tuitionId: item.tuitionId,
                feeBillId: item.feeBillId,
                serviceFeeBillId: item.serviceFeeBillId,
              });
              const amount = new Prisma.Decimal(item.amount);
              if (item.feeBillId) {
                await reverseFeeBillPayment(tx, item.feeBillId, amount);
              } else if (item.serviceFeeBillId) {
                await reverseServiceFeeBillPayment(
                  tx,
                  item.serviceFeeBillId,
                  amount,
                );
              }
            }
          });
        }
        break;

      case "deny":
        await updateOnlinePaymentStatus(orderId, "DENY", rawPayload, prisma);
        break;

      case "failure":
        await updateOnlinePaymentStatus(orderId, "FAILURE", rawPayload, prisma);
        break;

      case "pending":
        // No-op — already pending
        break;
    }

    // Update webhook log as processed
    await prisma.midtransWebhookLog.updateMany({
      where: { orderId, isValid: true, processedAt: null },
      data: { processedAt: new Date() },
    });

    return Response.json({ status: "ok" });
  } catch (error) {
    console.error("Midtrans webhook error:", error);
    return Response.json({ status: "ok" });
  }
}

export default createApiHandler({ POST });
