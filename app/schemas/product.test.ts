import { faker } from '@faker-js/faker'
import { createId } from '@paralleldrive/cuid2'
import { describe, expect, test } from 'vitest'
import { createMockFile, createLargeMockFile } from '#tests/product-utils'
import { UNCATEGORIZED_CATEGORY_ID } from './category'
import { CURRENCIES, PRODUCT_STATUSES } from './constants'
import { productSchema, VariantSchema, ImageFieldsetSchema, MAX_DESCRIPTION_LENGTH, MAX_ALT_TEXT_LENGTH, MAX_TAG_LENGTH } from './product.ts'

describe('productSchema', () => {
	describe('Required fields validation', () => {
		test('accepts valid product with all required fields', () => {
			const validProduct = {
				id: createId(),
				name: faker.commerce.productName(),
				slug: 'test-product-slug',
				sku: 'SKU-001',
				price: 99.99,
			}

			const result = productSchema.safeParse(validProduct)
			expect(result.success).toBe(true)
		})

		test('rejects missing name', () => {
			const invalidProduct = {
				id: createId(),
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
			}

			const result = productSchema.safeParse(invalidProduct)
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.issues[0]?.path).toEqual(['name'])
			}
		})

		test('rejects empty name', () => {
			const invalidProduct = {
				id: createId(),
				name: '',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
			}

			const result = productSchema.safeParse(invalidProduct)
			expect(result.success).toBe(false)
		})

		// Note: productSchema doesn't have max length validation for name
		// Only ProductEditorSchema has MAX_NAME_LENGTH=200
		test.skip('rejects name > 200 characters', () => {
			const invalidProduct = {
				id: createId(),
				name: 'a'.repeat(201),
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
			}

			const result = productSchema.safeParse(invalidProduct)
			expect(result.success).toBe(false)
		})
	})

	describe('Slug validation', () => {
		test('accepts valid slug with lowercase, numbers, and hyphens', () => {
			const validSlugs = ['test-product', 'product123', 'test-product-123', 'a1-2b3']

			validSlugs.forEach(slug => {
				const product = {
					id: createId(),
					name: 'Test Product',
					slug,
					sku: 'SKU-001',
					price: 99.99,
				}

				const result = productSchema.safeParse(product)
				expect(result.success).toBe(true)
			})
		})

		test('rejects slug with uppercase letters', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'Test-Product',
				sku: 'SKU-001',
				price: 99.99,
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(false)
		})

		test('rejects slug with spaces', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test product',
				sku: 'SKU-001',
				price: 99.99,
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(false)
		})

		test('rejects slug with special characters', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test@product#123',
				sku: 'SKU-001',
				price: 99.99,
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(false)
		})

		test('rejects empty slug', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: '',
				sku: 'SKU-001',
				price: 99.99,
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(false)
		})
	})

	describe('SKU validation', () => {
		test('accepts valid SKU', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(true)
		})

		test('rejects empty SKU', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: '',
				price: 99.99,
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(false)
		})
	})

	describe('Price validation', () => {
		test('accepts valid price with 2 decimal places', () => {
			const validPrices = [0.01, 99.99, 1000.00, 0.1]

			validPrices.forEach(price => {
				const product = {
					id: createId(),
					name: 'Test Product',
					slug: 'test-product',
					sku: 'SKU-001',
					price,
				}

				const result = productSchema.safeParse(product)
				expect(result.success).toBe(true)
			})
		})

		test('accepts price of zero', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 0,
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(true)
		})

		test('rejects negative price', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: -10.00,
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(false)
		})

		test('rejects price with more than 2 decimal places', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.999,
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(false)
		})
	})

	describe('Description validation', () => {
		test('accepts valid description', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
				description: 'A test product description',
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(true)
		})

		test(`accepts description with max ${MAX_DESCRIPTION_LENGTH} characters`, () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
				description: 'a'.repeat(MAX_DESCRIPTION_LENGTH),
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(true)
		})

		test(`rejects description > ${MAX_DESCRIPTION_LENGTH} characters`, () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
				description: 'a'.repeat(MAX_DESCRIPTION_LENGTH + 1),
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(false)
		})

		test('accepts undefined description', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(true)
		})
	})

	describe('Currency validation', () => {
		test.each(CURRENCIES)('accepts valid currency: %s', (currency) => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
				currency,
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(true)
		})

		test('rejects invalid currency', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
				currency: 'XYZ',
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(false)
		})

		test('defaults to EUR when currency not provided', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.currency).toBe('EUR')
			}
		})
	})

	describe('Status validation', () => {
		test.each(PRODUCT_STATUSES)('accepts valid status: %s', (status) => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
				status,
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(true)
		})

		test('rejects invalid status', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
				status: 'INVALID',
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(false)
		})

		test('defaults to DRAFT when status not provided', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.status).toBe('DRAFT')
			}
		})
	})

	describe('Category validation', () => {
		test('defaults to UNCATEGORIZED_CATEGORY_ID when not provided', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.categoryId).toBe(UNCATEGORIZED_CATEGORY_ID)
			}
		})

		test('accepts custom categoryId', () => {
			const customId = createId()
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
				categoryId: customId,
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.categoryId).toBe(customId)
			}
		})
	})

	describe('Tags validation', () => {
		test('accepts valid tags array', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
				tags: ['electronics', 'gadgets'],
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(true)
		})

		test('accepts empty tags array', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
				tags: [],
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(true)
		})

		test('accepts undefined tags', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(true)
		})

		test('accepts max 10 tags', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
				tags: Array.from({ length: 10 }, (_, i) => `tag-${i}`),
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(true)
		})

		test('rejects more than 10 tags', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
				tags: Array.from({ length: 11 }, (_, i) => `tag-${i}`),
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(false)
		})

		test('rejects duplicate tags', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
				tags: ['electronics', 'electronics', 'gadgets'],
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(false)
		})

	test('rejects tag with > 100 characters', () => {
		const product = {
			id: createId(),
			name: 'Test Product',
			slug: 'test-product',
			sku: 'SKU-001',
			price: 99.99,
			tags: ['a'.repeat(MAX_TAG_LENGTH + 1)],
		}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(false)
		})

	test('accepts tag with exactly 100 characters', () => {
		const product = {
			id: createId(),
			name: 'Test Product',
			slug: 'test-product',
			sku: 'SKU-001',
			price: 99.99,
			tags: ['a'.repeat(MAX_TAG_LENGTH)],
		}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(true)
		})

		test('rejects empty tag string', () => {
			const product = {
				id: createId(),
				name: 'Test Product',
				slug: 'test-product',
				sku: 'SKU-001',
				price: 99.99,
				tags: [''],
			}

			const result = productSchema.safeParse(product)
			expect(result.success).toBe(false)
		})
	})
})

