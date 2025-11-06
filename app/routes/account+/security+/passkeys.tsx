import * as Sentry from '@sentry/react-router'
import { startRegistration } from '@simplewebauthn/browser'
import { formatDistanceToNow } from 'date-fns'
import { useState } from 'react'
import { Form, Link, useRevalidator } from 'react-router'
import { z } from 'zod'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { type BreadcrumbHandle } from '../../account.tsx'
import { type Route } from './+types/passkeys.ts'


export const handle: BreadcrumbHandle = {
	breadcrumb: 'Passkeys',
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const passkeys = await prisma.passkey.findMany({
		where: { userId },
		orderBy: { createdAt: 'desc' },
		select: {
			id: true,
			deviceType: true,
			createdAt: true,
		},
	})
	return { passkeys }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'delete') {
		const passkeyId = formData.get('passkeyId')
		if (typeof passkeyId !== 'string') {
			return Response.json(
				{ status: 'error', error: 'Invalid passkey ID' },
				{ status: 400 },
			)
		}

		await prisma.passkey.delete({
			where: {
				id: passkeyId,
				userId, // Ensure the passkey belongs to the user
			},
		})
		return Response.json({ status: 'success' })
	}

	return Response.json(
		{ status: 'error', error: 'Invalid intent' },
		{ status: 400 },
	)
}

const RegistrationOptionsSchema = z.object({
	options: z.object({
		rp: z.object({
			id: z.string(),
			name: z.string(),
		}),
		user: z.object({
			id: z.string(),
			name: z.string(),
			displayName: z.string(),
		}),
		challenge: z.string(),
		pubKeyCredParams: z.array(
			z.object({
				type: z.literal('public-key'),
				alg: z.number(),
			}),
		),
		authenticatorSelection: z
			.object({
				authenticatorAttachment: z
					.enum(['platform', 'cross-platform'])
					.optional(),
				residentKey: z
					.enum(['required', 'preferred', 'discouraged'])
					.optional(),
				userVerification: z
					.enum(['required', 'preferred', 'discouraged'])
					.optional(),
				requireResidentKey: z.boolean().optional(),
			})
			.optional(),
	}),
}) satisfies z.ZodType<{ options: PublicKeyCredentialCreationOptionsJSON }>

export default function Passkeys({ loaderData }: Route.ComponentProps) {
	const revalidator = useRevalidator()
	const [error, setError] = useState<string | null>(null)

	async function handlePasskeyRegistration() {
		try {
			setError(null)
			const resp = await fetch('/webauthn/registration')
			const jsonResult = await resp.json()
			const parsedResult = RegistrationOptionsSchema.parse(jsonResult)

			const regResult = await startRegistration({
				optionsJSON: parsedResult.options,
			})

			const verificationResp = await fetch('/webauthn/registration', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(regResult),
			})

			if (!verificationResp.ok) {
				throw new Error('Failed to verify registration')
			}

			void revalidator.revalidate()
		} catch (err) {
			Sentry.captureException(err, {
				tags: { context: 'passkey-registration' },
			})
			setError('Failed to create passkey. Please try again.')
		}
	}

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Manage Passkeys</h1>
					<p className="text-gray-600">
						Set up passwordless authentication
					</p>
				</div>
				<Button variant="outline" asChild>
					<Link to="/account">
						<Icon name="arrow-left" className="h-4 w-4 mr-2" />
						Back to Settings
					</Link>
				</Button>
			</div>

			<Card className="p-6 hover:shadow-lg transition-shadow border-red-100 bg-white/80 backdrop-blur-sm">
				<CardHeader className="p-0 pb-6">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-100 to-red-200 flex items-center justify-center">
							<Icon name="smartphone" className="w-5 h-5 text-red-700" />
						</div>
						<CardTitle className="text-lg">Passkeys</CardTitle>
					</div>
				</CardHeader>
				<CardContent className="p-0 space-y-6">
					<div className="flex justify-end">
						<form action={handlePasskeyRegistration}>
							<Button
								type="submit"
								variant="secondary"
								className="flex items-center gap-2"
							>
								<Icon name="plus" className="h-4 w-4" />
								Register new passkey
							</Button>
						</form>
					</div>

					{error ? (
						<div className="bg-destructive/15 text-destructive rounded-lg p-4">
							{error}
						</div>
					) : null}

					{loaderData.passkeys.length ? (
						<ul className="flex flex-col gap-4" title="passkeys">
							{loaderData.passkeys.map((passkey: { id: string; deviceType: string; createdAt: Date }) => (
								<li
									key={passkey.id}
									className="border-gray-200 flex items-center justify-between gap-4 rounded-lg border p-4 bg-gray-50/50"
								>
									<div className="flex flex-col gap-2">
										<div className="flex items-center gap-2">
											<Icon name="lock-closed" className="text-gray-600" />
											<span className="font-semibold text-gray-900">
												{passkey.deviceType === 'platform'
													? 'Device'
													: 'Security Key'}
											</span>
										</div>
										<div className="text-sm text-gray-500">
											Registered {formatDistanceToNow(new Date(passkey.createdAt))}{' '}
											ago
										</div>
									</div>
									<Form method="POST">
										<input type="hidden" name="passkeyId" value={passkey.id} />
										<Button
											type="submit"
											name="intent"
											value="delete"
											variant="destructive"
											size="sm"
											className="flex items-center gap-2"
										>
											<Icon name="trash" className="h-4 w-4" />
											Delete
										</Button>
									</Form>
								</li>
							))}
						</ul>
					) : (
						<div className="text-center py-8">
							<Icon name="smartphone" className="h-12 w-12 mx-auto mb-4 text-gray-500" />
							<p className="text-gray-600">No passkeys registered yet</p>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
