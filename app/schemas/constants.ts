/**
 * Regular expression for validating slug format
 * Allows lowercase letters, numbers, and hyphens only
 */
export const SLUG_REGEX = /^[a-z0-9-]+$/

/**
 * Supported currencies for products
 */
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'] as const

/**
 * Product status options
 */
export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const

/**
 * Maximum file size for image uploads (5MB)
 */
export const MAX_UPLOAD_SIZE = 1024 * 1024 * 5 // 5MB

/**
 * Accepted MIME types for product images
 */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const