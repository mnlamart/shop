# Modern Admin Page Implementation Guide

## Overview

This guide documents the modern UI/UX patterns established in the categories pages to serve as a comprehensive reference for implementing future admin pages (products, attributes, etc.). These patterns provide a consistent, accessible, and responsive user experience across all admin interfaces.

## Core Design Principles

- **Clean & minimal design** with subtle shadows and modern aesthetics
- **Card-based layouts** for better content organization and visual hierarchy
- **Responsive design** with mobile-first approach
- **Smooth animations and transitions** for enhanced user experience
- **Consistent spacing and typography** throughout the application
- **Accessible components** using Radix UI primitives
- **Modern form handling** with proper validation and error states

## Required Components

### Shadcn/Radix UI Components

All components follow the shadcn/ui design system for consistency and accessibility:

#### Badge Component
- **File**: `#app/components/ui/badge.tsx`
- **Variants**: `default`, `secondary`, `destructive`, `outline`, `success`, `warning`
- **Usage**: Status indicators, labels, system category badges

```tsx
<Badge variant="success">Active</Badge>
<Badge variant="warning">System Category</Badge>
<Badge variant="destructive">Inactive</Badge>
```

#### Card Components
- **File**: `#app/components/ui/card.tsx`
- **Components**: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`
- **Usage**: Content sections, statistics, form containers

```tsx
<Card>
  <CardHeader>
    <CardTitle>Section Title</CardTitle>
    <CardDescription>Optional description</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

#### AlertDialog Component
- **File**: `#app/components/ui/alert-dialog.tsx`
- **Components**: `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogAction`, `AlertDialogCancel`
- **Usage**: Delete confirmations, critical actions

#### Form Components
- **Input**: `#app/components/ui/input.tsx`
- **Select**: `#app/components/ui/select.tsx` (with `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue`)
- **Button**: `#app/components/ui/button.tsx`
- **Label**: `#app/components/ui/label.tsx`
- **Textarea**: `#app/components/ui/textarea.tsx`

#### Table Components
- **File**: `#app/components/ui/table.tsx`
- **Components**: `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`

#### Icons
- **File**: `#app/components/ui/icon.tsx`
- **Usage**: Consistent iconography from the sprite system

## Page Structure Patterns

### 1. List/Index Page (`index.tsx`)

The list page serves as the main entry point for managing a collection of items.

#### Required Imports

```typescript
import { useState, useMemo } from 'react'
import { Link, useFetcher } from 'react-router'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#app/components/ui/alert-dialog.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#app/components/ui/select.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#app/components/ui/table.tsx'
```

#### Loader Pattern

```typescript
export async function loader({ request }: Route.LoaderArgs) {
  await requireUserWithRole(request, 'admin')

  const items = await prisma.MODEL.findMany({
    include: {
      // Include related data and counts
      parent: {
        select: { id: true, name: true, slug: true },
      },
      children: {
        select: { id: true, name: true, slug: true },
      },
      _count: {
        select: { products: true, children: true },
      },
    },
    orderBy: [
      { parentId: 'asc' }, // For hierarchical data
      { name: 'asc' },
    ],
  })

  // Organize hierarchical data if needed
  const rootItems = items.filter(item => !item.parentId)
  const organizedItems = rootItems.map(root => ({
    ...root,
    children: items.filter(item => item.parentId === root.id)
  }))

  return { items: organizedItems }
}
```

#### Client-Side Search & Filter Implementation

```typescript
export default function ItemsList({ loaderData }: Route.ComponentProps) {
  const { items } = loaderData
  const fetcher = useFetcher()
  
  // State for search and filtering
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')

  // Flatten hierarchical data for searching
  const allItems = useMemo(() => {
    const flatten = (items: any[], level = 0): any[] => {
      const result: any[] = []
      for (const item of items) {
        result.push({ ...item, level })
        if (item.children && item.children.length > 0) {
          result.push(...flatten(item.children, level + 1))
        }
      }
      return result
    }
    return flatten(items)
  }, [items])

  // Filter items based on search and filter criteria
  const filteredItems = useMemo(() => {
    let filtered = allItems

    // Apply search filter
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(item => 
        item.name.toLowerCase().includes(search) ||
        (item.description && item.description.toLowerCase().includes(search))
      )
    }

    // Apply type filter
    if (filterType === 'with-products') {
      filtered = filtered.filter(item => item._count.products > 0)
    } else if (filterType === 'system') {
      filtered = filtered.filter(item => item.id === SYSTEM_ITEM_ID)
    }

    return filtered
  }, [allItems, searchTerm, filterType])

  // Display logic
  const displayItems = useMemo(() => {
    if (searchTerm.trim() || filterType !== 'all') {
      return filteredItems
    }
    return items // Show hierarchical structure when unfiltered
  }, [filteredItems, items, searchTerm, filterType])
}
```

