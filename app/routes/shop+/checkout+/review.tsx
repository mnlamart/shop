import { Link, redirectDocument, useLoaderData } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { getCheckoutData } from '#app/utils/checkout.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { type Route } from './+types/review.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const checkoutData = await getCheckoutData(request)
	
	if (!checkoutData) {
		return redirectDocument('/shop/cart')
	}

	return {
		cart: checkoutData.cart,
		currency: checkoutData.currency,
		subtotal: checkoutData.subtotal,
	}
}

export default function CheckoutReview() {
	const loaderData = useLoaderData<typeof loader>()
	
	if (!loaderData) {
		return <div>Loading...</div>
	}
	
	const { cart, currency, subtotal } = loaderData

	return (
		<div className="space-y-6">
			<div className="rounded-lg border bg-card p-6">
				<h2 className="mb-4 text-xl font-semibold">Order Summary</h2>
				
				<div className="space-y-4">
					{cart.items.map((item) => {
						const price = item.variant?.price ?? item.product.price
						const image = item.product.images[0]
						
						return (
							<div key={item.id} className="flex items-center gap-4">
								{image && (
									<img
										src={`/images/${image.objectKey}`}
										alt={image.altText || item.product.name}
										className="h-20 w-20 rounded object-cover"
									/>
								)}
								<div className="flex-1">
									<h3 className="font-medium">{item.product.name}</h3>
									{item.variant && (
										<p className="text-sm text-muted-foreground">
											SKU: {item.variant.sku}
										</p>
									)}
									<p className="text-sm text-muted-foreground">
										Quantity: {item.quantity}
									</p>
								</div>
								<div className="text-right">
									<p className="font-medium">
										{formatPrice((price ?? 0) * item.quantity, currency)}
									</p>
								</div>
							</div>
						)
					})}
				</div>

				<div className="mt-6 border-t pt-4">
					<div className="flex justify-between text-lg font-semibold">
						<span>Subtotal</span>
						<span>{formatPrice(subtotal, currency)}</span>
					</div>
				</div>
			</div>

			<div className="flex justify-between">
				<Button variant="outline" asChild>
					<Link to="/shop/cart">Back to Cart</Link>
				</Button>
				<Button asChild>
					<Link to="/shop/checkout/shipping">Continue to Shipping</Link>
				</Button>
			</div>
		</div>
	)
}

