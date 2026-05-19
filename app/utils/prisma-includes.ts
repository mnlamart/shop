import { Prisma } from '@prisma/client'

export const productImagesOrderedInclude = Prisma.validator<Prisma.ProductInclude>()({
	images: { orderBy: { displayOrder: 'asc' } },
})

export const variantsWithAttributesInclude = Prisma.validator<Prisma.ProductInclude>()({
	variants: {
		include: {
			attributeValues: {
				include: {
					attributeValue: {
						include: { attribute: true },
					},
				},
			},
		},
	},
})

export const orderItemsWithVariantInclude = Prisma.validator<Prisma.OrderInclude>()({
	items: {
		include: {
			product: {
				select: {
					id: true,
					name: true,
					slug: true,
					images: {
						select: {
							objectKey: true,
							altText: true,
						},
						orderBy: { displayOrder: 'asc' },
						take: 1,
					},
				},
			},
			variant: {
				include: {
					attributeValues: {
						include: {
							attributeValue: {
								include: {
									attribute: true,
								},
							},
						},
					},
				},
			},
		},
	},
})
