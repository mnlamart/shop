import { prisma } from '#app/utils/db.server.ts'

import { type Route } from './+types/products.index.ts'

export const loader = async () => {
    const products = await prisma.product.findMany({
        include: {
            productCategory: true, // Inclut la catégorie du produit
        },
    })
    return { products }
}



export default function ProductsIndexRoute({
    loaderData,
}: Route.LoaderArgs) {
    return (
        <div className="container pt-12">
            <p className="text-body-md">Select a product</p>
            {loaderData.products.map((product) => (
                <div key={product.id} className="mb-4">
                    <h2 className="text-body-lg">{product.name}</h2>
                    <p className="text-body-sm">Price: {product.price}</p>
                    <p className="text-body-md">{product.description}</p>
                    <p className="text-body-sm">Category: {product.productCategory?.name ?? 'Unknown'}</p>
                </div>
            ))}
        </div>
    )
}