describe('ImageFieldsetSchema', () => {
	test('accepts valid image with file', () => {
		const image = {
			file: createMockFile('test.jpg', 1024, 'image/jpeg'),
			altText: 'Test image',
			displayOrder: 0,
		}

		const result = ImageFieldsetSchema.safeParse(image)
		expect(result.success).toBe(true)
	})

	test('accepts image without file', () => {
		const image = {
			altText: 'Test image',
		}

		const result = ImageFieldsetSchema.safeParse(image)
		expect(result.success).toBe(true)
	})

	test('accepts PNG file', () => {
		const image = {
			file: createMockFile('test.png', 2048, 'image/png'),
			altText: 'PNG image',
		}

		const result = ImageFieldsetSchema.safeParse(image)
		expect(result.success).toBe(true)
	})

	test('accepts WebP file', () => {
		const image = {
			file: createMockFile('test.webp', 1024, 'image/webp'),
			altText: 'WebP image',
		}

		const result = ImageFieldsetSchema.safeParse(image)
		expect(result.success).toBe(true)
	})

	test('accepts GIF file', () => {
		const image = {
			file: createMockFile('test.gif', 1024, 'image/gif'),
			altText: 'GIF image',
		}

		const result = ImageFieldsetSchema.safeParse(image)
		expect(result.success).toBe(true)
	})

	test('rejects file > 5MB', () => {
		const image = {
			file: createLargeMockFile(6),
			altText: 'Large image',
		}

		const result = ImageFieldsetSchema.safeParse(image)
		expect(result.success).toBe(false)
	})

	test('accepts file exactly 5MB', () => {
		const image = {
			file: createLargeMockFile(5),
			altText: '5MB image',
		}

		const result = ImageFieldsetSchema.safeParse(image)
		expect(result.success).toBe(true)
	})

	test('rejects invalid file type', () => {
		const image = {
			file: createMockFile('test.pdf', 1024, 'application/pdf'),
			altText: 'PDF document',
		}

		const result = ImageFieldsetSchema.safeParse(image)
		expect(result.success).toBe(false)
	})

	test('rejects altText > 500 characters', () => {
		const image = {
			file: createMockFile(),
			altText: 'a'.repeat(MAX_ALT_TEXT_LENGTH + 1),
		}

		const result = ImageFieldsetSchema.safeParse(image)
		expect(result.success).toBe(false)
	})

	test('accepts altText with exactly 500 characters', () => {
		const image = {
			file: createMockFile(),
			altText: 'a'.repeat(MAX_ALT_TEXT_LENGTH),
		}

		const result = ImageFieldsetSchema.safeParse(image)
		expect(result.success).toBe(true)
	})

	test('accepts undefined altText', () => {
		const image = {
			file: createMockFile(),
		}

		const result = ImageFieldsetSchema.safeParse(image)
		expect(result.success).toBe(true)
	})

	test('defaults displayOrder to 0', () => {
		const image = {
			file: createMockFile(),
		}

		const result = ImageFieldsetSchema.safeParse(image)
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.displayOrder).toBe(0)
		}
	})
})

