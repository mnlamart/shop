import { ShoppingBag, Check } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useFetcher } from 'react-router'
import { Button } from '#app/components/ui/button'

interface AddToCartButtonProps {
  productId: string;
  className?: string;
  redirectToCart?: boolean;
  disabled?: boolean;
  quantity?: number;
}

export function AddToCartButton({ 
  productId, 
  className = '', 
  redirectToCart = false, 
  disabled = false,
  quantity = 1
}: AddToCartButtonProps) {
  const fetcher = useFetcher()
  const [showSuccess, setShowSuccess] = useState(false)
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null)
  
  const isSubmitting = fetcher.state !== 'idle'
  
  // Réinitialiser le message de succès lorsque la quantité change
  useEffect(() => {
    if (showSuccess) {
      setShowSuccess(false)
      if (timeoutId) {
        clearTimeout(timeoutId)
        setTimeoutId(null)
      }
    }
  }, [quantity, showSuccess, timeoutId])
  
  // Gérer l'affichage du message de succès
  useEffect(() => {
    if (fetcher.data?.success && !showSuccess) {
      setShowSuccess(true)
      
      // Masquer le message après 2 secondes
      const id = setTimeout(() => {
        setShowSuccess(false)
      }, 2000)
      
      setTimeoutId(id)
      
      return () => {
        clearTimeout(id)
      }
    }
  }, [fetcher.data, showSuccess])
  
  return (
    <fetcher.Form method="post" action={`/products/${productId}`} className={className}>
      <input type="hidden" name="quantity" value={quantity} />
      <input 
        type="hidden" 
        name="redirectTo" 
        value={redirectToCart ? 'cart' : 'product'} 
      />
      <input type="hidden" name="_action" value="addToCart" />
      
      <Button
        type="submit"
        disabled={disabled || isSubmitting}
        variant={showSuccess ? "outline" : "default"}
        className={`flex items-center justify-center gap-2 transition-all duration-300 ${
          showSuccess ? "bg-green-50 text-green-600 border-green-200" : ""
        }`}
      >
        {showSuccess ? (
          <>
            <Check className="h-4 w-4" />
            <span>Ajouté au panier</span>
          </>
        ) : isSubmitting ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span>Ajout en cours...</span>
          </>
        ) : (
          <>
            <ShoppingBag className="h-4 w-4" />
            <span>{redirectToCart ? "Acheter maintenant" : "Ajouter au panier"}</span>
          </>
        )}
      </Button>
      
      {fetcher.data?.error && (
        <div className="mt-2 text-sm text-red-600">
          {fetcher.data.error}
        </div>
      )}
    </fetcher.Form>
  )
}