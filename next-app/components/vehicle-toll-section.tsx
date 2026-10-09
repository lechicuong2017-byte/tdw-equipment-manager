import Link from "next/link";
import { AppIcon } from "@/components/app-icon";
import { ConfirmAction } from "@/components/app-modal";
import { VehicleHistoryTabs } from "@/components/vehicle-history-tabs";
import { can, requireAccess } from "@/lib/auth";
import { formatDate, formatMoney, vietnamMonth, vietnamToday } from "@/lib/format";
import { periodDueTone } from "@/lib/vehicle-due-status";
import { deleteTollMonthlyBatch, deleteTollQuarterlyPass } from "@/app/(protected)/vehicles/vehicle-tolls-actions";

export async function VehicleTollMetric({ year }: { year: number }) {
  const { supabase } = await requireAccess();
  const { data, error } = await supabase.rpc("vehicle_toll_year_totals", { target_year: year });
  return <article className="metric-card metric-tone-cyan"><span className="metric-icon"><AppIcon name="toll" /></span>
    <p>Chi phí VETC</p><strong className="metric-money">{error ? "Chưa tải được" : formatMoney(Number(data?.monthly || 0) + Number(data?.quarterly || 0))}</strong>
    <small>Năm {year} · vé lẻ và vé quý</small>
  </article>;
}