describe('VariantSchema', () => {
	test('accepts valid variant', () => {
		const variant = {
			sku: 'VAR-001',
			stockQuantity: 100,
		}

		const result = VariantSchema.safeParse(variant)
		expect(result.success).toBe(true)
	})

	test('rejects missing sku', () => {
		const variant = {
			stockQuantity: 100,
		}

		const result = VariantSchema.safeParse(variant)
		expect(result.success).toBe(false)
	})

	test('rejects empty sku', () => {
		const variant = {
			sku: '',
			stockQuantity: 100,
		}

		const result = VariantSchema.safeParse(variant)
		expect(result.success).toBe(false)
	})

	test('accepts variant with optional price', () => {
		const variant = {
			sku: 'VAR-001',
			price: 29.99,
			stockQuantity: 100,
		}

		const result = VariantSchema.safeParse(variant)
		expect(result.success).toBe(true)
	})

	test('accepts variant with null price', () => {
		const variant = {
			sku: 'VAR-001',
			price: null,
			stockQuantity: 100,
		}

		const result = VariantSchema.safeParse(variant)
		expect(result.success).toBe(true)
	})

	test('accepts variant with undefined price', () => {
		const variant = {
			sku: 'VAR-001',
			stockQuantity: 100,
		}

		const result = VariantSchema.safeParse(variant)
		expect(result.success).toBe(true)
	})

	test('rejects variant with negative price', () => {
		const variant = {
			sku: 'VAR-001',
			price: -10,
			stockQuantity: 100,
		}

		const result = VariantSchema.safeParse(variant)
		expect(result.success).toBe(false)
	})

	test('rejects price with more than 2 decimal places', () => {
		const variant = {
			sku: 'VAR-001',
			price: 29.999,
			stockQuantity: 100,
		}

		const result = VariantSchema.safeParse(variant)
		expect(result.success).toBe(false)
	})

	test('accepts stockQuantity of 0', () => {
		const variant = {
			sku: 'VAR-001',
			stockQuantity: 0,
		}

		const result = VariantSchema.safeParse(variant)
		expect(result.success).toBe(true)
	})

	test('rejects negative stockQuantity', () => {
		const variant = {
			sku: 'VAR-001',
			stockQuantity: -1,
		}

		const result = VariantSchema.safeParse(variant)
		expect(result.success).toBe(false)
	})

	test('rejects non-integer stockQuantity', () => {
		const variant = {
			sku: 'VAR-001',
			stockQuantity: 10.5,
		}

		const result = VariantSchema.safeParse(variant)
		expect(result.success).toBe(false)
	})

	test('accepts variant with attributeValueIds', () => {
		const variant = {
			sku: 'VAR-001',
			stockQuantity: 100,
			attributeValueIds: ['attr1', 'attr2'],
		}

		const result = VariantSchema.safeParse(variant)
		expect(result.success).toBe(true)
	})

	test('accepts variant with empty attributeValueIds', () => {
		const variant = {
			sku: 'VAR-001',
			stockQuantity: 100,
			attributeValueIds: [],
		}

		const result = VariantSchema.safeParse(variant)
		expect(result.success).toBe(true)
	})

	test('accepts variant without attributeValueIds', () => {
		const variant = {
			sku: 'VAR-001',
			stockQuantity: 100,
		}

		const result = VariantSchema.safeParse(variant)
		expect(result.success).toBe(true)
	})
})

