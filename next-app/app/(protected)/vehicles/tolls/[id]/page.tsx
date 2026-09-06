import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAccess } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { VehicleModuleNav } from "@/components/vehicle-module-nav";

export const metadata = { title: "Chi tiết VETC theo tháng" };

export default async function TollMonthPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }>;
}) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const { supabase } = await requireAccess();
  const { data: month, error } = await supabase.from("vehicle_toll_monthly_batches").select("*").eq("id", id.data).maybeSingle();
  if (error) throw new Error("Không thể tải chi tiết tháng VETC.");
  if (!month) notFound();
  const pageCount = Math.max(1, Math.ceil(month.transaction_count / 50));
  const page = Math.min(pageCount, Math.max(1, Number.parseInt((await searchParams).page || "1", 10) || 1));
  const transactions = await supabase.from("vehicle_toll_transactions")
    .select("id,license_plate,toll_station,transaction_at,invoice_number,transaction_code,amount_before_tax,tax_amount,amount_after_tax,source_page")
    .eq("batch_id", id.data).order("transaction_at").order("id").range((page - 1) * 50, page * 50 - 1);
  const period = `${month.period_month.slice(5, 7)}/${month.period_month.slice(0, 4)}`;
  return <>
    <PageHeader eyebrow="VETC · VÉ LẺ" title={`Qua trạm tháng ${period}`} description={`${month.transaction_count} lượt · ${month.vehicle_count} xe · ${month.station_count} trạm`} />
    <VehicleModuleNav active="tolls" />
    <Link className="text-link" href={`/vehicles?section=tolls&year=${month.period_month.slice(0, 4)}`}>← Về danh sách VETC</Link>
    <section className="panel toll-month-detail">
      <div className="panel-heading"><div><p className="eyebrow">CHI PHÍ SAU THUẾ</p><h2>{formatMoney(Number(month.amount_after_tax))}</h2></div><small>Chưa thuế {formatMoney(Number(month.amount_before_tax))} · VAT {formatMoney(Number(month.tax_amount))}</small></div>
      {transactions.error ? <p className="form-error">Chưa tải được các lượt qua trạm. Hãy tải lại trang.</p> : <div className="table-wrap toll-table"><table>
        <thead><tr><th>Xe</th><th>Trạm</th><th>Ngày giờ qua trạm</th><th>Hóa đơn / mã GD</th><th>Chưa thuế</th><th>VAT</th><th>Sau thuế</th></tr></thead>
        <tbody>{transactions.data?.map((row) => <tr key={row.id}>
          <td><strong>{row.license_plate}</strong></td><td>{row.toll_station}</td>
          <td>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(row.transaction_at))}</td>
          <td>{row.invoice_number}<small>GD {row.transaction_code}</small></td>
          <td className="vehicle-cost-cell">{formatMoney(Number(row.amount_before_tax))}</td>
          <td className="vehicle-cost-cell">{formatMoney(Number(row.tax_amount))}</td>
          <td className="vehicle-cost-cell">{formatMoney(Number(row.amount_after_tax))}</td>
        </tr>)}</tbody>
      </table></div>}
      {pageCount > 1 ? <nav className="vehicle-pagination"><span>Trang {page}/{pageCount}</span><div>
        {page > 1 ? <Link className="secondary-button" href={`?page=${page - 1}`}>← Trước</Link> : null}
        {page < pageCount ? <Link className="secondary-button" href={`?page=${page + 1}`}>Sau →</Link> : null}
      </div></nav> : null}
    </section>
  </>;
}
