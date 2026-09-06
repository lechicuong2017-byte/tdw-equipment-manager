import Link from "next/link";
import { AppIcon } from "@/components/app-icon";
import { ConfirmAction } from "@/components/app-modal";
import { can, requireAccess } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { deleteTollMonthlyBatch, deleteTollQuarterlyPass } from "@/app/(protected)/vehicles/vehicle-tolls-actions";

export async function VehicleTollMetric({ year }: { year: number }) {
  const { supabase } = await requireAccess();
  const { data, error } = await supabase.rpc("vehicle_toll_year_totals", { target_year: year });
  return <article className="metric-card metric-tone-cyan"><span className="metric-icon"><AppIcon name="toll" /></span>
    <p>Chi phí VETC</p><strong className="metric-money">{error ? "Chưa tải được" : formatMoney(Number(data?.monthly || 0) + Number(data?.quarterly || 0))}</strong>
    <small>Năm {year} · vé lẻ và vé quý</small>
  </article>;
}

export async function VehicleTollSection({ year: requestedYear, page: requestedPage }: { year?: string; page?: string }) {
  const { access, supabase } = await requireAccess();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const year = /^\d{4}$/.test(requestedYear || "") && Number(requestedYear) >= 2000 && Number(requestedYear) <= 2100
    ? Number(requestedYear) : Number(today.slice(0, 4));
  const page = Math.min(10000, Math.max(1, Number.parseInt(requestedPage || "1", 10) || 1));
  const pageSize = 10;
  const [months, passes, totals] = await Promise.all([
    supabase.from("vehicle_toll_monthly_batches").select("id,period_month,transaction_count,vehicle_count,station_count,amount_after_tax,source_file_name")
      .gte("period_month", `${year}-01-01`).lt("period_month", `${year + 1}-01-01`).order("period_month", { ascending: false }),
    supabase.from("vehicle_toll_quarterly_passes").select("id,license_plate,vehicle_type,vehicle_color,starts_on,expires_on,toll_station,amount,source_sheet", { count: "exact" })
      .gte("starts_on", `${year}-01-01`).lt("starts_on", `${year + 1}-01-01`).order("starts_on", { ascending: false }).order("id")
      .range((page - 1) * pageSize, page * pageSize - 1),
    supabase.rpc("vehicle_toll_year_totals", { target_year: year }),
  ]);
  const failed = months.error || passes.error || totals.error;
  const canDelete = can(access, "vehicles.delete");
  const pageCount = Math.max(1, Math.ceil((passes.count || 0) / pageSize));
  return <div className="toll-workspace">
    <form action="/vehicles" className="panel toll-year-filter">
      <input name="section" type="hidden" value="tolls" />
      <label>Năm thống kê<input defaultValue={year} max="2100" min="2000" name="year" required type="number" /></label>
      <button className="secondary-button" type="submit">Xem năm</button>
      <span>Vé quý được tính chi phí vào năm bắt đầu hiệu lực.</span>
      {can(access, "reports.vehicles.export") ? <a className="secondary-button" href={`/api/vehicles/tolls/report?year=${year}`}>Xuất Excel năm {year}</a> : null}
    </form>
    {failed ? <div className="panel"><p className="form-error">Chưa tải được dữ liệu VETC. Hãy thử tải lại trang; nếu vẫn lỗi, kiểm tra migration và quyền truy cập.</p></div> : <>
      <section className="metric-grid vehicle-stats-grid">
        <article className="metric-card metric-tone-cyan"><p>Vé lẻ năm {year}</p><strong className="metric-money">{formatMoney(Number(totals.data?.monthly || 0))}</strong><small>Chi phí sau thuế của các lượt qua trạm</small></article>
        <article className="metric-card metric-tone-amber"><p>Vé quý năm {year}</p><strong className="metric-money">{formatMoney(Number(totals.data?.quarterly || 0))}</strong><small>{passes.count || 0} đăng ký bắt đầu trong năm</small></article>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">VÉ LẺ HÀNG THÁNG</p><h2>Chi phí qua trạm trong tháng</h2></div><small>{months.data?.length || 0} tháng</small></div>
        <div className="table-wrap toll-table"><table><thead><tr><th>Tháng</th><th>Lượt qua trạm</th><th>Xe / trạm</th><th className="vehicle-cost-cell">Tổng sau thuế</th><th>Thao tác</th></tr></thead>
          <tbody>{months.data?.map((item) => <tr key={item.id}>
            <td><strong>Tháng {item.period_month.slice(5, 7)}/{item.period_month.slice(0, 4)}</strong></td>
            <td>{item.transaction_count} lượt</td><td>{item.vehicle_count} xe · {item.station_count} trạm</td>
            <td className="vehicle-cost-cell">{formatMoney(Number(item.amount_after_tax))}</td>
            <td><div className="row-actions"><Link className="text-link" href={`/vehicles/tolls/${item.id}`}>Xem chi tiết</Link>
              {canDelete ? <ConfirmAction action={deleteTollMonthlyBatch} fields={{ id: item.id }} title="Xóa tháng VETC?" description="Toàn bộ giao dịch vé lẻ trong tháng này sẽ bị xóa. Bạn có thể nhập lại từ PDF gốc." /> : null}
            </div></td>
          </tr>)}{!months.data?.length ? <tr><td className="empty-cell" colSpan={5}>Chưa có tháng tổng hợp trong phạm vi quyền truy cập. Chọn “Nhập vé lẻ PDF” để thêm dữ liệu.</td></tr> : null}</tbody>
        </table></div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">VÉ QUÝ</p><h2>Đăng ký xe qua trạm</h2></div><small>{passes.count || 0} đăng ký</small></div>
        <div className="table-wrap toll-table"><table><thead><tr><th>Xe</th><th>Trạm</th><th>Khoảng hiệu lực</th><th className="vehicle-cost-cell">Chi phí có VAT</th><th>Thao tác</th></tr></thead>
          <tbody>{passes.data?.map((item) => <tr key={item.id}>
            <td><strong>{item.license_plate}</strong><small>{[item.vehicle_type, item.vehicle_color].filter(Boolean).join(" · ")}</small></td>
            <td>{item.toll_station}</td><td>{formatDate(item.starts_on)} – {formatDate(item.expires_on)}<small>{today < item.starts_on ? "Chưa đến kỳ" : today > item.expires_on ? "Đã hết hạn" : "Đang có hiệu lực"}</small></td>
            <td className="vehicle-cost-cell">{formatMoney(Number(item.amount))}</td>
            <td>{canDelete ? <ConfirmAction action={deleteTollQuarterlyPass} fields={{ id: item.id }} title="Xóa đăng ký vé quý?" description={`Xóa đăng ký xe ${item.license_plate} qua trạm ${item.toll_station} trong kỳ này.`} /> : "—"}</td>
          </tr>)}{!passes.data?.length ? <tr><td className="empty-cell" colSpan={5}>Chưa có đăng ký trong năm này. Chọn “Nhập vé quý XLSX” để thêm dữ liệu.</td></tr> : null}</tbody>
        </table></div>
        {pageCount > 1 ? <nav className="vehicle-pagination" aria-label="Phân trang vé quý"><span>Trang {page} / {pageCount}</span><div>
          {page > 1 ? <Link className="secondary-button" href={`/vehicles?section=tolls&year=${year}&tollPage=${page - 1}`}>← Trước</Link> : null}
          {page < pageCount ? <Link className="secondary-button" href={`/vehicles?section=tolls&year=${year}&tollPage=${page + 1}`}>Sau →</Link> : null}
        </div></nav> : null}
      </section>
    </>}
  </div>;
}
