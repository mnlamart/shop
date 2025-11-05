import { Prisma } from '@prisma/client'
import * as Sentry from '@sentry/react-router'

/**
 * Result type for Prisma error handling
 */
export type PrismaErrorResult = {
	formErrors: string[]
	fieldErrors?: Record<string, string[]>
	statusCode: number
}

/**
 * Handles Prisma database errors and converts them to user-friendly error messages
 * 
 * @param error - The error object from Prisma operations
 * @returns Structured error result with form errors, field errors, and status code
 */
export function handlePrismaError(error: unknown): PrismaErrorResult {
	// Log unexpected Prisma errors to Sentry for monitoring
	const logToSentry = (error: unknown, context: string) => {
		Sentry.captureException(error, {
			tags: {
				context: 'prisma-error-handler',
				errorContext: context,
			},
		})
	}

	// 1. Known Prisma errors
	if (error instanceof Prisma.PrismaClientKnownRequestError) {
		const fieldErrors: Record<string, string[]> = {}

		switch (error.code) {
			case 'P2002': // Unique constraint violation
				if (error.meta && 'target' in error.meta) {
					const target = error.meta.target as string[]
					if (target.includes('slug')) {
						fieldErrors.slug = ['This slug already exists']
					}
					if (target.includes('sku')) {
						fieldErrors.sku = ['This SKU already exists']
					}
					if (target.includes('tagId')) {
						fieldErrors.tags = ['A tag with this name already exists']
					}
					if (target.includes('name')) {
						fieldErrors.name = ['This name already exists']
					}
				}
				break

			case 'P2003': // Foreign key constraint failed
				if (error.meta && 'field_name' in error.meta) {
					const fieldName = String(error.meta.field_name)
					if (fieldName.includes('categoryId')) {
						fieldErrors.categoryId = ['This category does not exist']
					} else if (fieldName.includes('parentId')) {
						fieldErrors.parentId = ['The selected parent does not exist']
					} else if (fieldName.includes('productId')) {
						fieldErrors.productId = ['This product does not exist']
					} else {
						fieldErrors[fieldName] = ['Invalid reference']
					}
				}
				break

			case 'P2025': // Record not found
				return {
					formErrors: ['Record not found'],
					statusCode: 404
				}
		}

		// Log known errors that we handle but want to monitor
		if (error.code === 'P2002' || error.code === 'P2003') {
			logToSentry(error, `known-error-${error.code}`)
		}

		return {
			formErrors: ['Validation error'],
			fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
			statusCode: 400
		}
	}

	// 2. Prisma validation errors
	if (error instanceof Prisma.PrismaClientValidationError) {
		logToSentry(error, 'validation-error')
		return {
			formErrors: ['Invalid data. Please check required fields.'],
			statusCode: 400
		}
	}

	// 3. Unknown Prisma errors
	if (error instanceof Prisma.PrismaClientUnknownRequestError) {
		logToSentry(error, 'unknown-request-error')
		return {
			formErrors: ['Database error. Please try again later.'],
			statusCode: 500
		}
	}

	// 4. Prisma initialization errors
	if (error instanceof Prisma.PrismaClientInitializationError) {
		logToSentry(error, 'initialization-error')
		return {
			formErrors: ['Service temporarily unavailable.'],
			statusCode: 503
		}
	}

	// 5. Rust panic errors (rare but possible)
	if (error instanceof Prisma.PrismaClientRustPanicError) {
		logToSentry(error, 'rust-panic-error')
		return {
			formErrors: ['System error. Please restart the application.'],
			statusCode: 500
		}
	}

	// 6. Generic error - log to Sentry as this is unexpected
	if (error instanceof Error) {
		logToSentry(error, 'generic-error')
	}

	return {
		formErrors: ['An unexpected error occurred'],
		statusCode: 500
	}
}

