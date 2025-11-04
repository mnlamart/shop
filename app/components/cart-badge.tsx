import { Link } from 'react-router'
import { Icon } from './ui/icon.tsx'

export function CartBadge({ count }: { count: number }) {
	return (
		<Link
			to="/shop/cart"
			className="relative flex items-center justify-center"
			aria-label={`Shopping cart with ${count} item${count !== 1 ? 's' : ''}`}
		>
			<Icon name="shopping-cart" className="h-6 w-6" />
			{count > 0 && (
				<span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
					{count}
				</span>
			)}
		</Link>
	)
}

