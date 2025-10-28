-- SQLite doesn't support ALTER TABLE with foreign key constraints.
-- We need to recreate the Product table with the proper constraints.

-- Step 1: Create new table with correct schema
CREATE TABLE "Product_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sku" TEXT NOT NULL,
    "price" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "categoryId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Step 2: Copy data from old table to new table
-- Update any NULL categoryId to the uncategorized category
INSERT INTO "Product_new" ("id", "name", "slug", "description", "sku", "price", "currency", "status", "categoryId", "createdAt", "updatedAt")
SELECT 
    "id", 
    "name", 
    "slug", 
    "description", 
    "sku", 
    "price", 
    "currency", 
    "status",
    COALESCE("categoryId", 'clr21zlz2000000xjh9kfaqx6') as "categoryId",
    "createdAt", 
    "updatedAt"
FROM "Product";

-- Step 3: Drop old table
DROP TABLE "Product";

-- Step 4: Rename new table to old table name
ALTER TABLE "Product_new" RENAME TO "Product";

-- Step 5: Recreate indexes
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");
CREATE INDEX "Product_status_idx" ON "Product"("status");
CREATE INDEX "Product_slug_idx" ON "Product"("slug");
CREATE INDEX "Product_sku_idx" ON "Product"("sku");
