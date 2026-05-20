/**
 * PDF Invoice Document Component
 *
 * Uses @react-pdf/renderer to generate a professional PDF invoice.
 * Designed for server-side rendering — never used in the browser.
 */

import {
	Document,
	Page,
	Text,
	View,
	StyleSheet,
	renderToBuffer,
	renderToStream,
} from '@react-pdf/renderer'
import { formatPrice } from './price.ts'
type Currency = {
	symbol: string
	decimals: number
}

// ---------------------------------------------------------------------------
// TypeScript helpers for the invoice data passed to the PDF component
// ---------------------------------------------------------------------------

export interface InvoicePdfData {
	invoiceNumber: string
	invoiceDate: string
	invoiceStatus: string
	orderNumber: string
	orderDate: string
	/** Invoice kind: 'INVOICE' (Facture) or 'CREDIT_NOTE' (Avoir). Defaults to INVOICE. */
	kind?: string
	/** Original invoice number — shown on credit notes as a reference. */
	parentInvoiceNumber?: string
	customer: {
		name: string | null
		email: string | null
		company: string | null
		vatNumber: string | null
	}
	shipping: {
		name: string
		street: string | null
		city: string | null
		postal: string | null
		country: string | null
	}
	items: Array<{
		description: string
		quantity: number
		unitPriceCents: number
		totalCents: number
	}>
	subtotalCents: number
	vatBreakdown: Array<{
		kind: string
		rate: number
		baseCents: number
		vatCents: number
	}>
	vatTotalCents: number
	shippingCostCents: number
	totalCents: number
	currency: Currency | null
	storeName: string
	storeAddress: string
	storeVatNumber: string
	storeEmail: string
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
	page: {
		padding: 40,
		fontSize: 10,
		fontFamily: 'Helvetica',
		color: '#1a1a2e',
	},
	header: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginBottom: 30,
		paddingBottom: 20,
		borderBottom: '2 solid #e2e8f0',
	},
	storeInfo: {
		fontSize: 10,
		color: '#4a5568',
		lineHeight: 1.5,
	},
	storeName: {
		fontSize: 18,
		fontFamily: 'Helvetica-Bold',
		color: '#1a202c',
		marginBottom: 4,
	},
	invoiceBadge: {
		alignItems: 'flex-end',
	},
	invoiceTitle: {
		fontSize: 24,
		fontFamily: 'Helvetica-Bold',
		color: '#2b6cb0',
	},
	invoiceNumber: {
		fontSize: 12,
		color: '#4a5568',
		marginTop: 4,
	},
	statusBadge: {
		marginTop: 6,
		paddingVertical: 3,
		paddingHorizontal: 10,
		borderRadius: 4,
		fontSize: 9,
		fontFamily: 'Helvetica-Bold',
	},
	statusDraft: {
		backgroundColor: '#fefcbf',
		color: '#975a16',
	},
	statusFinal: {
		backgroundColor: '#c6f6d5',
		color: '#276749',
	},
	statusCancelled: {
		backgroundColor: '#fed7d7',
		color: '#9b2c2c',
	},
	section: {
		marginBottom: 16,
	},
	sectionTitle: {
		fontSize: 11,
		fontFamily: 'Helvetica-Bold',
		color: '#2d3748',
		marginBottom: 6,
		paddingBottom: 3,
		borderBottom: '1 solid #e2e8f0',
	},
	row: {
		flexDirection: 'row',
		marginBottom: 4,
	},
	label: {
		width: 100,
		fontSize: 9,
		color: '#718096',
	},
	value: {
		fontSize: 9,
		color: '#1a202c',
		flex: 1,
	},
	addressBox: {
		flexDirection: 'row',
		gap: 30,
	},
	addressCol: {
		flex: 1,
	},
	table: {
		marginTop: 12,
		marginBottom: 12,
	},
	tableHeader: {
		flexDirection: 'row',
		backgroundColor: '#edf2f7',
		paddingVertical: 6,
		paddingHorizontal: 4,
		borderBottom: '2 solid #cbd5e0',
	},
	tableHeaderCell: {
		fontFamily: 'Helvetica-Bold',
		fontSize: 8,
		color: '#4a5568',
	},
	tableRow: {
		flexDirection: 'row',
		paddingVertical: 5,
		paddingHorizontal: 4,
		borderBottom: '1 solid #e2e8f0',
	},
	tableCell: {
		fontSize: 9,
		color: '#1a202c',
	},
	colDesc: { flex: 3 },
	colQty: { flex: 1, textAlign: 'right' as const },
	colPrice: { flex: 1.5, textAlign: 'right' as const },
	colTotal: { flex: 1.5, textAlign: 'right' as const },
	totalsSection: {
		marginTop: 16,
		borderTop: '1 solid #e2e8f0',
		paddingTop: 10,
		alignItems: 'flex-end' as const,
	},
	totalRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		width: 220,
		marginBottom: 4,
	},
	totalLabel: {
		fontSize: 9,
		color: '#718096',
	},
	totalValue: {
		fontSize: 9,
		color: '#1a202c',
	},
	totalRowBold: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		width: 220,
		marginTop: 6,
		paddingTop: 6,
		borderTop: '1 solid #cbd5e0',
	},
	totalLabelBold: {
		fontSize: 11,
		fontFamily: 'Helvetica-Bold',
		color: '#1a202c',
	},
	totalValueBold: {
		fontSize: 11,
		fontFamily: 'Helvetica-Bold',
		color: '#2b6cb0',
	},
	vatSection: {
		marginTop: 8,
		alignItems: 'flex-end' as const,
	},
	vatRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		width: 220,
		marginBottom: 3,
	},
	vatLabel: {
		fontSize: 8,
		color: '#a0aec0',
	},
	vatValue: {
		fontSize: 8,
		color: '#718096',
	},
	footer: {
		position: 'absolute' as const,
		bottom: 30,
		left: 40,
		right: 40,
		textAlign: 'center' as const,
		fontSize: 8,
		color: '#a0aec0',
		borderTop: '1 solid #e2e8f0',
		paddingTop: 10,
	},
	legalText: {
		fontSize: 7,
		color: '#a0aec0',
		textAlign: 'center' as const,
		marginTop: 4,
	},
	pageNumber: {
		position: 'absolute' as const,
		bottom: 20,
		right: 40,
		fontSize: 8,
		color: '#a0aec0',
	},
})

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number, currency: Currency | null): string {
	return formatPrice(cents, currency)
}

