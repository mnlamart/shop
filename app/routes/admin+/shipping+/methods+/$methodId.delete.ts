import { parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { data } from 'react-router'
import { z } from 'zod'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$methodId.delete.ts'

const DeleteMethodSchema = z.object({
	methodId: z.string().min(1),
})

export async function action({ params, request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: DeleteMethodSchema })

	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}

	const method = await prisma.shippingMethod.findUnique({
		where: { id: params.methodId },
		include: {
			_count: { select: { orders: true } },
		},
	})

	invariantResponse(method, 'Shipping method not found', { status: 404 })

	// Delete the method (orders will keep historical data via snapshots)
	await prisma.shippingMethod.delete({ where: { id: method.id } })

	const orderMsg =
		method._count.orders > 0
			? ` This method was used in ${method._count.orders} order${method._count.orders === 1 ? '' : 's'}, but historical data is preserved.`
			: ''

	return redirectWithToast('/admin/shipping/methods', {
		description: `Shipping method "${method.name}" deleted.${orderMsg}`,
	})
}