export async function VehicleTollSection({
  year: requestedYear,
  vehicleId: requestedVehicleId,
  page: requestedPage,
  view: requestedView,
}: { year?: string; vehicleId?: string; page?: string; view?: string }) {
  const { access, supabase } = await requireAccess();
  const today = vietnamToday();
  const year = /^\d{4}$/.test(requestedYear || "") && Number(requestedYear) >= 2000 && Number(requestedYear) <= 2100
    ? Number(requestedYear) : Number(today.slice(0, 4));
  const view: "current" | "history" = requestedView === "history" ? "history" : "current";
  const vehicleId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedVehicleId || "")
    ? requestedVehicleId!
    : null;
  const page = Math.min(10000, Math.max(1, Number.parseInt(requestedPage || "1", 10) || 1));
  const pageSize = 10;
  let passesQuery = supabase.from("vehicle_toll_quarterly_records").select("id,vehicle_id,license_plate,vehicle_type,vehicle_color,starts_on,expires_on,toll_station,amount,source_sheet,is_current", { count: "exact" })
    .eq("is_current", view === "current").gte("starts_on", `${year}-01-01`).lt("starts_on", `${year + 1}-01-01`);
  let quarterlyCountQuery = supabase.from("vehicle_toll_quarterly_passes").select("id", { count: "exact", head: true })
    .gte("starts_on", `${year}-01-01`).lt("starts_on", `${year + 1}-01-01`);
  if (vehicleId) {
    passesQuery = passesQuery.eq("vehicle_id", vehicleId);
    quarterlyCountQuery = quarterlyCountQuery.eq("vehicle_id", vehicleId);
  }
  const [vehiclesResult, months, passes, quarterlyTotal, totals, vehicleTransactions, vehicleQuarterlyCosts] = await Promise.all([
    supabase.from("vehicles").select("id,vehicle_name,license_plate").is("deleted_at", null).order("license_plate").limit(500),
    vehicleId ? Promise.resolve({ data: [], error: null }) : supabase.from("vehicle_toll_monthly_batches").select("id,period_month,transaction_count,vehicle_count,station_count,amount_after_tax,source_file_name")
      .gte("period_month", `${year}-01-01`).lt("period_month", `${year + 1}-01-01`).order("period_month", { ascending: false }),
    passesQuery.order("starts_on", { ascending: false }).order("id").range((page - 1) * pageSize, page * pageSize - 1),
    quarterlyCountQuery,
    vehicleId ? Promise.resolve({ data: { monthly: 0, quarterly: 0 }, error: null }) : supabase.rpc("vehicle_toll_year_totals", { target_year: year }),
    vehicleId ? supabase.from("vehicle_toll_transactions").select("batch_id,transaction_at,toll_station,amount_after_tax")
      .eq("vehicle_id", vehicleId).gte("transaction_at", `${year}-01-01T00:00:00+07:00`).lt("transaction_at", `${year + 1}-01-01T00:00:00+07:00`).order("transaction_at", { ascending: false }).limit(5000) : Promise.resolve({ data: [], error: null }),
    vehicleId ? supabase.from("vehicle_toll_quarterly_passes").select("amount").eq("vehicle_id", vehicleId)
      .gte("starts_on", `${year}-01-01`).lt("starts_on", `${year + 1}-01-01`).limit(5000) : Promise.resolve({ data: [], error: null }),
  ]);
  const failed = vehiclesResult.error || months.error || passes.error || quarterlyTotal.error || totals.error || vehicleTransactions.error || vehicleQuarterlyCosts.error;
  const selectedVehicle = vehiclesResult.data?.find((vehicle) => vehicle.id === vehicleId);
  const filteredMonths = new Map<string, { id: string; period_month: string; transaction_count: number; vehicle_count: number; station_count: number; amount_after_tax: number; stations: Set<string> }>();
  for (const transaction of vehicleTransactions.data || []) {
    const period = vietnamMonth(new Date(transaction.transaction_at));
    const row = filteredMonths.get(period) || { id: `vehicle-${vehicleId}-${period}`, period_month: `${period}-01`, transaction_count: 0, vehicle_count: 1, station_count: 0, amount_after_tax: 0, stations: new Set<string>() };
    row.transaction_count += 1;
    row.amount_after_tax += Number(transaction.amount_after_tax || 0);
    row.stations.add(transaction.toll_station);
    row.station_count = row.stations.size;
    filteredMonths.set(period, row);
  }
  const monthRows = vehicleId ? [...filteredMonths.values()].sort((a, b) => b.period_month.localeCompare(a.period_month)) : (months.data || []);
  const monthlyAmount = vehicleId ? [...filteredMonths.values()].reduce((sum, item) => sum + item.amount_after_tax, 0) : Number(totals.data?.monthly || 0);
  const quarterlyAmount = vehicleId ? (vehicleQuarterlyCosts.data || []).reduce((sum, item) => sum + Number(item.amount || 0), 0) : Number(totals.data?.quarterly || 0);
  const canDelete = can(access, "vehicles.delete");
  const pageCount = Math.max(1, Math.ceil((passes.count || 0) / pageSize));
  return <div className="toll-workspace">
    <form action="/vehicles" className="panel toll-year-filter">
      <input name="section" type="hidden" value="tolls" />
      <input name="tollView" type="hidden" value={view} />
      <label>Năm thống kê<input defaultValue={year} max="2100" min="2000" name="year" required type="number" /></label>
      <label>Xe<select defaultValue={vehicleId || ""} name="vehicleId"><option value="">Tất cả xe</option>{vehiclesResult.data?.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.license_plate} · {vehicle.vehicle_name}</option>)}</select></label>
      <button className="secondary-button" type="submit">Xem năm</button>
      <span>{selectedVehicle ? `Đang lọc ${selectedVehicle.license_plate} · ${selectedVehicle.vehicle_name}. ` : ""}Vé quý được tính chi phí vào năm bắt đầu hiệu lực.</span>
      {can(access, "reports.vehicles.export") ? <a className="secondary-button" href={`/api/vehicles/tolls/report?year=${year}${vehicleId ? `&vehicle_id=${vehicleId}` : ""}`}>Xuất Excel năm {year}</a> : null}
    </form>
    {failed ? <div className="panel"><p className="form-error">Chưa tải được dữ liệu VETC. Hãy thử tải lại trang; nếu vẫn lỗi, kiểm tra migration và quyền truy cập.</p></div> : <>
      <section className="metric-grid vehicle-stats-grid">
        <article className="metric-card metric-tone-cyan"><p>Vé lẻ năm {year}</p><strong className="metric-money">{formatMoney(monthlyAmount)}</strong><small>Chi phí sau thuế của các lượt qua trạm</small></article>
        <article className="metric-card metric-tone-amber"><p>Vé quý năm {year}</p><strong className="metric-money">{formatMoney(quarterlyAmount)}</strong><small>{quarterlyTotal.count || 0} đăng ký bắt đầu trong năm</small></article>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">VÉ LẺ HÀNG THÁNG</p><h2>Chi phí qua trạm trong tháng</h2></div><small>{monthRows.length} tháng</small></div>
        <div className="table-wrap toll-table"><table><thead><tr><th>Tháng</th><th>Lượt qua trạm</th><th>Xe / trạm</th><th className="vehicle-cost-cell">Tổng sau thuế</th><th>Thao tác</th></tr></thead>
          <tbody>{monthRows.map((item) => <tr key={item.id}>
            <td><strong>Tháng {item.period_month.slice(5, 7)}/{item.period_month.slice(0, 4)}</strong></td>
            <td>{item.transaction_count} lượt</td><td>{item.vehicle_count} xe · {item.station_count} trạm</td>
            <td className="vehicle-cost-cell">{formatMoney(Number(item.amount_after_tax))}</td>
            <td><div className="row-actions">{vehicleId ? <span className="status-pill">Đã lọc theo xe</span> : <Link className="text-link" href={`/vehicles/tolls/${item.id}`}>Xem chi tiết</Link>}
              {canDelete && !vehicleId ? <ConfirmAction action={deleteTollMonthlyBatch} fields={{ id: item.id }} title="Xóa tháng VETC?" description="Toàn bộ giao dịch vé lẻ trong tháng này sẽ bị xóa. Bạn có thể nhập lại từ PDF gốc." /> : null}
            </div></td>
          </tr>)}{!monthRows.length ? <tr><td className="empty-cell" colSpan={5}>Chưa có tháng tổng hợp theo bộ lọc đã chọn.</td></tr> : null}</tbody>
        </table></div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">VÉ QUÝ</p><h2>{view === "history" ? "Lịch sử vé quý" : "Vé quý hiện hành"}</h2></div><small>{passes.count || 0} đăng ký</small></div>
        <VehicleHistoryTabs active={view} currentLabel="Đang hiệu lực / cần gia hạn" historyLabel="Lịch sử vé quý" section="tolls" vehicleId={vehicleId ?? undefined} year={year} />
        <div className="table-wrap toll-table"><table><thead><tr><th>Xe</th><th>Trạm</th><th>Khoảng hiệu lực</th><th className="vehicle-cost-cell">Chi phí có VAT</th><th>Thao tác</th></tr></thead>
          <tbody>{passes.data?.map((item) => {
            const due = view === "history"
              ? { className: "status-pill--inactive", label: "Đã gia hạn" }
              : periodDueTone(item.starts_on, item.expires_on, today);
            return <tr key={item.id}>
              <td><strong>{item.license_plate}</strong><small>{[item.vehicle_type, item.vehicle_color].filter(Boolean).join(" · ")}</small></td>
              <td>{item.toll_station}</td><td>{formatDate(item.starts_on)} – {formatDate(item.expires_on)}<small><span className={`status-pill ${due.className}`}>{due.label}</span></small></td>
              <td className="vehicle-cost-cell">{formatMoney(Number(item.amount))}</td>
              <td>{canDelete ? <ConfirmAction action={deleteTollQuarterlyPass} fields={{ id: item.id }} title="Xóa đăng ký vé quý?" description={`Xóa đăng ký xe ${item.license_plate} qua trạm ${item.toll_station} trong kỳ này.`} /> : "—"}</td>
            </tr>;
          })}{!passes.data?.length ? <tr><td className="empty-cell" colSpan={5}>{view === "history" ? "Chưa có vé quý đã gia hạn trong năm này." : "Chưa có vé quý hiện hành trong năm này. Chọn “Nhập vé quý XLSX” để thêm dữ liệu."}</td></tr> : null}</tbody>
        </table></div>
        {pageCount > 1 ? <nav className="vehicle-pagination" aria-label="Phân trang vé quý"><span>Trang {page} / {pageCount}</span><div>
          {page > 1 ? <Link className="secondary-button" href={`/vehicles?section=tolls&year=${year}${vehicleId ? `&vehicleId=${vehicleId}` : ""}&tollView=${view}&tollPage=${page - 1}`}>← Trước</Link> : null}
          {page < pageCount ? <Link className="secondary-button" href={`/vehicles?section=tolls&year=${year}${vehicleId ? `&vehicleId=${vehicleId}` : ""}&tollView=${view}&tollPage=${page + 1}`}>Sau →</Link> : null}
        </div></nav> : null}
      </section>
    </>}
  </div>;
}