function formatRate(rate: number): string {
	return `${(rate / 100).toFixed(1)}%`
}

// ---------------------------------------------------------------------------
// Document component
// ---------------------------------------------------------------------------

export function InvoiceDocument({ data }: { data: InvoicePdfData }) {
	const isCreditNote = data.kind === 'CREDIT_NOTE'

	const titleLabel = isCreditNote ? 'AVOIR' : 'INVOICE'
	const titleStyle = isCreditNote
		? { ...styles.invoiceTitle, color: '#9b2c2c' }
		: styles.invoiceTitle

	const statusStyle =
		data.invoiceStatus === 'FINAL'
			? isCreditNote
				? { ...styles.statusFinal, backgroundColor: '#fed7d7', color: '#9b2c2c' }
				: styles.statusFinal
			: data.invoiceStatus === 'DRAFT'
				? styles.statusDraft
				: styles.statusCancelled

	const statusLabel =
		data.invoiceStatus === 'FINAL'
			? isCreditNote
				? 'ISSUED'
				: 'FINAL'
			: data.invoiceStatus === 'DRAFT'
				? 'DRAFT'
				: 'CANCELLED'

	const showVat = data.vatBreakdown.length > 0 && data.vatTotalCents > 0

	return (
		<Document>
			<Page size="A4" style={styles.page}>
				{/* ── Header ─────────────────────────────────────────── */}
				<View style={styles.header}>
					<View>
						<Text style={styles.storeName}>{data.storeName}</Text>
						<View style={styles.storeInfo}>
							<Text>{data.storeAddress}</Text>
							<Text>VAT: {data.storeVatNumber}</Text>
							<Text>{data.storeEmail}</Text>
						</View>
					</View>
					<View style={styles.invoiceBadge}>
						<Text style={titleStyle}>{titleLabel}</Text>
						<Text style={styles.invoiceNumber}>
							{data.invoiceNumber}
						</Text>
						{isCreditNote && data.parentInvoiceNumber && (
							<Text
								style={{
									...styles.invoiceNumber,
									fontSize: 9,
									marginTop: 2,
								}}
							>
								Ref: {data.parentInvoiceNumber}
							</Text>
						)}
						<View
							style={[styles.statusBadge, statusStyle]}
						>
							<Text>{statusLabel}</Text>
						</View>
					</View>
				</View>

				{/* ── Invoice Info ────────────────────────────────────── */}
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Invoice Information</Text>
					<View style={styles.row}>
						<Text style={styles.label}>Invoice Date:</Text>
						<Text style={styles.value}>{data.invoiceDate}</Text>
					</View>
					<View style={styles.row}>
						<Text style={styles.label}>Order Number:</Text>
						<Text style={styles.value}>{data.orderNumber}</Text>
					</View>
					<View style={styles.row}>
						<Text style={styles.label}>Order Date:</Text>
						<Text style={styles.value}>{data.orderDate}</Text>
					</View>
				</View>

				{/* ── Addresses ────────────────────────────────────────── */}
				<View style={styles.addressBox}>
					<View style={styles.addressCol}>
						<Text style={styles.sectionTitle}>Bill To</Text>
						<View style={{ fontSize: 9, lineHeight: 1.5 }}>
							<Text>{data.customer.name || data.shipping.name}</Text>
							{data.customer.company && (
								<Text>{data.customer.company}</Text>
							)}
							<Text>{data.customer.email}</Text>
							{data.customer.vatNumber && (
								<Text>VAT: {data.customer.vatNumber}</Text>
							)}
						</View>
					</View>
					<View style={styles.addressCol}>
						<Text style={styles.sectionTitle}>Ship To</Text>
						<View style={{ fontSize: 9, lineHeight: 1.5 }}>
							<Text>{data.shipping.name}</Text>
							{data.shipping.street && (
								<Text>{data.shipping.street}</Text>
							)}
							{data.shipping.city && (
								<Text>
									{data.shipping.postal} {data.shipping.city}
								</Text>
							)}
							{data.shipping.country && (
								<Text>{data.shipping.country}</Text>
							)}
						</View>
					</View>
				</View>

				{/* ── Items Table ─────────────────────────────────────── */}
				<View style={styles.table}>
					<View style={styles.tableHeader}>
						<Text style={[styles.tableHeaderCell, styles.colDesc]}>
							Description
						</Text>
						<Text style={[styles.tableHeaderCell, styles.colQty]}>
							Qty
						</Text>
						<Text style={[styles.tableHeaderCell, styles.colPrice]}>
							Unit Price
						</Text>
						<Text style={[styles.tableHeaderCell, styles.colTotal]}>
							Total
						</Text>
					</View>
					{data.items.map((item, idx) => (
						<View
							style={styles.tableRow}
							key={idx}
							wrap={false}
						>
							<Text style={[styles.tableCell, styles.colDesc]}>
								{item.description}
							</Text>
							<Text style={[styles.tableCell, styles.colQty]}>
								{item.quantity}
							</Text>
							<Text style={[styles.tableCell, styles.colPrice]}>
								{formatCents(item.unitPriceCents, data.currency)}
							</Text>
							<Text style={[styles.tableCell, styles.colTotal]}>
								{formatCents(item.totalCents, data.currency)}
							</Text>
						</View>
					))}
				</View>

				{/* ── Totals ──────────────────────────────────────────── */}
				<View style={styles.totalsSection}>
					<View style={styles.totalRow}>
						<Text style={styles.totalLabel}>Subtotal</Text>
						<Text style={styles.totalValue}>
							{formatCents(data.subtotalCents, data.currency)}
						</Text>
					</View>
					{data.shippingCostCents > 0 && (
						<View style={styles.totalRow}>
							<Text style={styles.totalLabel}>Shipping</Text>
							<Text style={styles.totalValue}>
								{formatCents(
									data.shippingCostCents,
									data.currency,
								)}
							</Text>
						</View>
					)}
					{showVat && (
						<View style={styles.vatSection}>
							{data.vatBreakdown.map((vat, idx) => (
								<View style={styles.vatRow} key={idx}>
									<Text style={styles.vatLabel}>
										VAT {vat.kind} ({formatRate(vat.rate)})
										{' — base '}
										{formatCents(vat.baseCents, data.currency)}
									</Text>
									<Text style={styles.vatValue}>
										{formatCents(vat.vatCents, data.currency)}
									</Text>
								</View>
							))}
							<View style={[styles.vatRow, { marginTop: 2 }]}>
								<Text style={{ ...styles.vatLabel, fontFamily: 'Helvetica-Bold' }}>
									VAT Total
								</Text>
								<Text style={{ ...styles.vatValue, fontFamily: 'Helvetica-Bold' }}>
									{formatCents(
										data.vatTotalCents,
										data.currency,
									)}
								</Text>
							</View>
						</View>
					)}
					<View style={styles.totalRowBold}>
						<Text style={styles.totalLabelBold}>Total</Text>
						<Text style={styles.totalValueBold}>
							{formatCents(data.totalCents, data.currency)}
						</Text>
					</View>
				</View>

				{/* ── Footer ──────────────────────────────────────────── */}
				<View style={styles.footer}>
					<Text>
						{data.storeName} — {data.storeAddress}
					</Text>
					<Text>
						VAT {data.storeVatNumber} — {data.storeEmail}
					</Text>
					<Text style={styles.legalText}>
						This invoice is a legal document. Please retain it for
						your records in accordance with applicable tax laws.
					</Text>
				</View>

				<Text
					style={styles.pageNumber}
					render={({ pageNumber, totalPages }) =>
						`Page ${pageNumber} of ${totalPages}`
					}
				/>
			</Page>
		</Document>
	)
}

// ---------------------------------------------------------------------------
// PDF generation utility (server-side only)
// ---------------------------------------------------------------------------

/**
 * Generates a PDF buffer from invoice data.
 * This is a server-only function — @react-pdf/renderer uses
 * Node.js APIs internally (fs, stream, etc.).
 */
export async function generateInvoicePdf(
	data: InvoicePdfData,
): Promise<Buffer> {
	return renderToBuffer(<InvoiceDocument data={data} />)
}

/**
 * Generates a PDF ReadableStream from invoice data.
 * Useful for streaming directly to the HTTP response.
 */
export function generateInvoicePdfStream(
	data: InvoicePdfData,
): Promise<NodeJS.ReadableStream> {
	return renderToStream(<InvoiceDocument data={data} />)
}
