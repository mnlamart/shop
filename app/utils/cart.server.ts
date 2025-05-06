import { createCookieSessionStorage } from 'react-router'
import { type loader as rootLoader } from '#app/root.tsx'
import { prisma } from '#app/utils/db.server'

// Définir le type User basé sur le loader root comme dans app/utils/user.ts
type User = Awaited<ReturnType<typeof rootLoader>>['data']['user']

const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: '__cart-session',
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30, // 30 jours
    path: '/',
    sameSite: 'lax',
    secrets: [process.env.SESSION_SECRET ?? 'cart-session-secret'],
    secure: process.env.NODE_ENV === 'production',
  },
})

// Type d'objet pour stocker les données du panier en session
type CartSessionData = {
  cartId: string | null
}

export async function getCartSession(request: Request) {
  const session = await sessionStorage.getSession(request.headers.get('Cookie'))
  
  return {
    getCart: () => {
      return session.get('cartId') as string | null
    },
    setCart: (cartId: string) => {
      session.set('cartId', cartId)
      return session
    },
    destroyCart: () => {
      return sessionStorage.destroySession(session)
    },
    commit: () => sessionStorage.commitSession(session),
  }
}

export async function getCartForUser(user: User | null, request: Request) {
  if (user) {
    // Pour un utilisateur connecté
    let cart = await prisma.cart.findFirst({
      where: { userId: user.id },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: true,
              },
            },
          },
        },
      },
    })
    
    if (!cart) {
      // Créer un panier s'il n'existe pas
      cart = await prisma.cart.create({
        data: { userId: user.id },
        include: {
          items: {
            include: {
              product: {
                include: {
                  images: true,
                },
              },
            },
          },
        },
      })
    }
    
    return { cart }
  } else {
    // Pour un utilisateur anonyme (visiteur)
    const cartSession = await getCartSession(request)
    const cartId = cartSession.getCart()
    
    if (cartId) {
      const cart = await prisma.cart.findUnique({
        where: { id: cartId },
        include: {
          items: {
            include: {
              product: {
                include: {
                  images: true,
                },
              },
            },
          },
        },
      })
      
      if (cart) return { cart }
    }
    
    // Si le panier n'existe pas, en créer un nouveau
    const cart = await prisma.cart.create({
      data: {},
      include: {
        items: {
          include: {
            product: {
              include: {
                images: true,
              },
            },
          },
        },
      },
    })
    
    const session = cartSession.setCart(cart.id)
    // Nous devons créer un en-tête Set-Cookie pour mettre à jour le cookie
    const headers = new Headers()
    headers.append('Set-Cookie', await sessionStorage.commitSession(session))
    
    return { cart, headers }
  }
}

export async function mergeAnonymousCartWithUserCart(anonymousCartId: string, userId: string) {
  // Récupérer le panier anonyme
  const anonymousCart = await prisma.cart.findUnique({
    where: { id: anonymousCartId },
    include: { items: true },
  })

  if (!anonymousCart) return null

  // Récupérer ou créer le panier de l'utilisateur
  let userCart = await prisma.cart.findFirst({
    where: { userId },
    include: { items: true },
  })

  if (!userCart) {
    userCart = await prisma.cart.create({
      data: { userId },
      include: { items: true },
    })
  }

  // Fusionner les articles
  for (const anonymousItem of anonymousCart.items) {
    const existingUserItem = userCart.items.find(
      item => item.productId === anonymousItem.productId
    )

    if (existingUserItem) {
      // Mettre à jour la quantité si l'article existe déjà
      await prisma.cartItem.update({
        where: { id: existingUserItem.id },
        data: { quantity: existingUserItem.quantity + anonymousItem.quantity },
      })
    } else {
      // Créer un nouvel article si l'article n'existe pas
      await prisma.cartItem.create({
        data: {
          cartId: userCart.id,
          productId: anonymousItem.productId,
          quantity: anonymousItem.quantity,
        },
      })
    }
  }

  // Supprimer le panier anonyme après la fusion
  await prisma.cart.delete({ where: { id: anonymousCartId } })

  return userCart.id
}

export function calculateCartTotal(cart: any) {
  if (!cart || !cart.items || cart.items.length === 0) return 0
  
  return cart.items.reduce(
    (sum: number, item: any) => 
      sum + Number(item.product.price) * item.quantity,
    0
  )
}

export async function getCartItemsCount(cartId: string | null) {
  if (!cartId) return 0
  
  const cartItems = await prisma.cartItem.findMany({
    where: { cartId }
  })
  
  return cartItems.reduce((total, item) => total + item.quantity, 0)
}

export async function addToCart({ 
  productId, 
  quantity, 
  cartId 
}: { 
  productId: string
  quantity: number
  cartId: string
}) {
  // Vérifier si le produit existe déjà dans le panier
  const existingCartItem = await prisma.cartItem.findFirst({
    where: {
      productId,
      cartId
    }
  })
  
  if (existingCartItem) {
    // Mettre à jour la quantité si le produit existe déjà
    return prisma.cartItem.update({
      where: { id: existingCartItem.id },
      data: { quantity: existingCartItem.quantity + quantity }
    })
  } else {
    // Ajouter un nouveau produit au panier
    return prisma.cartItem.create({
      data: {
        quantity,
        productId,
        cartId
      }
    })
  }
}