import { Badge } from '#app/components/ui/badge.tsx'

/**
 * Product status badge component
 * 
 * @param status - Product status (ACTIVE, ARCHIVED, DRAFT)
 * @returns Badge component with appropriate styling based on status
 */
export function ProductStatusBadge({ status }: { status: string }) {
	if (status === 'ACTIVE') {
		return <Badge variant="success">Active</Badge>
	}
	if (status === 'ARCHIVED') {
		return <Badge variant="destructive">Archived</Badge>
	}
	return <Badge variant="secondary">Draft</Badge>
}

/**
 * Stock status badge component
 * 
 * @param stockQuantity - Current stock quantity
 * @returns Badge component with stock status (Out of Stock, Low Stock, In Stock)
 */
export function StockBadge({ stockQuantity }: { stockQuantity: number }) {
	if (stockQuantity === 0) {
		return <Badge variant="destructive">Out of Stock</Badge>
	}
	if (stockQuantity <= 10) {
		return <Badge variant="warning">Low Stock ({stockQuantity})</Badge>
	}
	return <Badge variant="success">In Stock ({stockQuantity})</Badge>
}

