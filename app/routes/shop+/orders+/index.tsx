import { redirect } from 'react-router'
import { getUserId } from '#app/utils/auth.server.ts'
import { type Route } from './+types/index.ts'

export async function loader(args: Route.LoaderArgs) {
	const userId = await getUserId(args.request)
	
	// If authenticated, redirect to account orders
	if (userId) {
		return redirect('/account/orders')
	}
	
	// If not authenticated, delegate to guest order lookup
	const guestModule = await import('./guest-order-lookup.tsx')
	return guestModule.loader(args)
}

export async function action(args: Route.ActionArgs) {
	const userId = await getUserId(args.request)
	
	// If authenticated, redirect to account orders
	if (userId) {
		return redirect('/account/orders')
	}
	
	// If not authenticated, delegate to guest order lookup
	const guestModule = await import('./guest-order-lookup.tsx')
	return guestModule.action(args)
}

export { default, meta } from './guest-order-lookup.tsx'
