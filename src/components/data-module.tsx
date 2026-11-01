import { Database, Info } from "lucide-react";

export type DataRow = { reference: string; detail: string; status: string };

export function DataModule({
  title,
  body,
  notice,
  labels,
  rows,
}: {
  title: string;
  body: string;
  notice: string;
  labels: {
    records: string;
    reference: string;
    detail: string;
    status: string;
    empty: string;
  };
  rows: DataRow[];
}) {
  return (
    <main>
      <div className="dashboard-heading">
        <div>
          {notice ? <p className="app-kicker">{notice}</p> : null}
          <h1>{title}</h1>
          <p>{body}</p>
        </div>
      </div>
      <section className="module-panel">
        <div className="module-panel__head">
          <h2>
            <Database size={19} />
            {labels.records}
          </h2>
          <span>{rows.length}</span>
        </div>
        {rows.length ? (
          <div className="module-table">
            <div className="module-table__row module-table__row--head">
              <span>{labels.reference}</span>
              <span>{labels.detail}</span>
              <span>{labels.status}</span>
            </div>
            {rows.map((row) => (
              <div
                className="module-table__row"
                key={`${row.reference}-${row.detail}`}
              >
                <strong>{row.reference}</strong>
                <span>{row.detail}</span>
                <span className="module-status">
                  <i />
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="module-empty">
            <Info size={24} />
            <p>{labels.empty}</p>
          </div>
        )}
      </section>
    </main>
  );
}
