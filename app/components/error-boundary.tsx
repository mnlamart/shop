import { captureException } from '@sentry/react-router'
import { useEffect, type ReactElement } from 'react'
import {
	type ErrorResponse,
	isRouteErrorResponse,
	useParams,
	useRouteError,
} from 'react-router'
import { getErrorMessage } from '#app/utils/misc'

type StatusHandler = (info: {
	error: ErrorResponse
	params: Record<string, string | undefined>
}) => ReactElement | null

export function GeneralErrorBoundary({
	defaultStatusHandler = ({ error }) => (
		<p>
			{error.status} {error.data}
		</p>
	),
	statusHandlers,
	unexpectedErrorHandler = (error) => <p>{getErrorMessage(error)}</p>,
}: {
	defaultStatusHandler?: StatusHandler
	statusHandlers?: Record<number, StatusHandler>
	unexpectedErrorHandler?: (error: unknown) => ReactElement | null
}) {
	const error = useRouteError()
	const params = useParams()
	const isResponse = isRouteErrorResponse(error)

	useEffect(() => {
		if (isResponse) {
			// Log route error responses with context
			captureException(error, {
				tags: {
					context: 'error-boundary',
					errorType: 'route-error-response',
					status: error.status,
				},
				extra: {
					status: error.status,
					data: error.data,
					params,
				},
			})
		} else {
			// Log unexpected errors
			captureException(error, {
				tags: {
					context: 'error-boundary',
					errorType: 'unexpected-error',
				},
				extra: {
					params,
				},
			})
		}
	}, [error, isResponse, params])

	return (
		<div className="text-h2 container flex items-center justify-center p-20">
			{isResponse
				? (statusHandlers?.[error.status] ?? defaultStatusHandler)({
						error,
						params,
					})
				: unexpectedErrorHandler(error)}
		</div>
	)
}
