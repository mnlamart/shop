import { json, redirect } from '@remix-run/node'
import { useLoaderData, useFetcher } from '@remix-run/react'
import { useState } from 'react'
import { prisma } from '~/utils/db.server'
import { getUser } from '~/utils/auth.server'
import { ShoppingBag } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { requireStock } from '~/utils/products.server'
import { getCartSession } from '~/utils/cart.server'

import { type Route } from './+types/products.$productId.ts'

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  const productId = params.productId
  
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      images: true,
      categories: true
    }
  })
  
  if (!product) {
    throw new Response('Produit non trouvé', { status: 404 })
  }
  
  const user = await getUser(request)
  
  return Response.json({ product, user })
}

export const action = async ({ request, params }: Route.ActionArgs) => {
  const productId = params.productId
  const formData = await request.formData()
  const quantity = Number(formData.get('quantity') || 1)
  
  if (isNaN(quantity) || quantity < 1) {
    return Response.json({ error: 'Quantité invalide' }, { status: 400 })
  }
  
  const user = await getUser(request)
  
  // Vérifier si le produit existe et a du stock
  const product = await requireStock(productId, quantity)
  
  // Gérer le panier via des sessions pour utilisateurs non-connectés
  // ou via la base de données pour les utilisateurs connectés
  const cartSession = await getCartSession(request)
  let cartId = null
  
  if (user) {
    // Pour un utilisateur connecté - utiliser ou créer leur panier
    let cart = await prisma.cart.findFirst({
      where: { userId: user.id }
    })
    
    if (!cart) {
      cart = await prisma.cart.create({
        data: { userId: user.id }
      })
    }
    
    cartId = cart.id
  } else {
    // Pour un utilisateur anonyme - utiliser le panier de la session
    cartId = await cartSession.getCart()
    
    if (!cartId) {
      // Créer un nouveau panier anonyme
      const cart = await prisma.cart.create({
        data: {}
      })
      cartId = cart.id
      await cartSession.setCart(cartId)
    }
  }
  
  // Vérifier si le produit est déjà dans le panier
  const existingCartItem = await prisma.cartItem.findFirst({
    where: {
      cartId,
      productId
    }
  })
  
  if (existingCartItem) {
    // Mettre à jour la quantité
    await prisma.cartItem.update({
      where: { id: existingCartItem.id },
      data: { quantity: existingCartItem.quantity + quantity }
    })
  } else {
    // Ajouter un nouvel élément au panier
    await prisma.cartItem.create({
      data: {
        cartId,
        productId,
        quantity
      }
    })
  }
  
  const redirectTo = formData.get('redirectTo')
  if (redirectTo === 'cart') {
    return redirect('/cart')
  }
  
  return Response.json({ success: true })
}

export default function ProductDetail() {
  const { product } = useLoaderData<typeof loader>()
  const [quantity, setQuantity] = useState(1)
  const addToCartFetcher = useFetcher()
  
  const isAdding = addToCartFetcher.state !== 'idle'
  const isSuccess = addToCartFetcher.data?.success
  const isOutOfStock = product.inventory <= 0
  
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Image du produit */}
        <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
          {product.images && product.images[0] ? (
            <img 
              src={product.images[0].url} 
              alt={product.images[0].altText || product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              Pas d'image disponible
            </div>
          )}
        </div>
        
        {/* Détails du produit */}
        <div>
          <h1 className="text-3xl font-bold">{product.name}</h1>
          
          {product.categories.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {product.categories.map(category => (
                <span 
                  key={category.id}
                  className="bg-gray-100 px-2 py-1 text-sm rounded"
                >
                  {category.name}
                </span>
              ))}
            </div>
          )}
          
          <div className="mt-4 text-2xl font-medium">{product.price} €</div>
          
          <div className="mt-6 border-t pt-6">
            <p className="text-gray-700 whitespace-pre-wrap">{product.description}</p>
          </div>
          
          {/* État du stock */}
          <div className="mt-4">
            {isOutOfStock ? (
              <p className="text-red-600">Produit indisponible</p>
            ) : (
              <p className="text-green-600">En stock: {product.inventory} disponible(s)</p>
            )}
          </div>
          
          {/* Formulaire d'ajout au panier */}
          <addToCartFetcher.Form method="post" className="mt-6">
            <div className="flex items-center mb-4">
              <label htmlFor="quantity" className="mr-4 font-medium">Quantité:</label>
              <div className="flex items-center border rounded overflow-hidden">
                <button 
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))} 
                  className="px-3 py-1 bg-gray-100"
                  disabled={isOutOfStock}
                >
                  -
                </button>
                <input
                  id="quantity"
                  name="quantity"
                  type="number"
                  min="1"
                  max={product.inventory}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.min(product.inventory, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-12 text-center border-x py-1"
                  disabled={isOutOfStock}
                />
                <button 
                  type="button"
                  onClick={() => setQuantity(Math.min(product.inventory, quantity + 1))} 
                  className="px-3 py-1 bg-gray-100"
                  disabled={isOutOfStock || quantity >= product.inventory}
                >
                  +
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <Button
                type="submit"
                name="redirectTo"
                value="product"
                disabled={isAdding || isOutOfStock}
                className="flex items-center justify-center gap-2"
              >
                <ShoppingBag size={18} />
                {isAdding ? 'Ajout en cours...' : 'Ajouter au panier'}
              </Button>
              
              <Button
                type="submit"
                name="redirectTo"
                value="cart"
                disabled={isAdding || isOutOfStock}
                variant="outline"
                className="font-medium"
              >
                Acheter maintenant
              </Button>
            </div>
            
            {isSuccess && (
              <div className="mt-4 p-2 bg-green-50 text-green-700 rounded text-center">
                Produit ajouté au panier !
              </div>
            )}
            
            {addToCartFetcher.data?.error && (
              <div className="mt-4 p-2 bg-red-50 text-red-700 rounded text-center">
                {addToCartFetcher.data.error}
              </div>
            )}
          </addToCartFetcher.Form>
        </div>
      </div>
    </div>
  )
}