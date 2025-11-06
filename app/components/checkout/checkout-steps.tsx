import { cn } from '#app/utils/misc.tsx'

export type CheckoutStep = 'review' | 'shipping' | 'payment'

const steps: Array<{ id: CheckoutStep; name: string; path: string }> = [
	{ id: 'review', name: 'Review', path: '/shop/checkout/review' },
	{ id: 'shipping', name: 'Shipping', path: '/shop/checkout/shipping' },
	{ id: 'payment', name: 'Payment', path: '/shop/checkout/payment' },
]

export function CheckoutSteps({ currentStep }: { currentStep: CheckoutStep }) {
	const currentStepIndex = steps.findIndex((s) => s.id === currentStep)

	return (
		<nav aria-label="Checkout steps" className="mb-8">
			<ol className="flex items-center justify-center space-x-4">
				{steps.map((step, index) => {
					const isCompleted = index < currentStepIndex
					const isCurrent = index === currentStepIndex
					const isUpcoming = index > currentStepIndex

					return (
						<li key={step.id} className="flex items-center">
							<div className="flex items-center">
								{/* Step Circle */}
								<div
									className={cn(
										'flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors',
										isCompleted &&
											'border-primary bg-primary text-primary-foreground',
										isCurrent &&
											'border-primary bg-primary text-primary-foreground',
										isUpcoming &&
											'border-muted bg-background text-muted-foreground',
									)}
								>
									{isCompleted ? (
										<svg
											className="h-5 w-5"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M5 13l4 4L19 7"
											/>
										</svg>
									) : (
										index + 1
									)}
								</div>
								{/* Step Label */}
								<span
									className={cn(
										'ml-3 text-sm font-medium',
										isCurrent && 'text-foreground',
										isUpcoming && 'text-muted-foreground',
									)}
								>
									{step.name}
								</span>
							</div>
							{/* Connector Line */}
							{index < steps.length - 1 && (
								<div
									className={cn(
										'mx-4 h-0.5 w-16 transition-colors',
										isCompleted ? 'bg-primary' : 'bg-muted',
									)}
								/>
							)}
						</li>
					)
				})}
			</ol>
		</nav>
	)
}

