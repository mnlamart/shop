import { render } from '@react-email/components'
import path from 'node:path'
import { type ReactElement } from 'react'
import { z } from 'zod'

const resendErrorSchema = z.union([
	z.object({
		name: z.string(),
		message: z.string(),
		statusCode: z.number(),
	}),
	z.object({
		name: z.literal('UnknownError'),
		message: z.literal('Unknown Error'),
		statusCode: z.literal(500),
		cause: z.any(),
	}),
])
type ResendError = z.infer<typeof resendErrorSchema>

const resendSuccessSchema = z.object({
	id: z.string(),
})

export type EmailAttachment = {
	content: Buffer | string
	filename: string
}

export async function sendEmail({
	react,
	attachments,
	...options
}: {
	to: string
	subject: string
	attachments?: EmailAttachment[]
} & (
	| { html: string; text: string; react?: never }
	| { react: ReactElement; html?: never; text?: never }
)) {
	const from = 'hello@epicstack.dev'

	const email: Record<string, unknown> = {
		from,
		...options,
		...(react ? await renderReactEmail(react) : null),
	}

	// Encode attachments for Resend API (Base64-encoded content)
	if (attachments && attachments.length > 0) {
		email.attachments = attachments.map((att) => ({
			filename: att.filename,
			content:
				typeof att.content === 'string'
					? att.content
					: att.content.toString('base64'),
		}))
	}

	// Skip real API call when no valid API key or in mocks mode
	if (!process.env.RESEND_API_KEY || process.env.MOCKS === 'true') {
		console.info('🔶 Mocking email send (no API key or mocks mode)')
		// Write email fixture for e2e tests
		try {
			const { default: fsExtra } = await import('fs-extra')
			const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures', 'email')
			await fsExtra.ensureDir(fixturesDir)
			await fsExtra.writeJSON(path.join(fixturesDir, `${email.to}.json`), email)
		} catch {
			// Fixture write is optional — only needed for e2e tests
		}
		return {
			status: 'success',
			data: { id: 'mocked' },
		} as const
	}

	const response = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		body: JSON.stringify(email),
		headers: {
			Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
			'Content-Type': 'application/json',
		},
	})
	const data = await response.json()
	const parsedData = resendSuccessSchema.safeParse(data)

	if (response.ok && parsedData.success) {
		return {
			status: 'success',
			data: parsedData,
		} as const
	} else {
		const parseResult = resendErrorSchema.safeParse(data)
		if (parseResult.success) {
			return {
				status: 'error',
				error: parseResult.data,
			} as const
		} else {
			return {
				status: 'error',
				error: {
					name: 'UnknownError',
					message: 'Unknown Error',
					statusCode: 500,
					cause: data,
				} satisfies ResendError,
			} as const
		}
	}
}

async function renderReactEmail(react: ReactElement) {
	const [html, text] = await Promise.all([
		render(react),
		render(react, { plainText: true }),
	])
	return { html, text }
}
