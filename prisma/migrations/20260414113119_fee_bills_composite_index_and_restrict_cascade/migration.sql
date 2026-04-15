-- DropForeignKey
ALTER TABLE "service_fee_bills" DROP CONSTRAINT "service_fee_bills_service_fee_id_fkey";

-- CreateIndex
CREATE INDEX "fee_bills_student_nis_status_idx" ON "fee_bills"("student_nis", "status");

-- CreateIndex
CREATE INDEX "service_fee_bills_student_nis_status_idx" ON "service_fee_bills"("student_nis", "status");

-- AddForeignKey
ALTER TABLE "service_fee_bills" ADD CONSTRAINT "service_fee_bills_service_fee_id_fkey" FOREIGN KEY ("service_fee_id") REFERENCES "service_fees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
