// app/routes/cart.tsx
import { useFetcher, useLoaderData } from 'react-router'
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts'
import { type Route } from './+types/cart.ts'

export async function loader({ request }: Route.LoaderArgs) {
    const userId = await requireUserId(request, { redirectTo: '/login' })
  
  // Récupérer le panier associé à l'utilisateur ou à la session
  const cart = await prisma.cart.findFirst({
    where: { userId },
    include: {
      items: {
        include: {
          product: true
        }
      }
    }
  })
  
  return Response.json({ cart })
}

export const action = async ({ request }) => {
  const formData = await request.formData()
  const action = formData.get('_action')
  
  if (action === 'updateQuantity') {
    const cartItemId = formData.get('cartItemId')
    const quantity = Number(formData.get('quantity'))
    
    await prisma.cartItem.update({
      where: { id: cartItemId },
      data: { quantity }
    })
  }
  
  if (action === 'removeItem') {
    const cartItemId = formData.get('cartItemId')
    await prisma.cartItem.delete({ where: { id: cartItemId } })
  }
  
  return Response.json({ success: true })
}

export default function Cart() {
  const { cart } = useLoaderData()
  const fetcher = useFetcher()
  
  // Calculer le total
  const cartTotal = cart?.items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  ) || 0
  
  return (
    <div className="max-w-4xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Votre panier</h1>
      
      {(!cart || cart.items.length === 0) ? (
        <p>Votre panier est vide.</p>
      ) : (
        <>
          <div className="space-y-4">
            {cart.items.map(item => (
              <div key={item.id} className="flex border-b pb-4">
                <div className="w-24 h-24 bg-gray-100">
                  {item.product.images[0] && (
                    <img 
                      src={item.product.images[0].url} 
                      alt={item.product.name}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="ml-4 flex-1">
                  <h3 className="font-medium">{item.product.name}</h3>
                  <p className="text-gray-600">{item.product.price} €</p>
                  
                  <fetcher.Form method="post" className="mt-2 flex items-center">
                    <input type="hidden" name="_action" value="updateQuantity" />
                    <input type="hidden" name="cartItemId" value={item.id} />
                    <label>
                      <span className="sr-only">Quantité</span>
                      <input
                        type="number"
                        name="quantity"
                        min="1"
                        defaultValue={item.quantity}
                        className="w-16 border rounded p-1"
                      />
                    </label>
                    <button 
                      type="submit"
                      className="ml-2 text-sm text-blue-600"
                    >
                      Mettre à jour
                    </button>
                  </fetcher.Form>
                </div>
                <div>
                  <fetcher.Form method="post">
                    <input type="hidden" name="_action" value="removeItem" />
                    <input type="hidden" name="cartItemId" value={item.id} />
                    <button 
                      type="submit"
                      className="text-red-600 text-sm"
                    >
                      Supprimer
                    </button>
                  </fetcher.Form>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-6 border-t pt-4">
            <div className="flex justify-between text-lg font-medium">
              <span>Total</span>
              <span>{cartTotal} €</span>
            </div>
            
            <a 
              href="/checkout"
              className="mt-4 block w-full bg-blue-600 text-white text-center py-2 rounded-md"
            >
              Procéder au paiement
            </a>
          </div>
        </>
      )}
    </div>
  )
}