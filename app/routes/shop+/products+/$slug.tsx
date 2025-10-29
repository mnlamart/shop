import { invariantResponse } from '@epic-web/invariant'
import { Link, redirect } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { addToCart, getOrCreateCartFromRequest } from '#app/utils/cart.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { type Route } from './+types/$slug.ts'

export async function loader({ params }: Route.LoaderArgs) {
	const product = await prisma.product.findUnique({
		where: {
			slug: params.slug,
		},
		include: {
			category: {
				select: { id: true, name: true, slug: true },
			},
			images: {
				select: { objectKey: true, altText: true },
				orderBy: { displayOrder: 'asc' },
			},
		},
	})

	invariantResponse(product, 'Product not found', { status: 404 })

	const currency = await getStoreCurrency()

	return { product, currency }
}

export async function action({ request, params }: Route.ActionArgs) {
	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'add-to-cart') {
		// Get product first to get its ID
		const product = await prisma.product.findUnique({
			where: { slug: params.slug },
			select: { id: true },
		})

		invariantResponse(product, 'Product not found', { status: 404 })

		// Get or create cart
		const { cart, needsCommit, cookieHeader } = await getOrCreateCartFromRequest(request)

		// Add product to cart
		const variantId = formData.get('variantId') as string | null
		const quantity = Number(formData.get('quantity') || '1')

		await addToCart(cart.id, product.id, variantId, quantity)

		// Redirect to cart page
		if (needsCommit && cookieHeader) {
			return redirect(`/shop/cart`, {
				headers: { 'Set-Cookie': cookieHeader },
			})
		}

		return redirect(`/shop/cart`)
	}

	invariantResponse(false, 'Bad Request', { status: 400 })
}

export const meta: Route.MetaFunction = ({ data }) => {
	const product = data?.product
	if (!product) return [{ title: 'Product Not Found | Shop | Epic Shop' }]
	return [{ title: `${product.name} | Products | Shop | Epic Shop` }]
}

export default function ProductSlug({ loaderData }: Route.ComponentProps) {
	const { product, currency } = loaderData

	return (
		<div className="container mx-auto px-4 py-8">
			<div className="grid gap-8 md:grid-cols-2">
				{/* Product Images */}
				<div>
					{product.images && product.images.length > 0 && product.images[0] ? (
						<img
							src={`/resources/images?objectKey=${encodeURIComponent(product.images[0].objectKey)}`}
							alt={product.images[0].altText || product.name}
							className="w-full rounded-lg border"
						/>
					) : (
						<div className="aspect-square w-full rounded-lg border bg-muted flex items-center justify-center">
							<span className="text-muted-foreground">No image</span>
						</div>
					)}
				</div>

				{/* Product Details */}
				<div className="space-y-6">
					<div>
						<h1 className="text-4xl font-bold tracking-tight">{product.name}</h1>
						<p className="text-muted-foreground mt-2">{product.category.name}</p>
					</div>

					<div>
						<p className="text-3xl font-bold">{formatPrice(product.price, currency)}</p>
					</div>

					{product.description && (
						<div>
							<h2 className="text-lg font-semibold mb-2">Description</h2>
							<p className="text-muted-foreground whitespace-pre-wrap">{product.description}</p>
						</div>
					)}

					<form method="post" className="space-y-4">
						<input type="hidden" name="intent" value="add-to-cart" />
						<Button type="submit" size="lg" className="w-full">
							Add to Cart
						</Button>
					</form>

					<div className="pt-4 border-t">
						<Link to="/shop/products" className="text-sm text-muted-foreground hover:underline">
							← Back to Products
						</Link>
					</div>
				</div>
			</div>
		</div>
	)
}

