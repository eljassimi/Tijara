import type { SVGProps } from "react";

export function ZelligeMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M24 2.5 29.6 13l10.9-5.5L35 18.4 45.5 24 35 29.6l5.5 10.9L29.6 35 24 45.5 18.4 35 7.5 40.5 13 29.6 2.5 24 13 18.4 7.5 7.5 18.4 13 24 2.5Z"
        fill="currentColor"
      />
      <circle cx="24" cy="24" r="5.6" fill="var(--sand)" />
    </svg>
  );
}
