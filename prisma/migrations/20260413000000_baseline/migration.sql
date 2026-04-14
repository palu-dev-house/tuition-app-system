-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";
-- CreateEnum
CREATE TYPE "public"."Month" AS ENUM ('JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER', 'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE');
-- CreateEnum
CREATE TYPE "public"."OnlinePaymentStatus" AS ENUM ('PENDING', 'SETTLEMENT', 'EXPIRE', 'CANCEL', 'DENY', 'FAILURE');
-- CreateEnum
CREATE TYPE "public"."PaymentFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMESTER');
-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('UNPAID', 'PAID', 'PARTIAL', 'VOID');
-- CreateEnum
CREATE TYPE "public"."RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');
-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('ADMIN', 'CASHIER');
-- CreateEnum
CREATE TYPE "public"."WhatsAppLogStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');
-- CreateTable
CREATE TABLE "public"."academic_years" (
    "id" TEXT NOT NULL,
    "year" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."class_academics" (
    "id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "class_name" TEXT NOT NULL,
    "payment_frequency" "public"."PaymentFrequency" NOT NULL DEFAULT 'MONTHLY',
    "monthly_fee" DECIMAL(10,2),
    "quarterly_fee" DECIMAL(10,2),
    "semester_fee" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "class_academics_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."discounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "reason" TEXT,
    "discount_amount" DECIMAL(10,2) NOT NULL,
    "target_periods" TEXT[],
    "academic_year_id" TEXT NOT NULL,
    "class_academic_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."employees" (
    "employee_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL DEFAULT 'CASHIER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employees_pkey" PRIMARY KEY ("employee_id")
);
-- CreateTable
CREATE TABLE "public"."idempotency_records" (
    "key" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" "public"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("key")
);
-- CreateTable
CREATE TABLE "public"."midtrans_webhook_logs" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "transaction_status" TEXT NOT NULL,
    "status_code" TEXT NOT NULL,
    "signature_key" TEXT NOT NULL,
    "raw_payload" TEXT NOT NULL,
    "is_valid" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "online_payment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "midtrans_webhook_logs_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."online_payment_items" (
    "id" TEXT NOT NULL,
    "online_payment_id" TEXT NOT NULL,
    "tuition_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "online_payment_items_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."online_payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "student_nis" TEXT NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "snap_token" TEXT,
    "snap_redirect_url" TEXT,
    "bank" TEXT,
    "va_number" TEXT,
    "bill_key" TEXT,
    "biller_code" TEXT,
    "payment_type" TEXT,
    "status" "public"."OnlinePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "midtrans_response" TEXT,
    "transaction_time" TIMESTAMP(3),
    "settlement_time" TIMESTAMP(3),
    "expiry_time" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "online_payments_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."payment_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "online_payment_enabled" BOOLEAN NOT NULL DEFAULT true,
    "maintenance_message" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    CONSTRAINT "payment_settings_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."payments" (
    "id" TEXT NOT NULL,
    "tuition_id" TEXT NOT NULL,
    "employee_id" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "scholarship_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "payment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "online_payment_id" TEXT,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."rate_limit_records" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "window_start" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" "public"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rate_limit_records_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."scholarships" (
    "id" TEXT NOT NULL,
    "student_nis" TEXT NOT NULL,
    "class_academic_id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Scholarship',
    "nominal" DECIMAL(10,2) NOT NULL,
    "is_full_scholarship" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "scholarships_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."student_classes" (
    "id" TEXT NOT NULL,
    "student_nis" TEXT NOT NULL,
    "class_academic_id" TEXT NOT NULL,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "student_classes_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."students" (
    "nis" TEXT NOT NULL,
    "nik" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "parent_name" TEXT NOT NULL,
    "parent_phone" TEXT NOT NULL,
    "start_join_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "has_account" BOOLEAN NOT NULL DEFAULT false,
    "password" TEXT,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "last_payment_at" TIMESTAMP(3),
    "account_created_at" TIMESTAMP(3),
    "account_created_by" TEXT,
    "account_deleted" BOOLEAN NOT NULL DEFAULT false,
    "account_deleted_at" TIMESTAMP(3),
    "account_deleted_by" TEXT,
    "account_deleted_reason" TEXT,
    CONSTRAINT "students_pkey" PRIMARY KEY ("nis")
);
-- CreateTable
CREATE TABLE "public"."tuitions" (
    "id" TEXT NOT NULL,
    "class_academic_id" TEXT NOT NULL,
    "student_nis" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "month" "public"."Month",
    "year" INTEGER NOT NULL,
    "fee_amount" DECIMAL(10,2) NOT NULL,
    "scholarship_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount_id" TEXT,
    "paid_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "public"."PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "due_date" TIMESTAMP(3) NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tuitions_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."whatsapp_logs" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "message_type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "public"."WhatsAppLogStatus" NOT NULL DEFAULT 'PENDING',
    "message_id" TEXT,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whatsapp_logs_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "academic_years_year_key" ON "public"."academic_years"("year" ASC);
-- CreateIndex
CREATE UNIQUE INDEX "class_academics_academic_year_id_grade_section_key" ON "public"."class_academics"("academic_year_id" ASC, "grade" ASC, "section" ASC);
-- CreateIndex
CREATE INDEX "discounts_academic_year_id_idx" ON "public"."discounts"("academic_year_id" ASC);
-- CreateIndex
CREATE INDEX "discounts_class_academic_id_idx" ON "public"."discounts"("class_academic_id" ASC);
-- CreateIndex
CREATE INDEX "discounts_is_active_idx" ON "public"."discounts"("is_active" ASC);
-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "public"."employees"("email" ASC);
-- CreateIndex
CREATE INDEX "idempotency_records_status_expires_at_idx" ON "public"."idempotency_records"("status" ASC, "expires_at" ASC);
-- CreateIndex
CREATE INDEX "midtrans_webhook_logs_created_at_idx" ON "public"."midtrans_webhook_logs"("created_at" ASC);
-- CreateIndex
CREATE INDEX "midtrans_webhook_logs_order_id_idx" ON "public"."midtrans_webhook_logs"("order_id" ASC);
-- CreateIndex
CREATE UNIQUE INDEX "online_payment_items_online_payment_id_tuition_id_key" ON "public"."online_payment_items"("online_payment_id" ASC, "tuition_id" ASC);
-- CreateIndex
CREATE INDEX "online_payment_items_tuition_id_idx" ON "public"."online_payment_items"("tuition_id" ASC);
-- CreateIndex
CREATE INDEX "online_payments_created_at_idx" ON "public"."online_payments"("created_at" ASC);
-- CreateIndex
CREATE INDEX "online_payments_expiry_time_idx" ON "public"."online_payments"("expiry_time" ASC);
-- CreateIndex
CREATE UNIQUE INDEX "online_payments_order_id_key" ON "public"."online_payments"("order_id" ASC);
-- CreateIndex
CREATE INDEX "online_payments_status_idx" ON "public"."online_payments"("status" ASC);
-- CreateIndex
CREATE INDEX "online_payments_student_nis_idx" ON "public"."online_payments"("student_nis" ASC);
-- CreateIndex
CREATE INDEX "payments_employee_id_idx" ON "public"."payments"("employee_id" ASC);
-- CreateIndex
CREATE INDEX "payments_online_payment_id_idx" ON "public"."payments"("online_payment_id" ASC);
-- CreateIndex
CREATE INDEX "payments_payment_date_idx" ON "public"."payments"("payment_date" ASC);
-- CreateIndex
CREATE INDEX "payments_tuition_id_idx" ON "public"."payments"("tuition_id" ASC);
-- CreateIndex
CREATE INDEX "rate_limit_records_action_identifier_status_idx" ON "public"."rate_limit_records"("action" ASC, "identifier" ASC, "status" ASC);
-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_records_key_key" ON "public"."rate_limit_records"("key" ASC);
-- CreateIndex
CREATE INDEX "rate_limit_records_status_expires_at_idx" ON "public"."rate_limit_records"("status" ASC, "expires_at" ASC);
-- CreateIndex
CREATE INDEX "scholarships_class_academic_id_idx" ON "public"."scholarships"("class_academic_id" ASC);
-- CreateIndex
CREATE INDEX "scholarships_student_nis_class_academic_id_idx" ON "public"."scholarships"("student_nis" ASC, "class_academic_id" ASC);
-- CreateIndex
CREATE INDEX "scholarships_student_nis_idx" ON "public"."scholarships"("student_nis" ASC);
-- CreateIndex
CREATE INDEX "student_classes_class_academic_id_idx" ON "public"."student_classes"("class_academic_id" ASC);
-- CreateIndex
CREATE UNIQUE INDEX "student_classes_student_nis_class_academic_id_key" ON "public"."student_classes"("student_nis" ASC, "class_academic_id" ASC);
-- CreateIndex
CREATE INDEX "student_classes_student_nis_idx" ON "public"."student_classes"("student_nis" ASC);
-- CreateIndex
CREATE INDEX "students_has_account_account_deleted_idx" ON "public"."students"("has_account" ASC, "account_deleted" ASC);
-- CreateIndex
CREATE INDEX "students_has_account_idx" ON "public"."students"("has_account" ASC);
-- CreateIndex
CREATE INDEX "students_last_payment_at_idx" ON "public"."students"("last_payment_at" ASC);
-- CreateIndex
CREATE UNIQUE INDEX "students_nik_key" ON "public"."students"("nik" ASC);
-- CreateIndex
CREATE INDEX "tuitions_class_academic_id_idx" ON "public"."tuitions"("class_academic_id" ASC);
-- CreateIndex
CREATE UNIQUE INDEX "tuitions_class_academic_id_student_nis_period_year_key" ON "public"."tuitions"("class_academic_id" ASC, "student_nis" ASC, "period" ASC, "year" ASC);
-- CreateIndex
CREATE INDEX "tuitions_discount_id_idx" ON "public"."tuitions"("discount_id" ASC);
-- CreateIndex
CREATE INDEX "tuitions_due_date_idx" ON "public"."tuitions"("due_date" ASC);
-- CreateIndex
CREATE INDEX "tuitions_period_idx" ON "public"."tuitions"("period" ASC);
-- CreateIndex
CREATE INDEX "tuitions_status_idx" ON "public"."tuitions"("status" ASC);
-- CreateIndex
CREATE INDEX "tuitions_student_nis_idx" ON "public"."tuitions"("student_nis" ASC);
-- CreateIndex
CREATE INDEX "whatsapp_logs_message_type_idx" ON "public"."whatsapp_logs"("message_type" ASC);
-- CreateIndex
CREATE INDEX "whatsapp_logs_phone_idx" ON "public"."whatsapp_logs"("phone" ASC);
-- CreateIndex
CREATE INDEX "whatsapp_logs_status_idx" ON "public"."whatsapp_logs"("status" ASC);
-- AddForeignKey
ALTER TABLE "public"."class_academics" ADD CONSTRAINT "class_academics_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."discounts" ADD CONSTRAINT "discounts_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."discounts" ADD CONSTRAINT "discounts_class_academic_id_fkey" FOREIGN KEY ("class_academic_id") REFERENCES "public"."class_academics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."midtrans_webhook_logs" ADD CONSTRAINT "midtrans_webhook_logs_online_payment_id_fkey" FOREIGN KEY ("online_payment_id") REFERENCES "public"."online_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."online_payment_items" ADD CONSTRAINT "online_payment_items_online_payment_id_fkey" FOREIGN KEY ("online_payment_id") REFERENCES "public"."online_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."online_payment_items" ADD CONSTRAINT "online_payment_items_tuition_id_fkey" FOREIGN KEY ("tuition_id") REFERENCES "public"."tuitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."online_payments" ADD CONSTRAINT "online_payments_student_nis_fkey" FOREIGN KEY ("student_nis") REFERENCES "public"."students"("nis") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_online_payment_id_fkey" FOREIGN KEY ("online_payment_id") REFERENCES "public"."online_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_tuition_id_fkey" FOREIGN KEY ("tuition_id") REFERENCES "public"."tuitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."scholarships" ADD CONSTRAINT "scholarships_class_academic_id_fkey" FOREIGN KEY ("class_academic_id") REFERENCES "public"."class_academics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."scholarships" ADD CONSTRAINT "scholarships_student_nis_fkey" FOREIGN KEY ("student_nis") REFERENCES "public"."students"("nis") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."student_classes" ADD CONSTRAINT "student_classes_class_academic_id_fkey" FOREIGN KEY ("class_academic_id") REFERENCES "public"."class_academics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."student_classes" ADD CONSTRAINT "student_classes_student_nis_fkey" FOREIGN KEY ("student_nis") REFERENCES "public"."students"("nis") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."tuitions" ADD CONSTRAINT "tuitions_class_academic_id_fkey" FOREIGN KEY ("class_academic_id") REFERENCES "public"."class_academics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."tuitions" ADD CONSTRAINT "tuitions_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."tuitions" ADD CONSTRAINT "tuitions_student_nis_fkey" FOREIGN KEY ("student_nis") REFERENCES "public"."students"("nis") ON DELETE CASCADE ON UPDATE CASCADE;
