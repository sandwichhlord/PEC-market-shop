import { ImageOff } from "lucide-react";

const SIZES = { sm: "size-10", md: "size-14", lg: "size-20" } as const;

/** Square image from /api/uploads (logos, dish photos), with a neutral fallback when there is none. */
export function Thumb({ src, alt, size = "md" }: { src: string | null; alt: string; size?: keyof typeof SIZES }) {
  const box = `${SIZES[size]} shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100`;
  if (!src) {
    return (
      <span className={`${box} flex items-center justify-center`}>
        <ImageOff aria-hidden="true" className="size-1/2 text-slate-400" />
        <span className="sr-only">{alt}</span>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- uploads include SVG placeholders, which next/image will not optimise
    <img src={src} alt={alt} loading="lazy" className={`${box} object-cover`} />
  );
}
