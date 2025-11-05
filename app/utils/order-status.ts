/**
 * Order status utility functions
 */

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'

/**
 * Gets the badge variant for an order status
 * 
 * @param status - Order status
 * @returns Badge variant name
 */
export function getOrderStatusBadgeVariant(status: string): 'warning' | 'default' | 'secondary' | 'success' | 'destructive' {
	switch (status) {
		case 'PENDING':
			return 'warning'
		case 'CONFIRMED':
			return 'default'
		case 'SHIPPED':
			return 'secondary'
		case 'DELIVERED':
			return 'success'
		case 'CANCELLED':
			return 'destructive'
		default:
			return 'secondary'
	}
}

/**
 * Gets the human-readable label for an order status
 * 
 * @param status - Order status
 * @returns Human-readable status label
 */
export function getOrderStatusLabel(status: string): string {
	switch (status) {
		case 'PENDING':
			return 'Pending'
		case 'CONFIRMED':
			return 'Confirmed'
		case 'SHIPPED':
			return 'Shipped'
		case 'DELIVERED':
			return 'Delivered'
		case 'CANCELLED':
			return 'Cancelled'
		default:
			return status
	}
}

