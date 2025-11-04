# Icons

Icons are managed using the `sly` CLI tool, which downloads SVG icons from various icon libraries (Radix UI, Lucide, etc.) into this directory.

## Icon Libraries

The project uses icons from:
- **@radix-ui/icons**: UI component icons (e.g., `cross-1`, `pencil-1`, `gear`)
- **lucide-icons**: Modern, consistent icon set (e.g., `layout-dashboard`, `package`, `settings`, `store`)

## Adding New Icons

### Using Sly CLI

To add icons from a configured library:

```bash
# Add icons from Lucide
npx @sly-cli/sly add lucide-icons icon-name-1 icon-name-2 --yes --directory ./other/svg-icons

# Add icons from Radix UI
npx @sly-cli/sly add @radix-ui/icons icon-name-1 icon-name-2 --yes --directory ./other/svg-icons
```

### Configuration

The `sly` configuration is in `other/sly/sly.json`. It automatically:
- Downloads icons to `./other/svg-icons`
- Applies transformers (license info, etc.)
- Regenerates the sprite sheet via `vite-plugin-icons-spritesheet`

### Using Icons in Components

After adding icons, they're automatically available in the sprite system:

```tsx
import { Icon } from '#app/components/ui/icon.tsx'

<Icon name="layout-dashboard" className="size-4" />
```

**Important**: Only add icons that the application actually needs, as the `vite-plugin-icons-spritesheet` plugin regenerates the sprite sheet on every edit/delete/add to this directory.
