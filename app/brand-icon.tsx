import { BRAND_ICON_PATH } from '../lib/ui/brand-icon';

// The adjacent workspace name labels this decorative, unmodified brand image.
export default function BrandIcon({ className, size = 38 }: { className?: string; size?: number }) {
  return <img className={`brand-icon${className ? ` ${className}` : ''}`} src={BRAND_ICON_PATH} width={size} height={size} alt="" aria-hidden="true" />;
}
