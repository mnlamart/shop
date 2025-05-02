/*
  Warnings:

  - A unique constraint covering the columns `[objectKey]` on the table `NoteImage` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "NoteImage_objectKey_key" ON "NoteImage"("objectKey");
