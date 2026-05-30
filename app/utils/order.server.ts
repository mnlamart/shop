/**
 * Order module — barrel file.
 *
 * Re-exports all order-related functions from their focused modules.
 * The original 1,405-line god module has been split into:
 *
 *   order-stock.server.ts       — Stock validation + errors (96 lines)
 *   order-queries.server.ts     — Read queries: getOrderById, getOrderByOrderNumber, getUserOrders, getGuestOrder (175 lines)
 *   order-status.server.ts      — Status transitions: updateOrderStatus (107 lines)
 *   order-creation.server.ts    — Stripe checkout → order creation (410 lines)
 *   order-cancellation.server.ts — Order cancellation + refund (205 lines)
 *   order-return.server.ts      — Return/refund processing (257 lines)
 *   order-invoice.server.ts     — Invoice creation within transactions (73 lines)
 *   order-admin.server.ts       — Admin paginated order listing (119 lines)
 */

// Stock validation
export {
	validateStockAvailability,
	StockValidationError,
	StockUnavailableError,
	type StockIssue,
} from './order-stock.server.ts'

// Order queries
export {
	getOrderById,
	getOrderByOrderNumber,
	getUserOrders,
	getGuestOrder,
	getOrderByCheckoutSessionId,
} from './order-queries.server.ts'

// Order status
export {
	updateOrderStatus,
} from './order-status.server.ts'

// Order creation (Stripe)
export {
	createOrderFromStripeSession,
} from './order-creation.server.ts'

// Order cancellation
export {
	cancelOrder,
} from './order-cancellation.server.ts'

// Return/refund processing
export {
	processReturnRefund,
} from './order-return.server.ts'

// Invoice creation
export {
	createInvoiceForOrder,
} from './order-invoice.server.ts'

// Admin orders
export {
	getAdminOrders,
	type AdminOrdersParams,
	type AdminOrdersResult,
} from './order-admin.server.ts'
