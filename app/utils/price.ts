type Currency = {
	symbol: string
	decimals: number
}

/**
 * Formats a price in cents as a currency amount
 * @param priceInCents The price in cents
 * @param currency Optional currency object with symbol and decimals
 * @returns Formatted price string (e.g., "$123.45")
 */
export function formatPrice(
	priceInCents: number,
	currency?: Currency | null
): string {
	const symbol = currency?.symbol ?? '$'
	const decimals = currency?.decimals ?? 2
	return `${symbol}${(priceInCents / 100).toFixed(decimals)}`
}

/**
 * Converts a price from cents to dollars
 * @param priceInCents The price in cents
 * @returns The price in dollars
 */
export function centsToDollars(priceInCents: number): number {
	return priceInCents / 100
}

/**
 * Converts a price from dollars to cents
 * @param priceInDollars The price in dollars
 * @returns The price in cents
 */
export function dollarsToCents(priceInDollars: number): number {
	return Math.round(priceInDollars * 100)
}

