/**
 * Convert a string to a URL-friendly slug
 * @param text - The text to convert to a slug
 * @returns A URL-friendly slug
 */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '') // Remove special characters
		.replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
		.replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
}

/**
 * Generate a unique slug by appending a random string
 * @param baseSlug - The base slug
 * @param randomLength - Length of random string to append (default: 4)
 * @returns A unique slug
 */
export function generateUniqueSlug(baseSlug: string, randomLength: number = 4): string {
	const random = Math.random().toString(36).substring(2, 2 + randomLength)
	return `${baseSlug}-${random}`
}
