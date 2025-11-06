import { parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { data } from 'react-router'
import { z } from 'zod'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$zoneId.delete.ts'

const DeleteZoneSchema = z.object({
	zoneId: z.string().min(1),
})

export async function action({ params, request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: DeleteZoneSchema })

	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}

	const zone = await prisma.shippingZone.findUnique({
		where: { id: params.zoneId },
		include: {
			_count: { select: { methods: true } },
		},
	})

	invariantResponse(zone, 'Shipping zone not found', { status: 404 })

	// Delete the zone (methods will be cascade deleted)
	await prisma.shippingZone.delete({ where: { id: zone.id } })

	const methodMsg =
		zone._count.methods > 0
			? ` ${zone._count.methods} shipping method${zone._count.methods === 1 ? '' : 's'} also deleted.`
			: ''

	return redirectWithToast('/admin/shipping/zones', {
		description: `Shipping zone "${zone.name}" deleted.${methodMsg}`,
	})
}

