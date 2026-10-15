export default function Loading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="visually-hidden">Đang tải chi phí CNTT…</span>
      <div className="route-loading-header">
        <span className="route-loading-line route-loading-line-short" />
        <span className="route-loading-line route-loading-line-title" />
      </div>
      <div className="route-loading-cards">
        <span />
        <span />
        <span />
      </div>
      <div className="route-loading-panel">
        <span className="route-loading-line" />
        <span className="route-loading-line" />
        <span className="route-loading-line" />
      </div>
    </div>
  );
}
