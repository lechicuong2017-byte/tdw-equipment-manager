export default function ProtectedLoading() {
  return (
    <div aria-live="polite" className="route-loading" role="status">
      <span className="visually-hidden">Đang tải dữ liệu…</span>
      <div className="route-loading-header">
        <span className="route-loading-line route-loading-line-short" />
        <span className="route-loading-line route-loading-line-title" />
        <span className="route-loading-line route-loading-line-description" />
      </div>
      <div className="route-loading-cards">
        <span />
        <span />
        <span />
      </div>
      <div className="route-loading-panel">
        <span className="route-loading-line route-loading-line-heading" />
        <span className="route-loading-line" />
        <span className="route-loading-line" />
        <span className="route-loading-line" />
      </div>
    </div>
  );
}
