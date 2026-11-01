import { Link } from "@/i18n/navigation";

type OperationsPaginationProps = {
  locale: "fr" | "ar";
  page: number;
  pages: number;
  total: number;
  hrefForPage: (page: number) => {
    pathname: "/admin/confirmation" | "/admin/logistics";
    query: Record<string, string | undefined>;
  };
};

export function OperationsPagination({
  locale,
  page,
  pages,
  total,
  hrefForPage,
}: OperationsPaginationProps) {
  if (pages <= 1) return null;
  return (
    <nav className="pagination operations-pagination" aria-label="Pagination">
      <Link
        className={`button button--compact ${page <= 1 ? "is-disabled" : ""}`}
        href={hrefForPage(Math.max(1, page - 1))}
      >
        {locale === "ar" ? "السابق" : "Précédent"}
      </Link>
      <span>
        {page} / {pages} · {total}
      </span>
      <Link
        className={`button button--compact ${page >= pages ? "is-disabled" : ""}`}
        href={hrefForPage(Math.min(pages, page + 1))}
      >
        {locale === "ar" ? "التالي" : "Suivant"}
      </Link>
    </nav>
  );
}
