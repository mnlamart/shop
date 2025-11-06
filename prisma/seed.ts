import { faker } from '@faker-js/faker'
import { UNCATEGORIZED_CATEGORY_ID } from '#app/utils/category.ts'
import { prisma } from '#app/utils/db.server.ts'
import { MOCK_CODE_GITHUB } from '#app/utils/providers/constants'
import { slugify } from '#app/utils/slug.ts'
import {
	createPassword,
	createUser,
	getNoteImages,
	getUserImages,
	getProductImages,
} from '#tests/db-utils.ts'
import { insertGitHubUser } from '#tests/mocks/github.ts'

// Product seeding helper functions
async function createCategory(name: string, parentId?: string, description?: string) {
	const slug = slugify(name)
	return await prisma.category.create({
		data: {
			name,
			slug,
			description: description || faker.lorem.sentence(),
			parentId,
		},
	})
}

async function createProduct(categoryId: string) {
	const name = faker.commerce.productName()
	const baseSlug = slugify(name)
	const slug = `${baseSlug}-${faker.string.alphanumeric(4)}`
	
	const product = await prisma.product.create({
		data: {
			name,
			slug,
			description: faker.commerce.productDescription() + '\n\n' + faker.lorem.paragraphs(2),
			sku: faker.string.alphanumeric(8).toUpperCase(),
			price: Math.round(Number(faker.commerce.price({ min: 10, max: 500, dec: 2 })) * 100), // Convert to cents
			status: faker.helpers.weightedArrayElement([
				{ weight: 20, value: 'DRAFT' },
				{ weight: 70, value: 'ACTIVE' },
				{ weight: 10, value: 'ARCHIVED' },
			]),
			weightGrams: faker.number.int({ min: 50, max: 5000 }), // Random weight between 50g and 5kg
			categoryId,
		},
	})

	// Create 2-5 images per product
	const imageCount = faker.number.int({ min: 2, max: 5 })
	const productImages = await getProductImages()

	for (let i = 0; i < imageCount; i++) {
		const randomImage = faker.helpers.arrayElement(productImages)
		await prisma.productImage.create({
			data: {
				productId: product.id,
				objectKey: randomImage.objectKey,
				altText: `${name} - Image ${i + 1}`,
				displayOrder: i,
			},
		})
	}

	// 40% chance of having variants
	if (faker.datatype.boolean({ probability: 0.4 })) {
		// Get attribute values for creating variants
		const sizeValues = await prisma.attributeValue.findMany({
			where: { attribute: { name: 'Size' } },
		})
		const colorValues = await prisma.attributeValue.findMany({
			where: { attribute: { name: 'Color' } },
		})
		
		// Create 2-6 variants
		const variantCount = faker.number.int({ min: 2, max: 6 })
		const usedCombinations = new Set<string>()
		
		for (let i = 0; i < variantCount; i++) {
			let sizeValue, colorValue, combination
			// Ensure unique size-color combinations
			do {
				sizeValue = faker.helpers.arrayElement(sizeValues)
				colorValue = faker.helpers.arrayElement(colorValues)
				combination = `${sizeValue.value}-${colorValue.value}`
			} while (usedCombinations.has(combination))
			
			usedCombinations.add(combination)
			
			await prisma.productVariant.create({
				data: {
					productId: product.id,
					sku: `${product.sku}-${combination}-${faker.string.alphanumeric(4)}`,
				price: Math.round(Number(faker.commerce.price({ 
					min: product.price * 0.8 / 100, // Convert from cents to dollars for comparison
					max: product.price * 1.2 / 100, 
					dec: 2 
				})) * 100), // Convert back to cents
					stockQuantity: faker.number.int({ min: 0, max: 100 }),
					// 30% chance variant has its own weight (different from product)
					weightGrams: faker.datatype.boolean({ probability: 0.3 })
						? faker.number.int({ min: 50, max: 5000 })
						: null,
					attributeValues: {
						create: [
							{ attributeValueId: sizeValue.id },
							{ attributeValueId: colorValue.id },
						],
					},
				},
			})
		}
	}

	return product
}

