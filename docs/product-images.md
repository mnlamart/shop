# Product Image Fixture System

## Overview

Product images in development use a fixture-based system with high-quality placeholder images from [Picsum Photos](https://picsum.photos/). This approach ensures consistent, fast-loading images during development and testing while maintaining compatibility with production image storage.

## Architecture

### Development/Test Environment
- **Source**: Images served from `tests/fixtures/images/products/` via Tigris mock handler
- **Format**: 30 high-quality JPEG images at 800x600 resolution
- **Naming**: `0.jpg` through `29.jpg` for consistent indexing
- **Size Range**: 17KB to 124KB per image for good variety

### Production Environment
- **Source**: Real uploaded images stored in Tigris S3 storage
- **Path Structure**: `products/{productId}/images/{timestamp}-{fileId}.{ext}`
- **Access**: Served via signed URLs for security

### Image Route Handler
The `app/routes/resources+/images.tsx` route handles both environments transparently:
- Detects `objectKey` parameter to determine image source
- Routes fixture images through Tigris mock handler
- Routes production images through signed S3 URLs

## Implementation Details

### Fixture Image Management
```typescript
// tests/db-utils.ts
let productImages: Array<{ objectKey: string }> | undefined
export async function getProductImages() {
  if (productImages) return productImages

  productImages = await Promise.all(
    Array.from({ length: 30 }, (_, index) => ({
      objectKey: `products/${index}.jpg`,
    })),
  )

  return productImages
}
```

### Seeding Integration

**Note**: The product image system uses `displayOrder` to determine the primary image - the image with `displayOrder: 0` (the first/lowest) is considered the primary image by convention. The `isPrimary` boolean field has been removed in favor of this simpler approach.

```typescript
// prisma/seed.ts
const productImages = await getProductImages()
const randomImage = faker.helpers.arrayElement(productImages)

await prisma.productImage.create({
  data: {
    productId: product.id,
    objectKey: randomImage.objectKey, // e.g., "products/15.jpg"
    altText: `${name} - Image ${i + 1}`,
    displayOrder: i, // First image (displayOrder: 0) is the primary image by convention
  },
})
```

### Mock Handler Integration
The Tigris mock handler in `tests/mocks/tigris.ts` automatically serves fixture images:
```typescript
// Check tests/fixtures/images directory first
const testFixturesPath = path.join(FIXTURES_IMAGES_DIR, ...key)
let file: Buffer
try {
  file = await fs.readFile(testFixturesPath)
} catch {
  // If not found in test fixtures, try original path
  file = await fs.readFile(filePath)
}
```

## Benefits

### Performance
- **Fast Loading**: Images load instantly from local filesystem
- **No Network Dependencies**: No external API calls or CDN dependencies
- **Consistent Performance**: Predictable load times across all environments

### Development Experience
- **No Setup Required**: No environment variables or external services needed
- **Visual Variety**: 30 different high-quality images provide good testing variety
- **Easy Customization**: Replace fixture images with better ones at any time

### Production Compatibility
- **Same Code Path**: Development and production use identical image serving logic
- **Seamless Transition**: Real uploads automatically use Tigris storage
- **No Code Changes**: Switching between environments requires no code modifications

## File Structure

```
tests/fixtures/images/products/
├── 0.jpg          # High-quality placeholder image
├── 1.jpg          # Different image for variety
├── ...
├── 29.jpg         # 30th placeholder image
└── README.md      # Documentation for the fixture system
```

## Maintenance

### Adding New Images
1. Download new images to `tests/fixtures/images/products/`
2. Update the count in `getProductImages()` if adding more than 30
3. Restart development server to clear cache

### Replacing Images
1. Replace existing `{index}.jpg` files with new images
2. Ensure consistent naming (0.jpg through 29.jpg)
3. Restart development server to clear cache

### Image Sources
- **Current**: [Picsum Photos](https://picsum.photos/) - High-quality Unsplash images
- **Alternative Sources**: Any 800x600 JPEG images work
- **Format**: JPEG recommended for consistency and file size

## Troubleshooting

### Images Not Loading
1. **Check File Existence**: Ensure all 30 images exist in `tests/fixtures/images/products/`
2. **Clear Cache**: Restart development server to clear `getProductImages()` cache
3. **Check Mock Handler**: Verify Tigris mock handler is running in development

### Mixed Images (User + Product)
- **Cause**: Cached `getProductImages()` data from before fixture images were added
- **Solution**: Restart development server to clear cache
- **Prevention**: Always restart server after adding/modifying fixture images

### Performance Issues
- **Large Images**: Ensure images are optimized (current range: 17KB-124KB)
- **Too Many Images**: Consider reducing count if performance degrades
- **Network Issues**: Fixture system eliminates external dependencies

## Related Files

- `tests/db-utils.ts` - `getProductImages()` helper function
- `prisma/seed.ts` - Product image seeding logic
- `tests/mocks/tigris.ts` - Mock handler for fixture images
- `app/routes/resources+/images.tsx` - Image serving route
- `tests/fixtures/images/products/README.md` - Fixture directory documentation
