-- AlterTable
ALTER TABLE "students" ADD COLUMN     "exit_reason" TEXT,
ADD COLUMN     "exited_at" TIMESTAMP(3),
ADD COLUMN     "exited_by" TEXT;

-- AlterTable
ALTER TABLE "tuitions" ADD COLUMN     "voided_by_exit" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "students_exited_at_idx" ON "students"("exited_at");
