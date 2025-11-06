import { redirect, Link, useFetcher } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { generateTOTP } from '#app/utils/totp.server.ts'
import { type Route } from './+types/two-factor.index.ts'
import { twoFAVerificationType } from './two-factor.tsx'
import { twoFAVerifyVerificationType } from './two-factor.verify.tsx'


export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const verification = await prisma.verification.findUnique({
		where: { target_type: { type: twoFAVerificationType, target: userId } },
		select: { id: true },
	})
	return { is2FAEnabled: Boolean(verification) }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const { otp: _otp, ...config } = await generateTOTP()
	const verificationData = {
		...config,
		type: twoFAVerifyVerificationType,
		target: userId,
	}
	await prisma.verification.upsert({
		where: {
			target_type: { target: userId, type: twoFAVerifyVerificationType },
		},
		create: verificationData,
		update: verificationData,
	})
	return redirect('/account/security/two-factor/verify')
}

export default function TwoFactorRoute({ loaderData }: Route.ComponentProps) {
	const enable2FAFetcher = useFetcher<typeof action>()

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Two-Factor Authentication</h1>
					<p className="text-gray-600">
						Add an extra layer of security to your account
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
							<Icon name="shield" className="w-5 h-5 text-red-700" />
						</div>
						<CardTitle className="text-lg">2FA Status</CardTitle>
					</div>
				</CardHeader>
				<CardContent className="p-0 space-y-6">
					{loaderData.is2FAEnabled ? (
						<>
							<div className="flex items-center gap-2 text-gray-900">
								<Icon name="check" className="text-green-600" />
								<p className="text-lg">
									You have enabled two-factor authentication.
								</p>
							</div>
							<div className="flex justify-end pt-6 border-t">
								<Button variant="destructive" asChild>
									<Link to="disable">
										<Icon name="lock-open-1" className="h-4 w-4 mr-2" />
										Disable 2FA
									</Link>
								</Button>
							</div>
						</>
					) : (
						<>
							<div className="flex items-center gap-2 text-gray-900">
								<Icon name="lock-open-1" className="text-gray-600" />
								<p>
									You have not enabled two-factor authentication yet.
								</p>
							</div>
							<p className="text-sm text-gray-600">
								Two factor authentication adds an extra layer of security to your
								account. You will need to enter a code from an authenticator app
								like{' '}
								<a className="underline text-gray-900" href="https://1password.com/">
									1Password
								</a>{' '}
								to log in.
							</p>
							<div className="flex justify-end pt-6 border-t">
								<enable2FAFetcher.Form method="POST">
									<StatusButton
										type="submit"
										name="intent"
										value="enable"
										status={enable2FAFetcher.state === 'loading' ? 'pending' : 'idle'}
									>
										Enable 2FA
									</StatusButton>
								</enable2FAFetcher.Form>
							</div>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