async function seedProductData() {
	// Create USD currency first
	const usdCurrency = await prisma.currency.upsert({
		where: { code: 'USD' },
		create: {
			code: 'USD',
			name: 'US Dollar',
			symbol: '$',
			decimals: 2,
		},
		update: {},
	})

	// Create Settings with USD as default currency
	await prisma.settings.upsert({
		where: { id: 'settings' },
		create: {
			id: 'settings',
			currencyId: usdCurrency.id,
		},
		update: {},
	})

	// Create Uncategorized category first with fixed ID
	await prisma.category.upsert({
		where: { id: UNCATEGORIZED_CATEGORY_ID },
		create: {
			id: UNCATEGORIZED_CATEGORY_ID,
			name: 'Uncategorized',
			slug: 'uncategorized',
			description: 'Products without a specific category',
		},
		update: {},
	})

	// Create attributes with their values
	await prisma.attribute.create({
		data: {
			name: 'Size',
			displayOrder: 0,
			values: {
				create: [
					{ value: 'XS', displayOrder: 0 },
					{ value: 'S', displayOrder: 1 },
					{ value: 'M', displayOrder: 2 },
					{ value: 'L', displayOrder: 3 },
					{ value: 'XL', displayOrder: 4 },
					{ value: 'XXL', displayOrder: 5 },
				],
			},
		},
	})

	await prisma.attribute.create({
		data: {
			name: 'Color',
			displayOrder: 1,
			values: {
				create: [
					{ value: 'Red', displayOrder: 0 },
					{ value: 'Blue', displayOrder: 1 },
					{ value: 'Green', displayOrder: 2 },
					{ value: 'Black', displayOrder: 3 },
					{ value: 'White', displayOrder: 4 },
					{ value: 'Navy', displayOrder: 5 },
					{ value: 'Gray', displayOrder: 6 },
				],
			},
		},
	})

	await prisma.attribute.create({
		data: {
			name: 'Material',
			displayOrder: 2,
			values: {
				create: [
					{ value: 'Cotton', displayOrder: 0 },
					{ value: 'Polyester', displayOrder: 1 },
					{ value: 'Wool', displayOrder: 2 },
					{ value: 'Silk', displayOrder: 3 },
					{ value: 'Leather', displayOrder: 4 },
				],
			},
		},
	})

	// Create categories with hierarchy
	const electronics = await createCategory('Electronics')
	const laptops = await createCategory('Laptops', electronics.id)
	const smartphones = await createCategory('Smartphones', electronics.id)
	
	const clothing = await createCategory('Clothing')
	const mens = await createCategory("Men's", clothing.id)
	const tshirts = await createCategory('T-Shirts', mens.id)
	const womens = await createCategory("Women's", clothing.id)
	
	const home = await createCategory('Home & Garden')
	const furniture = await createCategory('Furniture', home.id)
	const decor = await createCategory('Decor', home.id)

	// Create product tags
	const tags = [
		'bestseller', 'new-arrival', 'on-sale', 'eco-friendly', 'limited-edition',
		'trending', 'seasonal', 'premium', 'budget-friendly', 'handmade',
		'organic', 'vintage', 'modern', 'classic', 'innovative'
	]

	const createdTags = []
	for (const tagName of tags) {
		const tag = await prisma.productTag.create({
			data: { name: tagName },
		})
		createdTags.push(tag)
	}

	// Create products across categories
	const categories = [laptops, smartphones, tshirts, womens, furniture, decor]
	
	for (let i = 0; i < 40; i++) {
		const category = faker.helpers.arrayElement(categories)
		const product = await createProduct(category.id)
		
		// Assign 1-3 random tags to each product
		const productTags = faker.helpers.arrayElements(createdTags, { min: 1, max: 3 })
		for (const tag of productTags) {
			await prisma.productToTag.create({
				data: {
					productId: product.id,
					tagId: tag.id,
				},
			})
		}
	}
}

