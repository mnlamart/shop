import { invariantResponse } from '@epic-web/invariant'
import { data, Link, redirect } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { getOrCreateCartFromRequest, updateCartItemQuantity, removeFromCart } from '#app/utils/cart.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { type Route } from './+types/cart.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const { cart, needsCommit, cookieHeader } = await getOrCreateCartFromRequest(request)

	if (!cart) {
		const currency = await getStoreCurrency()
		return { 
			cart: null, 
			items: [],
			currency
		}
	}

	// Get full product details for each cart item
	const items = (await Promise.all(
		cart.items.map(async (item) => {
			const product = await prisma.product.findUnique({
				where: { id: item.productId },
				select: {
					id: true,
					name: true,
					slug: true,
					price: true,
					images: {
						select: { objectKey: true, altText: true },
						orderBy: { displayOrder: 'asc' },
						take: 1,
					},
				},
			})
			if (!product) return null
			
			return {
				...item,
				product,
			}
		}),
	)).filter((item) => item !== null)

	const currency = await getStoreCurrency()
	const responseData = { cart, items, currency }
	
	if (needsCommit && cookieHeader) {
		return data(responseData, {
			headers: {
				'Set-Cookie': cookieHeader
			}
		})
	}
	
	return responseData
}

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData()
	const intent = formData.get('intent')

	const { cart, needsCommit, cookieHeader } = await getOrCreateCartFromRequest(request)
	invariantResponse(cart, 'Cart not found', { status: 404 })

	if (intent === 'update-quantity') {
		const itemId = formData.get('itemId') as string
		const quantity = Number(formData.get('quantity'))

		invariantResponse(quantity > 0, 'Quantity must be greater than 0', { status: 400 })

		await updateCartItemQuantity(itemId, quantity)

		const redirectHeaders = needsCommit && cookieHeader ? { 'Set-Cookie': cookieHeader } : undefined
		return redirect('/shop/cart', redirectHeaders ? { headers: redirectHeaders } : {})
	}

	if (intent === 'remove-item') {
		const itemId = formData.get('itemId') as string

		await removeFromCart(itemId)

		const redirectHeaders = needsCommit && cookieHeader ? { 'Set-Cookie': cookieHeader } : undefined
		return redirect('/shop/cart', redirectHeaders ? { headers: redirectHeaders } : {})
	}

	invariantResponse(false, 'Invalid intent', { status: 400 })
}

export const meta: Route.MetaFunction = () => [{ title: 'Shopping Cart | Shop | Epic Shop' }]

export default function Cart({ loaderData }: Route.ComponentProps) {
	const { cart, items, currency } = loaderData

	if (!cart || items.length === 0) {
		return (
			<div className="container py-8">
				<h1 className="text-3xl font-bold tracking-tight mb-6">Shopping Cart</h1>
				<div className="text-center py-12">
					<p className="text-muted-foreground text-lg mb-4">Your cart is empty</p>
					<Link to="/shop/products">
						<Button>Continue Shopping</Button>
					</Link>
				</div>
			</div>
		)
	}

	const total = items.reduce((sum, item) => {
		return sum + item.product.price * item.quantity
	}, 0)

	return (
		<div className="container py-8">
			<h1 className="text-3xl font-bold tracking-tight mb-6">Shopping Cart</h1>

			<div className="grid gap-8 lg:grid-cols-3">
				<div className="lg:col-span-2">
					<div className="space-y-4">
						{items.map((item) => (
							<div key={item.id} className="border rounded-lg p-4 flex gap-4">
								{item.product?.images[0] && (
									<img
										src={`/resources/images?objectKey=${encodeURIComponent(item.product.images[0].objectKey)}`}
										alt={item.product.images[0].altText || item.product.name}
										className="w-20 h-20 object-cover rounded"
									/>
								)}

								<div className="flex-1">
									<h3 className="font-semibold">{item.product?.name}</h3>
									<p className="text-muted-foreground">{formatPrice(item.product.price, currency)}</p>

									<form method="post" className="flex gap-2 items-center mt-2">
										<input type="hidden" name="intent" value="update-quantity" />
										<input type="hidden" name="itemId" value={item.id} />
										<Input
											type="number"
											name="quantity"
											defaultValue={item.quantity}
											min="1"
											className="w-20"
											aria-label="Quantity"
										/>
										<Button type="submit" size="sm">Update</Button>
										<Button
											type="submit"
											size="sm"
											variant="destructive"
											formMethod="post"
											formAction={undefined}
											onClick={(e) => {
												e.preventDefault()
												const form = e.currentTarget.closest('form')
												if (form) {
													const intentInput = form.querySelector('input[name="intent"]') as HTMLInputElement
													if (intentInput) intentInput.value = 'remove-item'
													form.requestSubmit()
												}
											}}
										>
											Remove
										</Button>
									</form>
								</div>
							</div>
						))}
					</div>
				</div>

				<div className="lg:col-span-1">
					<div className="border rounded-lg p-4 space-y-4">
						<h2 className="text-xl font-semibold">Order Summary</h2>
						<div className="flex justify-between text-lg">
							<span>Total:</span>
							<span className="font-bold">{formatPrice(total, currency)}</span>
						</div>
						<Button className="w-full" size="lg">
							Checkout
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
}

