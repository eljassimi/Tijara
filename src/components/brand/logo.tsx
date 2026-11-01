import { ZelligeMark } from "./zellige-mark";

type LogoProps = {
  compact?: boolean;
  inverse?: boolean;
};

export function Logo({ compact = false, inverse = false }: LogoProps) {
  return (
    <span className="brand-logo" data-inverse={inverse || undefined}>
      <span className="brand-logo__mark">
        <ZelligeMark />
      </span>
      {!compact && (
        <span className="brand-logo__words" aria-label="Tijara تجارة">
          <span>Tijara</span>
          <span lang="ar" dir="rtl">
            تجارة
          </span>
        </span>
      )}
    </span>
  );
}
