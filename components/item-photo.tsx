import type { CardPhoto } from "@/lib/items";
import { placeholderDataUri } from "@/lib/images/placeholder";
import { photoSrc, photoSrcSet } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Photo with a blurhash placeholder underneath. The placeholder is a tiny
 * server-rendered PNG, so it shows before the photo loads and without JS.
 */
export async function ItemPhoto({
  photo,
  alt,
  sizes,
  priority = false,
  className,
}: {
  photo: CardPhoto;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const placeholder = await placeholderDataUri(photo.blurhash, photo.width, photo.height);
  const fallbackWidth = photo.variants.find((w) => w >= 800) ?? photo.variants.at(-1)!;
  return (
    <div className={cn("bg-surface-2 relative overflow-hidden", className)}>
      <img
        src={placeholder}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <img
        src={photoSrc(photo.id, fallbackWidth)}
        srcSet={photoSrcSet(photo.id, photo.variants)}
        sizes={sizes}
        alt={alt}
        width={photo.width}
        height={photo.height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        className="relative h-full w-full object-cover"
      />
    </div>
  );
}