#### Layout Structure

```tsx
<div className="space-y-8 animate-slide-top">
  {/* Header with title and action button */}
  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Items</h1>
      <p className="text-muted-foreground">
        Manage your items ({items.length} total)
        {searchTerm.trim() || filterType !== 'all' ? ` • ${displayItems.length} shown` : ''}
      </p>
    </div>
    <Link to="/admin/items/new">
      <Button>
        <Icon name="plus" className="h-4 w-4 mr-2" />
        Add Item
      </Button>
    </Link>
  </div>

  {/* Search and Filter Controls */}
  <div className="flex flex-col sm:flex-row gap-4">
    <div className="flex-1">
      <div className="relative">
        <Icon name="magnifying-glass" className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search items by name or description..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
        />
      </div>
    </div>
    <div className="sm:w-48">
      <Select value={filterType} onValueChange={setFilterType}>
        <SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20">
          <SelectValue placeholder="Filter by type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Items</SelectItem>
          <SelectItem value="with-products">With Products</SelectItem>
          <SelectItem value="system">System Item</SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>

  {/* Table */}
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead className="hidden md:table-cell">Parent</TableHead>
        <TableHead className="hidden lg:table-cell">Subitems</TableHead>
        <TableHead className="hidden md:table-cell">Products</TableHead>
        <TableHead>Actions</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {displayItems.length === 0 ? (
        <TableRow>
          <TableCell colSpan={5} className="text-center py-8">
            {searchTerm.trim() || filterType !== 'all' ? (
              <div className="text-muted-foreground">
                <Icon name="magnifying-glass" className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No items match your search criteria.</p>
                <p className="text-sm">Try adjusting your search or filters.</p>
              </div>
            ) : (
              <div className="text-muted-foreground">
                <Icon name="archive" className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No items found.</p>
                <Link to="/admin/items/new" className="text-primary hover:underline">
                  Create your first item
                </Link>
              </div>
            )}
          </TableCell>
        </TableRow>
      ) : (
        displayItems.map((item) => (
          <ItemRow key={item.id} item={item} level={item.level || 0} />
        ))
      )}
    </TableBody>
  </Table>
</div>
```

#### Mobile Responsiveness

```tsx
function ItemRow({ item, level = 0 }: { item: any; level?: number }) {
  return (
    <TableRow className="transition-colors duration-150 hover:bg-muted/50 animate-slide-top">
      <TableCell>
        <div className={`flex items-center space-x-3 ${level > 0 ? `ml-${level * 6}` : ''}`}>
          {level > 0 && (
            <div className="flex items-center">
              <Icon name="chevron-right" className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Link 
                to={`/admin/items/${item.slug}`}
                className="font-medium text-primary hover:underline transition-colors duration-200"
              >
                {item.name}
              </Link>
              {item.isSystem && (
                <Badge variant="warning" className="text-xs">
                  System Item
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground md:hidden">
              {item.description || 'No description'}
            </p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground md:hidden mt-1">
              <span>{item._count.products} products</span>
              {item._count.children > 0 && (
                <span>{item._count.children} subitems</span>
              )}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {item.parent ? (
          <Link 
            to={`/admin/items/${item.parent.slug}`}
            className="text-primary hover:underline"
          >
            {item.parent.name}
          </Link>
        ) : (
          <span className="text-muted-foreground">Root Item</span>
        )}
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <span className="text-muted-foreground">
          {item._count.children} subitems
        </span>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <span className="text-muted-foreground">
          {item._count.products} products
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/admin/items/${item.slug}`}>
              <Icon name="eye-open" className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/admin/items/${item.slug}/edit`}>
              <Icon name="pencil-1" className="h-4 w-4" />
            </Link>
          </Button>
          <DeleteButton item={item} />
        </div>
      </TableCell>
    </TableRow>
  )
}
```

#### Delete Confirmation Pattern

