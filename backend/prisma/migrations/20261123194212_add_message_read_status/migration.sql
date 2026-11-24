-- AlterTable
ALTER TABLE "Story" ADD COLUMN "musicArtist" TEXT;
ALTER TABLE "Story" ADD COLUMN "musicCover" TEXT;
ALTER TABLE "Story" ADD COLUMN "musicStartTime" INTEGER;
ALTER TABLE "Story" ADD COLUMN "musicTitle" TEXT;
ALTER TABLE "Story" ADD COLUMN "musicUrl" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Message" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "content" TEXT NOT NULL,
    "senderId" INTEGER NOT NULL,
    "receiverId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" DATETIME,
    "sharedPostId" INTEGER,
    CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_sharedPostId_fkey" FOREIGN KEY ("sharedPostId") REFERENCES "Post" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Message" ("content", "createdAt", "id", "receiverId", "senderId", "sharedPostId") SELECT "content", "createdAt", "id", "receiverId", "senderId", "sharedPostId" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
CREATE INDEX "Message_senderId_receiverId_createdAt_idx" ON "Message"("senderId", "receiverId", "createdAt");
CREATE INDEX "Message_receiverId_isRead_createdAt_idx" ON "Message"("receiverId", "isRead", "createdAt");
CREATE INDEX "Message_sharedPostId_idx" ON "Message"("sharedPostId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
