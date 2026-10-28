-- AlterTable
ALTER TABLE "SprinPersonnel" ADD COLUMN "phone" TEXT;

-- CreateIndex
CREATE INDEX "SprinPersonnel_phone_idx" ON "SprinPersonnel"("phone");
