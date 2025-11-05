import { Badge } from '#app/components/ui/badge.tsx'
import { getOrderStatusBadgeVariant, getOrderStatusLabel } from '#app/utils/order-status.ts'

/**
 * Order status badge component
 * 
 * @param status - Order status
 * @param className - Optional additional CSS classes
 * @returns Badge component with appropriate styling based on order status
 */
export function OrderStatusBadge({ 
	status, 
	className 
}: { 
	status: string
	className?: string 
}) {
	return (
		<Badge
			variant={getOrderStatusBadgeVariant(status)}
			className={className}
		>
			{getOrderStatusLabel(status)}
		</Badge>
	)
}

