export default function Loading() {
  return (
    <div aria-live="polite" className="route-loading telecom-route-loading" role="status">
      <span className="visually-hidden">Đang tải danh mục số điện thoại…</span>
      <div className="route-loading-header">
        <span className="route-loading-line route-loading-line-short" />
        <span className="route-loading-line route-loading-line-title" />
        <span className="route-loading-line route-loading-line-description" />
      </div>
      <div className="route-loading-panel telecom-route-loading-filter">
        <span className="route-loading-line route-loading-line-heading" />
        <span className="route-loading-line" />
      </div>
      <div className="route-loading-panel">
        <span className="route-loading-line route-loading-line-heading" />
        <span className="route-loading-line" />
        <span className="route-loading-line" />
        <span className="route-loading-line" />
        <span className="route-loading-line" />
      </div>
    </div>
  );
}