```tsx
function DeleteButton({ item }: { item: any }) {
  const fetcher = useFetcher()
  const hasChildren = item._count.children > 0

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive transition-colors duration-200"
        >
          <Icon name="trash" className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Item</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{item.name}"? This action cannot be undone.
            {item._count.products > 0 && (
              <span className="block mt-2 text-destructive">
                This item has {item._count.products} products that will be moved to "Uncategorized".
              </span>
            )}
            {hasChildren && (
              <span className="block mt-2 text-destructive">
                This item has {item._count.children} subitems that will also be deleted.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <fetcher.Form 
            method="POST" 
            action={`/admin/items/${item.slug}/delete`}
          >
            <input type="hidden" name="itemId" value={item.id} />
            <AlertDialogAction
              type="submit"
              disabled={fetcher.state !== 'idle'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
            >
              {fetcher.state === 'idle' ? 'Delete Item' : 'Deleting...'}
            </AlertDialogAction>
          </fetcher.Form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

### 2. Detail/View Page (`$slug.tsx` or `$id.tsx`)

The detail page provides comprehensive information about a specific item.

#### Structure

```tsx
export default function ItemView({ loaderData }: Route.ComponentProps) {
  const { item, relatedData } = loaderData
  const isSystemItem = item.id === SYSTEM_ITEM_ID

  return (
    <div className="space-y-8 animate-slide-top">
      {/* Header with title and badges */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold tracking-tight">{item.name}</h1>
            {isSystemItem && (
              <Badge variant="warning">System Item</Badge>
            )}
            <Badge variant={item.status === 'active' ? 'success' : 'secondary'}>
              {item.status}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {item.description || 'No description provided'}
            {isSystemItem && (
              <span className="block mt-2 text-sm text-amber-600 dark:text-amber-400">
                ⚠️ This is a system item. Items without a category will be assigned to this one.
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="edit">
              <Icon name="pencil-1" className="h-4 w-4 mr-2" />
              Edit
            </Link>
          </Button>
        </div>
      </div>

      {/* Statistics cards in grid */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{item._count.products}</div>
            <p className="text-xs text-muted-foreground">
              Products in this item
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Subitems
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{item._count.children}</div>
            <p className="text-xs text-muted-foreground">
              Direct subitems
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Created
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">
              {new Date(item.createdAt).toLocaleDateString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(item.createdAt).toLocaleTimeString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Content sections using Cards */}
      {item.children && item.children.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Subitems</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {item.children.map((child: any) => (
                <div key={child.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <Link 
                      to={`/admin/items/${child.slug}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {child.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {child._count.products} products
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/admin/items/${child.slug}`}>
                      <Icon name="arrow-right" className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent products section */}
      {relatedData.products && relatedData.products.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Products</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/admin/products?category=${item.slug}`}>
                  View All
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {relatedData.products.map((product: any) => (
                <div key={product.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {product.images[0] && (
                      <img 
                        src={product.images[0].objectKey} 
                        alt={product.name}
                        className="h-10 w-10 rounded object-cover"
                      />
                    )}
                    <div>
                      <Link 
                        to={`/admin/products/${product.slug}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {product.name}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        SKU: {product.sku} • ${product.price}
                      </p>
                    </div>
                  </div>
                  <Badge variant={product.status === 'active' ? 'success' : 'secondary'}>
                    {product.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

### 3. Edit Page (`$slug_.edit.tsx` or `$id_.edit.tsx`)

The edit page provides a form interface for modifying item properties.

#### Form Schema

```typescript
const ItemEditSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  slug: z.string().min(1, 'Slug is required').max(100, 'Slug must be less than 100 characters').regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  parentId: z.string().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
})
```

#### Action with Validation

```typescript
export async function action({ params, request }: Route.ActionArgs) {
  await requireUserWithRole(request, 'admin')

  const formData = await parseFormData(request)
  const submission = await parseWithZod(formData, {
    schema: ItemEditSchema.superRefine(async (data, ctx) => {
      // Check slug uniqueness (excluding current item)
      const existingItem = await prisma.MODEL.findFirst({
        where: {
          slug: data.slug,
          id: { not: data.id },
        },
      })
      if (existingItem) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Slug already exists',
          path: ['slug'],
        })
      }

      // Check parent exists and prevent circular reference
      if (data.parentId) {
        const parent = await prisma.MODEL.findUnique({
          where: { id: data.parentId },
        })
        if (!parent) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Parent item not found',
            path: ['parentId'],
          })
        }
        // Prevent setting self as parent
        if (data.parentId === data.id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Cannot set item as its own parent',
            path: ['parentId'],
          })
        }
      }

      // Allow editing system items but warn about slug changes
      if (data.id === SYSTEM_ITEM_ID && data.slug !== 'uncategorized') {
        // Allow but don't prevent - just a warning in the UI
      }
    })
  })

  if (submission.status !== 'success') {
    return data({ result: submission.reply() }, { status: 400 })
  }

  const { id, ...updateData } = submission.value

  await prisma.MODEL.update({
    where: { id },
    data: updateData,
  })

  return redirectWithToast(`/admin/items/${submission.value.slug}`, {
    type: 'success',
    title: 'Success',
    description: 'Item updated successfully',
  })
}
```

#### Form Layout

```tsx
export default function ItemEdit({ loaderData }: Route.ComponentProps) {
  const { item, categories } = loaderData
  const isPending = useIsPending()
  const isSystemItem = item.id === SYSTEM_ITEM_ID

  const [form, fields] = useForm({
    id: 'item-edit-form',
    constraint: getZodConstraint(ItemEditSchema),
    lastResult: loaderData.result,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: ItemEditSchema })
    },
    defaultValue: {
      id: item.id,
      name: item.name,
      slug: item.slug,
      description: item.description || '',
      parentId: item.parentId || '',
      status: item.status,
    },
  })

  return (
    <div className="space-y-8 animate-slide-top">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Item</h1>
          <p className="text-muted-foreground">
            Update item information and settings
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to={`/admin/items/${item.slug}`}>
            <Icon name="arrow-left" className="h-4 w-4 mr-2" />
            Back to Item
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Item Details</CardTitle>
            {isSystemItem && (
              <Badge variant="warning">System Item</Badge>
            )}
          </div>
          {isSystemItem && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              ⚠️ This is a system item. Consider keeping the slug as "uncategorized" for consistency.
            </p>
          )}
        </CardHeader>
        <CardContent>
          <Form method="POST" {...getFormProps(form)}>
            <input type="hidden" name="id" value={item.id} />
            
            <div className="grid gap-6">
              {/* Name field */}
              <div className="space-y-2">
                <Label htmlFor={fields.name.id}>Name</Label>
                <Input
                  {...getInputProps(fields.name, { type: 'text' })}
                  placeholder="Enter item name"
                  className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                />
                <ErrorList errors={fields.name.errors} />
              </div>

              {/* Slug field */}
              <div className="space-y-2">
                <Label htmlFor={fields.slug.id}>Slug</Label>
                <Input
                  {...getInputProps(fields.slug, { type: 'text' })}
                  placeholder="item-slug"
                  className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                />
                <p className="text-xs text-muted-foreground">
                  URL-friendly identifier. Only lowercase letters, numbers, and hyphens.
                </p>
                <ErrorList errors={fields.slug.errors} />
              </div>

              {/* Description field */}
              <div className="space-y-2">
                <Label htmlFor={fields.description.id}>Description</Label>
                <Textarea
                  {...getTextareaProps(fields.description)}
                  placeholder="Enter item description (optional)"
                  className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                  rows={3}
                />
                <ErrorList errors={fields.description.errors} />
              </div>

              {/* Parent selection */}
              <div className="space-y-2">
                <Label htmlFor={fields.parentId.id}>Parent Item</Label>
                <Select {...getInputProps(fields.parentId, { type: 'text' })}>
                  <SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20">
                    <SelectValue placeholder="Select parent item (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None (Root Item)</SelectItem>
                    {categories.map((category: any) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ErrorList errors={fields.parentId.errors} />
              </div>

              {/* Status field */}
              <div className="space-y-2">
                <Label htmlFor={fields.status.id}>Status</Label>
                <Select {...getInputProps(fields.status, { type: 'text' })}>
                  <SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
                <ErrorList errors={fields.status.errors} />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-4 justify-end mt-8 pt-6 border-t">
              <Button variant="outline" asChild>
                <Link to={`/admin/items/${item.slug}`}>
                  Cancel
                </Link>
              </Button>
              <Button 
                type="submit" 
                disabled={isPending}
                className="transition-all duration-200"
              >
                {isPending ? (
                  <>
                    <Icon name="update" className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Icon name="check" className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
```

### 4. Delete Action (`$slug.delete.ts` or `$id.delete.ts`)

The delete action handles safe deletion with proper validation and error handling.

#### Delete Action Pattern
```typescript
import { invariantResponse } from '@epic-web/invariant'
import { parseFormData } from '@mjackson/form-data-parser'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$slug.delete.ts'

export async function action({ params: _params, request }: Route.ActionArgs) {
  await requireUserWithRole(request, 'admin')

  const formData = await parseFormData(request)
  const itemId = formData.get('itemId')

  invariantResponse(itemId, 'Item ID is required')

  // Get the item with related data to check for dependencies
  const item = await prisma.MODEL.findUnique({
    where: { id: itemId as string },
    include: {
      // Include related data to check for dependencies
      relatedItems: {
        include: {
          _count: {
            select: { dependentItems: true },
          },
        },
      },
    },
  })

  invariantResponse(item, 'Item not found', { status: 404 })

  // Check if item can be safely deleted
  const hasDependencies = item.relatedItems.some(related => related._count.dependentItems > 0)
  if (hasDependencies) {
    return redirectWithToast('/admin/items', {
      type: 'error',
      title: 'Cannot Delete Item',
      description: 'This item is used by other items and cannot be deleted.',
    })
  }

  // Delete the item (related items will be deleted due to cascade)
  await prisma.MODEL.delete({
    where: { id: itemId as string },
  })

  return redirectWithToast('/admin/items', {
    type: 'success',
    title: 'Item Deleted',
    description: `"${item.name}" has been deleted successfully.`,
  })
}
```

### 5. New/Create Page (`new.tsx`)

Similar to the edit page but without existing item data and simpler validation.

```tsx
export default function NewItem({ loaderData }: Route.ComponentProps) {
  const { categories } = loaderData
  const isPending = useIsPending()

  const [form, fields] = useForm({
    id: 'new-item-form',
    constraint: getZodConstraint(ItemCreateSchema),
    lastResult: loaderData.result,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: ItemCreateSchema })
    },
    defaultValue: {
      name: '',
      slug: '',
      description: '',
      parentId: '',
      status: 'active',
    },
  })

  return (
    <div className="space-y-8 animate-slide-top">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create New Item</h1>
          <p className="text-muted-foreground">
            Add a new item to your collection
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/admin/items">
            <Icon name="arrow-left" className="h-4 w-4 mr-2" />
            Back to Items
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Item Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="POST" {...getFormProps(form)}>
            {/* Form fields similar to edit page */}
            {/* ... */}
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
```

## Styling Guidelines

### Colors & Theming

Use Tailwind CSS utility classes with CSS variables for consistent theming:

- **Backgrounds**: `bg-card`, `bg-background`, `bg-muted`, `bg-primary`
- **Text**: `text-foreground`, `text-muted-foreground`, `text-primary`, `text-destructive`
- **Borders**: `border`, `border-input`, `border-primary`
- **States**: `hover:bg-muted/50`, `focus:ring-2 focus:ring-primary/20`

### Spacing

Consistent spacing throughout the application:

- **Container spacing**: `space-y-8` for main sections
- **Form spacing**: `space-y-2` for field groups, `gap-6` for field grid
- **Card padding**: Default padding handled by Card components
- **Responsive gaps**: `gap-4 md:gap-6`
- **Button spacing**: `gap-2` for button groups

### Typography

Hierarchical typography system:

- **Page title**: `text-3xl font-bold tracking-tight`
- **Section title**: `text-2xl font-semibold` (CardTitle)
- **Field labels**: Default Label styling
- **Description text**: `text-muted-foreground`
- **Small text**: `text-xs`, `text-sm`
- **Body text**: Default paragraph styling

### Animations

Subtle animations for enhanced user experience:

- **Page entrance**: `animate-slide-top` on main container
- **Hover effects**: `hover:shadow-md`, `hover:bg-muted/50`
- **Transitions**: `transition-colors duration-200`, `transition-shadow duration-200`
- **Loading states**: `animate-spin` for loading icons

### Responsive Design

Mobile-first responsive approach:

- **Breakpoints**: `sm:` (640px), `md:` (768px), `lg:` (1024px)
- **Grid layouts**: `grid gap-6 md:grid-cols-2 lg:grid-cols-3`
- **Flex layouts**: `flex-col sm:flex-row`
- **Hide/show**: `hidden md:block`, `md:hidden`
- **Table responsiveness**: `hidden md:table-cell` for columns

## Toast Notifications

Configure toast notifications to appear at the bottom center of the screen:

```typescript
// In root.tsx
<EpicToaster closeButton position="bottom-center" theme={theme} />
```

Usage in actions:

```typescript
return redirectWithToast('/path', {
  type: 'success', // or 'error', 'info'
  title: 'Success',
  description: 'Action completed successfully'
})
```

## Special Patterns

### Non-Hierarchical Data (like Attributes)

For items that don't have parent-child relationships but have related sub-items (like attributes with values):

#### Data Structure
```typescript
// Loader pattern for non-hierarchical data
export async function loader({ request }: Route.LoaderArgs) {
  await requireUserWithRole(request, 'admin')

  const items = await prisma.MODEL.findMany({
    include: {
      subItems: {
        orderBy: { displayOrder: 'asc' },
        include: {
          _count: {
            select: { relatedItems: true },
          },
        },
      },
      _count: {
        select: { subItems: true },
      },
    },
    orderBy: { displayOrder: 'asc' },
  })

  return { items }
}
```

#### Display Pattern for Sub-Items
```tsx
// In table cells, show sub-items as badges with overflow
<TableCell className="hidden md:table-cell">
  <div className="flex flex-wrap gap-1">
    {item.subItems.slice(0, 3).map((subItem: any) => (
      <Badge key={subItem.id} variant="secondary" className="text-xs">
        {subItem.value}
      </Badge>
    ))}
    {item.subItems.length > 3 && (
      <Badge variant="outline" className="text-xs">
        +{item.subItems.length - 3} more
      </Badge>
    )}
  </div>
</TableCell>
```

#### Mobile Display for Sub-Items
```tsx
// Show sub-item count in mobile view
<p className="text-sm text-muted-foreground md:hidden">
  {item._count.subItems} sub-items • {totalRelatedItems} related items
</p>
```

### Product Images in Detail Pages

When displaying products in detail pages, use proper image resource URLs:

#### Image Display Pattern
```tsx
{product.images[0] ? (
  <div className="h-10 w-10 flex-shrink-0">
    <img 
      src={`/resources/images?ij&objectKey=${encodeURIComponent(product.images[0].objectKey)}`} 
      alt={product.images[0].altText || product.name}
      className="h-10 w-10 rounded object-cover"
    />
  </div>
) : (
  <div className="h-10 w-10 flex-shrink-0 rounded bg-muted flex items-center justify-center">
    <Icon name="image" className="h-5 w-5 text-muted-foreground" />
  </div>
)}
```

#### Price Display for Decimal Fields
When displaying Prisma Decimal fields (like prices), convert them in the loader:

```typescript
// In loader
return { 
  items,
  relatedProducts: products.map(product => ({
    ...product,
    price: Number(product.price), // Convert Decimal to number
  }))
}
```

```tsx
// In component
<p className="text-sm text-muted-foreground">
  SKU: {product.sku} • ${product.price.toFixed(2)}
</p>
```

### System Items (like Uncategorized category)

For special system items that require fixed IDs:

1. **Create shared utility file** (e.g., `app/utils/category.ts`):
```typescript
export const SYSTEM_ITEM_ID = 'system-item-id'
```

2. **Display with warning Badge**:
```tsx
<Badge variant="warning">System Item</Badge>
```

3. **Add warning messages**:
```tsx
{isSystemItem && (
  <span className="block mt-2 text-sm text-amber-600 dark:text-amber-400">
    ⚠️ This is a system item. Items without a category will be assigned to this one.
  </span>
)}
```

4. **Allow editing but warn users** about implications

### Hierarchical Data

For items with parent-child relationships:

1. **Flatten in `useMemo`** for searching:
```typescript
const flatten = (items: any[], level = 0): any[] => {
  const result: any[] = []
  for (const item of items) {
    result.push({ ...item, level })
    if (item.children && item.children.length > 0) {
      result.push(...flatten(item.children, level + 1))
    }
  }
  return result
}
```

2. **Display with indentation**:
```tsx
<div className={`flex items-center space-x-3 ${level > 0 ? `ml-${level * 6}` : ''}`}>
  {level > 0 && (
    <Icon name="chevron-right" className="h-4 w-4 text-muted-foreground" />
  )}
  {/* Content */}
</div>
```

3. **Show hierarchical structure** when unfiltered, flat list when filtered

### Client/Server Code Separation

Follow Remix best practices for code organization:

1. **Server-only utilities**: `*.server.ts` files
2. **Shared constants**: Regular `.ts` files (not `.server.ts`)
3. **Import server code only** in loaders/actions
4. **Use Remix's code splitting** to prevent server code in client bundles

## Accessibility

Ensure all components are accessible:

1. **Use semantic HTML** (headings, lists, tables)
2. **Ensure proper ARIA labels** on form fields
3. **Use Radix UI components** for built-in accessibility
4. **Ensure keyboard navigation** works properly
5. **Provide descriptive alt text** and labels
6. **Maintain proper focus management**

## Performance

Optimize for performance:

1. **Use `useMemo`** for expensive computations
2. **Implement client-side filtering** for better UX
3. **Limit initial data loads** (e.g., first 10 items)
4. **Use optimistic UI** with fetcher for better perceived performance
5. **Lazy load** non-critical components

## File Naming Conventions

Follow consistent file naming patterns:

- **List page**: `index.tsx`
- **View page**: `$slug.tsx` or `$id.tsx`
- **Edit page**: `$slug_.edit.tsx` (note the underscore before dot)
- **Create page**: `new.tsx`
- **Delete action**: `$slug.delete.ts` or `$id.delete.ts`

## Migration Checklist for Existing Pages

When updating existing pages to the modern pattern:

1. **Install missing dependencies** (`@radix-ui/react-alert-dialog`, etc.)
2. **Create/update UI components** (Badge, Card, AlertDialog)
3. **Update imports** to use shadcn components
4. **Replace inline confirmations** with AlertDialog
5. **Add search and filter functionality**
6. **Implement mobile responsiveness**
7. **Update toast notification position**
8. **Add animations and transitions**
9. **Use Card components** for layouts
10. **Ensure proper spacing and typography**
11. **Test on mobile devices**
12. **Check for linting errors**
13. **Verify accessibility**

## Key Files to Reference

When implementing new pages, reference these example files:

### Hierarchical Data (Categories)
- `/Users/marvin/dev/lieutner/shop/app/routes/admin+/categories+/index.tsx` - List page pattern with hierarchy
- `/Users/marvin/dev/lieutner/shop/app/routes/admin+/categories+/$categorySlug.tsx` - Detail page pattern
- `/Users/marvin/dev/lieutner/shop/app/routes/admin+/categories+/$categorySlug_.edit.tsx` - Edit page pattern
- `/Users/marvin/dev/lieutner/shop/app/routes/admin+/categories+/new.tsx` - Create page pattern

### Non-Hierarchical Data (Attributes)
- `/Users/marvin/dev/lieutner/shop/app/routes/admin+/attributes+/index.tsx` - List page pattern with sub-items
- `/Users/marvin/dev/lieutner/shop/app/routes/admin+/attributes+/$attributeId.tsx` - Detail page with product images
- `/Users/marvin/dev/lieutner/shop/app/routes/admin+/attributes+/$attributeId_.edit.tsx` - Edit page pattern
- `/Users/marvin/dev/lieutner/shop/app/routes/admin+/attributes+/new.tsx` - Create page pattern
- `/Users/marvin/dev/lieutner/shop/app/routes/admin+/attributes+/$attributeId.delete.ts` - Delete action pattern

### UI Components
- `/Users/marvin/dev/lieutner/shop/app/components/ui/badge.tsx` - Badge component
- `/Users/marvin/dev/lieutner/shop/app/components/ui/card.tsx` - Card component
- `/Users/marvin/dev/lieutner/shop/app/components/ui/alert-dialog.tsx` - AlertDialog component

## Dependencies

Ensure these packages are installed:

```json
{
  "@radix-ui/react-alert-dialog": "^1.0.5",
  "@radix-ui/react-select": "^2.0.0",
  "class-variance-authority": "^0.7.0",
  "@conform-to/react": "^0.4.0",
  "@conform-to/zod": "^0.4.0",
  "zod": "^3.22.0"
}
```

## Conclusion

This guide provides a comprehensive foundation for implementing modern, accessible, and responsive admin pages. By following these patterns, you'll ensure consistency across the application while providing an excellent user experience on all devices.

Remember to:
- Test thoroughly on mobile devices
- Verify accessibility compliance
- Check for linting errors
- Ensure proper error handling
- Maintain consistent styling and behavior