async function seed() {
	console.log('🌱 Seeding...')
	console.time(`🌱 Database has been seeded`)

	const totalUsers = 5
	console.time(`👤 Created ${totalUsers} users...`)
	const noteImages = await getNoteImages()
	const userImages = await getUserImages()

	for (let index = 0; index < totalUsers; index++) {
		const userData = createUser()
		const user = await prisma.user.create({
			select: { id: true },
			data: {
				...userData,
				password: { create: createPassword(userData.username) },
				roles: { connect: { name: 'user' } },
			},
		})

		// Upload user profile image
		const userImage = userImages[index % userImages.length]
		if (userImage) {
			await prisma.userImage.create({
				data: {
					userId: user.id,
					objectKey: userImage.objectKey,
				},
			})
		}

		// Create notes with images
		const notesCount = faker.number.int({ min: 1, max: 3 })
		for (let noteIndex = 0; noteIndex < notesCount; noteIndex++) {
			const note = await prisma.note.create({
				select: { id: true },
				data: {
					title: faker.lorem.sentence(),
					content: faker.lorem.paragraphs(),
					ownerId: user.id,
				},
			})

			// Add images to note
			const noteImageCount = faker.number.int({ min: 1, max: 3 })
			const selectedImages = faker.helpers.arrayElements(
				noteImages,
				noteImageCount,
			)
			await Promise.all(
				selectedImages.map((noteImage) =>
					prisma.noteImage.create({
						data: {
							noteId: note.id,
							altText: noteImage.altText,
							objectKey: noteImage.objectKey,
						},
					}),
				),
			)
		}
	}
	console.timeEnd(`👤 Created ${totalUsers} users...`)

	console.time(`🐨 Created admin user "kody"`)

	const kodyImages = {
		kodyUser: { objectKey: 'user/kody.png' },
		cuteKoala: {
			altText: 'an adorable koala cartoon illustration',
			objectKey: 'kody-notes/cute-koala.png',
		},
		koalaEating: {
			altText: 'a cartoon illustration of a koala in a tree eating',
			objectKey: 'kody-notes/koala-eating.png',
		},
		koalaCuddle: {
			altText: 'a cartoon illustration of koalas cuddling',
			objectKey: 'kody-notes/koala-cuddle.png',
		},
		mountain: {
			altText: 'a beautiful mountain covered in snow',
			objectKey: 'kody-notes/mountain.png',
		},
		koalaCoder: {
			altText: 'a koala coding at the computer',
			objectKey: 'kody-notes/koala-coder.png',
		},
		koalaMentor: {
			altText:
				'a koala in a friendly and helpful posture. The Koala is standing next to and teaching a woman who is coding on a computer and shows positive signs of learning and understanding what is being explained.',
			objectKey: 'kody-notes/koala-mentor.png',
		},
		koalaSoccer: {
			altText: 'a cute cartoon koala kicking a soccer ball on a soccer field ',
			objectKey: 'kody-notes/koala-soccer.png',
		},
	}

	const githubUser = await insertGitHubUser(MOCK_CODE_GITHUB)

	const kody = await prisma.user.create({
		select: { id: true },
		data: {
			email: 'kody@kcd.dev',
			username: 'kody',
			name: 'Kody',
			password: { create: createPassword('kodylovesyou') },
			connections: {
				create: {
					providerName: 'github',
					providerId: String(githubUser.profile.id),
				},
			},
			roles: { connect: [{ name: 'admin' }, { name: 'user' }] },
		},
	})

	await prisma.userImage.create({
		data: {
			userId: kody.id,
			objectKey: kodyImages.kodyUser.objectKey,
		},
	})

	// Create Kody's notes
	const kodyNotes = [
		{
			id: 'd27a197e',
			title: 'Basic Koala Facts',
			content:
				'Koalas are found in the eucalyptus forests of eastern Australia. They have grey fur with a cream-coloured chest, and strong, clawed feet, perfect for living in the branches of trees!',
			images: [kodyImages.cuteKoala, kodyImages.koalaEating],
		},
		{
			id: '414f0c09',
			title: 'Koalas like to cuddle',
			content:
				'Cuddly critters, koalas measure about 60cm to 85cm long, and weigh about 14kg.',
			images: [kodyImages.koalaCuddle],
		},
		{
			id: '260366b1',
			title: 'Not bears',
			content:
				"Although you may have heard people call them koala 'bears', these awesome animals aren't bears at all – they are in fact marsupials. A group of mammals, most marsupials have pouches where their newborns develop.",
			images: [],
		},
		{
			id: 'bb79cf45',
			title: 'Snowboarding Adventure',
			content:
				"Today was an epic day on the slopes! Shredded fresh powder with my friends, caught some sick air, and even attempted a backflip. Can't wait for the next snowy adventure!",
			images: [kodyImages.mountain],
		},
		{
			id: '9f4308be',
			title: 'Onewheel Tricks',
			content:
				"Mastered a new trick on my Onewheel today called '180 Spin'. It's exhilarating to carve through the streets while pulling off these rad moves. Time to level up and learn more!",
			images: [],
		},
		{
			id: '306021fb',
			title: 'Coding Dilemma',
			content:
				"Stuck on a bug in my latest coding project. Need to figure out why my function isn't returning the expected output. Time to dig deep, debug, and conquer this challenge!",
			images: [kodyImages.koalaCoder],
		},
		{
			id: '16d4912a',
			title: 'Coding Mentorship',
			content:
				"Had a fantastic coding mentoring session today with Sarah. Helped her understand the concept of recursion, and she made great progress. It's incredibly fulfilling to help others improve their coding skills.",
			images: [kodyImages.koalaMentor],
		},
		{
			id: '3199199e',
			title: 'Koala Fun Facts',
			content:
				"Did you know that koalas sleep for up to 20 hours a day? It's because their diet of eucalyptus leaves doesn't provide much energy. But when I'm awake, I enjoy munching on leaves, chilling in trees, and being the cuddliest koala around!",
			images: [],
		},
		{
			id: '2030ffd3',
			title: 'Skiing Adventure',
			content:
				'Spent the day hitting the slopes on my skis. The fresh powder made for some incredible runs and breathtaking views. Skiing down the mountain at top speed is an adrenaline rush like no other!',
			images: [kodyImages.mountain],
		},
		{
			id: 'f375a804',
			title: 'Code Jam Success',
			content:
				'Participated in a coding competition today and secured the first place! The adrenaline, the challenging problems, and the satisfaction of finding optimal solutions—it was an amazing experience. Feeling proud and motivated to keep pushing my coding skills further!',
			images: [kodyImages.koalaCoder],
		},
		{
			id: '562c541b',
			title: 'Koala Conservation Efforts',
			content:
				"Joined a local conservation group to protect koalas and their habitats. Together, we're planting more eucalyptus trees, raising awareness about their endangered status, and working towards a sustainable future for these adorable creatures. Every small step counts!",
			images: [],
		},
		{
			id: 'f67ca40b',
			title: 'Game day',
			content:
				"Just got back from the most amazing game. I've been playing soccer for a long time, but I've not once scored a goal. Well, today all that changed! I finally scored my first ever goal.\n\nI'm in an indoor league, and my team's not the best, but we're pretty good and I have fun, that's all that really matters. Anyway, I found myself at the other end of the field with the ball. It was just me and the goalie. I normally just kick the ball and hope it goes in, but the ball was already rolling toward the goal. The goalie was about to get the ball, so I had to charge. I managed to get possession of the ball just before the goalie got it. I brought it around the goalie and had a perfect shot. I screamed so loud in excitement. After all these years playing, I finally scored a goal!\n\nI know it's not a lot for most folks, but it meant a lot to me. We did end up winning the game by one. It makes me feel great that I had a part to play in that.\n\nIn this team, I'm the captain. I'm constantly cheering my team on. Even after getting injured, I continued to come and watch from the side-lines. I enjoy yelling (encouragingly) at my team mates and helping them be the best they can. I'm definitely not the best player by a long stretch. But I really enjoy the game. It's a great way to get exercise and have good social interactions once a week.\n\nThat said, it can be hard to keep people coming and paying dues and stuff. If people don't show up it can be really hard to find subs. I have a list of people I can text, but sometimes I can't find anyone.\n\nBut yeah, today was awesome. I felt like more than just a player that gets in the way of the opposition, but an actual asset to the team. Really great feeling.\n\nAnyway, I'm rambling at this point and really this is just so we can have a note that's pretty long to test things out. I think it's long enough now... Cheers!",
			images: [kodyImages.koalaSoccer],
		},
	]

	for (const noteData of kodyNotes) {
		const note = await prisma.note.create({
			select: { id: true },
			data: {
				id: noteData.id,
				title: noteData.title,
				content: noteData.content,
				ownerId: kody.id,
			},
		})

		for (const image of noteData.images) {
			await prisma.noteImage.create({
				data: {
					noteId: note.id,
					altText: image.altText,
					objectKey: image.objectKey,
				},
			})
		}
	}

	console.timeEnd(`🐨 Created admin user "kody"`)

	// Seed Product Data
	console.time(`🛍️ Created product data...`)
	await seedProductData()
	console.timeEnd(`🛍️ Created product data...`)

	// Seed Shipping Data
	console.time(`📦 Created shipping data...`)
	await seedShippingData()
	console.timeEnd(`📦 Created shipping data...`)

	console.timeEnd(`🌱 Database has been seeded`)
}

