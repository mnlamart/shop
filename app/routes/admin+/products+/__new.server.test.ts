import { Prisma } from '@prisma/client'
import { describe, expect, test } from 'vitest'
import { consoleError } from '#tests/setup/setup-test-env'
import { handlePrismaError } from './__new.server.tsx'

// Helper function copied from server file since it's not exported
function imageHasFile(
	image: { file?: File },
): image is { file: NonNullable<{ file?: File }['file']> } {
	return Boolean(image.file?.size && image.file?.size > 0)
}

describe('handlePrismaError', () => {
	describe('P2002 - Unique constraint violation', () => {
		test('returns slug error for slug violation', () => {
			consoleError.mockImplementation(() => {})
			const error = new Prisma.PrismaClientKnownRequestError(
				'Unique constraint failed',
				{
					code: 'P2002',
					clientVersion: '6.10.1',
					meta: {
						target: ['slug'],
					},
				},
			)

			const result = handlePrismaError(error)
			
		expect(result.fieldErrors?.slug).toEqual(['This slug already exists'])
		expect(result.formErrors).toContain('Validation error')
			expect(result.statusCode).toBe(400)
		})

		test('returns sku error for sku violation', () => {
			consoleError.mockImplementation(() => {})
			const error = new Prisma.PrismaClientKnownRequestError(
				'Unique constraint failed',
				{
					code: 'P2002',
					clientVersion: '6.10.1',
					meta: {
						target: ['sku'],
					},
				},
			)

			const result = handlePrismaError(error)
			
		expect(result.fieldErrors?.sku).toEqual(['This SKU already exists'])
		expect(result.formErrors).toContain('Validation error')
			expect(result.statusCode).toBe(400)
		})

		test('returns tags error for tagId violation', () => {
			consoleError.mockImplementation(() => {})
			const error = new Prisma.PrismaClientKnownRequestError(
				'Unique constraint failed',
				{
					code: 'P2002',
					clientVersion: '6.10.1',
					meta: {
						target: ['tagId'],
					},
				},
			)

		const result = handlePrismaError(error)
		
	expect(result.fieldErrors?.tags).toEqual(['A tag with this name already exists'])
	expect(result.formErrors).toContain('Validation error')
		expect(result.statusCode).toBe(400)
		})

		test('returns generic error when no specific target', () => {
			consoleError.mockImplementation(() => {})
			const error = new Prisma.PrismaClientKnownRequestError(
				'Unique constraint failed',
				{
					code: 'P2002',
					clientVersion: '6.10.1',
					meta: {
						target: ['unknownField'],
					},
				},
			)

			const result = handlePrismaError(error)
			
		expect(result.fieldErrors).toBeUndefined()
		expect(result.formErrors).toContain('Validation error')
			expect(result.statusCode).toBe(400)
		})
	})

	describe('P2003 - Foreign key constraint failed', () => {
		test('returns categoryId error for foreign key violation', () => {
			const error = new Prisma.PrismaClientKnownRequestError(
				'Foreign key constraint failed',
				{
					code: 'P2003',
					clientVersion: '6.10.1',
					meta: {
						field_name: 'categoryId',
					},
				},
			)

			const result = handlePrismaError(error)
			
		expect(result.fieldErrors?.categoryId).toEqual(['This category does not exist'])
		expect(result.formErrors).toContain('Validation error')
			expect(result.statusCode).toBe(400)
		})
	})

	describe('P2025 - Record not found', () => {
		test('returns 404 for record not found', () => {
			const error = new Prisma.PrismaClientKnownRequestError(
				'Record to update does not exist',
				{
					code: 'P2025',
					clientVersion: '6.10.1',
					meta: {},
				},
			)

			const result = handlePrismaError(error)
			
			expect(result.formErrors).toContain('Record not found')
			expect(result.statusCode).toBe(404)
		})
	})

	describe('PrismaClientValidationError', () => {
		test('returns validation error message', () => {
			const error = new Prisma.PrismaClientValidationError(
				'Invalid value for field',
				{ clientVersion: '6.10.1' }
			)

			const result = handlePrismaError(error)
			
			expect(result.formErrors).toContain('Invalid data. Please check required fields.')
			expect(result.statusCode).toBe(400)
		})
	})

	describe('PrismaClientUnknownRequestError', () => {
		test('returns 500 for unknown request error', () => {
			const error = new Prisma.PrismaClientUnknownRequestError(
				'Unknown database error',
				{ clientVersion: '6.10.1' }
			)

		const result = handlePrismaError(error)
		
		expect(result.formErrors).toContain('Database error. Please try again later.')
		expect(result.statusCode).toBe(500)
		})
	})

	describe('PrismaClientInitializationError', () => {
		test('returns 503 for initialization error', () => {
			const error = new Prisma.PrismaClientInitializationError(
				'Failed to initialize',
				'6.10.1'
			)

			const result = handlePrismaError(error)
			
			expect(result.formErrors).toContain('Service temporarily unavailable.')
			expect(result.statusCode).toBe(503)
		})
	})

	describe('PrismaClientRustPanicError', () => {
		test('returns 500 for Rust panic error', () => {
			const error = new Prisma.PrismaClientRustPanicError(
				'Rust panic occurred',
				'6.10.1'
			)

			const result = handlePrismaError(error)
			
			expect(result.formErrors).toContain('System error. Please restart the application.')
			expect(result.statusCode).toBe(500)
		})
	})

	describe('Unknown error', () => {
		test('returns generic error for unknown error types', () => {
			const error = new Error('Unknown error')

			const result = handlePrismaError(error)
			
			expect(result.formErrors).toContain('An unexpected error occurred')
			expect(result.statusCode).toBe(500)
		})
	})
})

describe('imageHasFile', () => {
	test('returns true when file has size > 0', () => {
		const mockFile = new File(['test content'], 'test.jpg', { type: 'image/jpeg' })
		const image = { file: mockFile }
		
		expect(imageHasFile(image)).toBe(true)
	})

	test('returns false when file is undefined', () => {
		const image = { file: undefined }
		
		expect(imageHasFile(image)).toBe(false)
	})

	test('returns false when file size is 0', () => {
		const mockFile = new File([], 'empty.jpg', { type: 'image/jpeg' })
		const image = { file: mockFile }
		
		expect(imageHasFile(image)).toBe(false)
	})
})

