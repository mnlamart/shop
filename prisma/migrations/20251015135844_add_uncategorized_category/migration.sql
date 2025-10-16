-- Update existing uncategorized category to have the fixed ID
-- First, we need to handle any existing products that might reference the old ID
-- This is a complex operation, so we'll do it in steps

-- Step 1: Create a temporary category with the fixed ID if it doesn't exist
INSERT OR IGNORE INTO "Category" ("id", "name", "slug", "description", "parentId", "createdAt", "updatedAt") 
VALUES (
  'uncategorized-category-id', 
  'Uncategorized', 
  'uncategorized', 
  'Default category for products without a specific category', 
  NULL, 
  datetime('now'), 
  datetime('now')
);

-- Step 2: Update any products that reference the old uncategorized category to use the new fixed ID
UPDATE "Product" 
SET "categoryId" = 'uncategorized-category-id' 
WHERE "categoryId" IN (
  SELECT "id" FROM "Category" 
  WHERE "slug" = 'uncategorized' AND "id" != 'uncategorized-category-id'
);

-- Step 3: Delete the old uncategorized category if it exists and is different from our fixed ID
DELETE FROM "Category" 
WHERE "slug" = 'uncategorized' AND "id" != 'uncategorized-category-id';