async function seedShippingData() {
	// Create shipping zones (using findFirst + create pattern since name is not unique)
	let europeZone = await prisma.shippingZone.findFirst({
		where: { name: 'Europe' },
	})
	if (!europeZone) {
		europeZone = await prisma.shippingZone.create({
			data: {
				name: 'Europe',
				description: 'European Union and European countries',
				countries: [
					'FR', 'BE', 'DE', 'IT', 'ES', 'NL', 'AT', 'PT', 'GR', 'IE',
					'FI', 'DK', 'SE', 'PL', 'CZ', 'HU', 'RO', 'BG', 'HR', 'SK',
					'SI', 'EE', 'LV', 'LT', 'LU', 'MT', 'CY',
				],
				isActive: true,
				displayOrder: 1,
			},
		})
	}

	let franceZone = await prisma.shippingZone.findFirst({
		where: { name: 'France' },
	})
	if (!franceZone) {
		franceZone = await prisma.shippingZone.create({
			data: {
				name: 'France',
				description: 'France only',
				countries: ['FR'],
				isActive: true,
				displayOrder: 0,
			},
		})
	}

	let internationalZone = await prisma.shippingZone.findFirst({
		where: { name: 'International' },
	})
	if (!internationalZone) {
		internationalZone = await prisma.shippingZone.create({
			data: {
				name: 'International',
				description: 'All other countries worldwide',
				countries: [], // Empty means all countries not in other zones
				isActive: true,
				displayOrder: 10,
			},
		})
	}

	// Create Mondial Relay carrier
	const mondialRelayCarrier = await prisma.carrier.upsert({
		where: { name: 'mondial_relay' },
		create: {
			name: 'mondial_relay',
			displayName: 'Mondial Relay',
			description: 'Mondial Relay shipping services',
			availableCountries: ['FR'],
			availableZoneIds: [franceZone.id],
			hasApiIntegration: true,
			apiProvider: 'mondial_relay',
			isActive: true,
			displayOrder: 0,
		},
		update: {},
	})

	// Create shipping methods for France zone
	await prisma.shippingMethod.upsert({
		where: {
			carrierId_name: {
				carrierId: mondialRelayCarrier.id,
				name: 'Mondial Relay Standard',
			},
		},
		create: {
			carrierId: mondialRelayCarrier.id,
			zoneId: franceZone.id,
			name: 'Mondial Relay Standard',
			description: 'Standard delivery to Point Relais® (3-5 business days)',
			rateType: 'FLAT',
			flatRate: 500, // €5.00 in cents
			isActive: true,
			displayOrder: 0,
			estimatedDays: 5,
		},
		update: {},
	})

	await prisma.shippingMethod.upsert({
		where: {
			carrierId_name: {
				carrierId: mondialRelayCarrier.id,
				name: 'Mondial Relay Express',
			},
		},
		create: {
			carrierId: mondialRelayCarrier.id,
			zoneId: franceZone.id,
			name: 'Mondial Relay Express',
			description: 'Express delivery to Point Relais® (1-2 business days)',
			rateType: 'FLAT',
			flatRate: 1000, // €10.00 in cents
			isActive: true,
			displayOrder: 1,
			estimatedDays: 2,
		},
		update: {},
	})

	// Create generic shipping methods for Europe zone
	// Note: For methods without carriers, we need to check existence manually
	// since Prisma's unique constraint with nullable fields doesn't work well with upsert
	const existingStandardEurope = await prisma.shippingMethod.findFirst({
		where: {
			zoneId: europeZone.id,
			name: 'Standard Shipping',
			carrierId: null,
		},
	})

	if (!existingStandardEurope) {
		await prisma.shippingMethod.create({
			data: {
				zoneId: europeZone.id,
				name: 'Standard Shipping',
				description: 'Standard shipping within Europe (5-7 business days)',
				rateType: 'FLAT',
				flatRate: 700, // €7.00 in cents
				isActive: true,
				displayOrder: 0,
				estimatedDays: 7,
			},
		})
	}

	const existingExpressEurope = await prisma.shippingMethod.findFirst({
		where: {
			zoneId: europeZone.id,
			name: 'Express Shipping',
			carrierId: null,
		},
	})

	if (!existingExpressEurope) {
		await prisma.shippingMethod.create({
			data: {
				zoneId: europeZone.id,
				name: 'Express Shipping',
				description: 'Express shipping within Europe (2-3 business days)',
				rateType: 'FLAT',
				flatRate: 1200, // €12.00 in cents
				isActive: true,
				displayOrder: 1,
				estimatedDays: 3,
			},
		})
	}

	// Create free shipping method for Europe (over €50)
	const existingFreeEurope = await prisma.shippingMethod.findFirst({
		where: {
			zoneId: europeZone.id,
			name: 'Free Shipping',
			carrierId: null,
		},
	})

	if (!existingFreeEurope) {
		await prisma.shippingMethod.create({
			data: {
				zoneId: europeZone.id,
				name: 'Free Shipping',
				description: 'Free shipping on orders over €50 (5-7 business days)',
				rateType: 'FREE',
				freeShippingThreshold: 5000, // €50.00 in cents
				isActive: true,
				displayOrder: 2,
				estimatedDays: 7,
			},
		})
	}

	// Create generic shipping method for International zone
	const existingInternational = await prisma.shippingMethod.findFirst({
		where: {
			zoneId: internationalZone.id,
			name: 'International Shipping',
			carrierId: null,
		},
	})

	if (!existingInternational) {
		await prisma.shippingMethod.create({
			data: {
				zoneId: internationalZone.id,
				name: 'International Shipping',
				description: 'Standard international shipping (10-14 business days)',
				rateType: 'FLAT',
				flatRate: 2000, // €20.00 in cents
				isActive: true,
				displayOrder: 0,
				estimatedDays: 14,
			},
		})
	}
}

seed()
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})

// we're ok to import from the test directory in this file
/*
eslint
	no-restricted-imports: "off",
*/
