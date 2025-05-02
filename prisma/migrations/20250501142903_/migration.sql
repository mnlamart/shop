-- DropIndex
DROP INDEX "NoteImage_objectKey_key";

-- CreateIndex
CREATE INDEX "NoteImage_noteId_idx" ON "NoteImage"("noteId");
