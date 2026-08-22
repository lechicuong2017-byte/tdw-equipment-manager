import { PageHeader } from "@/components/page-header";
import { VehicleModuleNav } from "@/components/vehicle-module-nav";
import { VehicleReportSection } from "@/components/vehicle-report-section";
import { can, requireAccess } from "@/lib/auth";

export const metadata = { title: "Báo cáo xe" };

export default async function VehicleReportsPage() {
  const { access, supabase } = await requireAccess();
  const canExport = can(access, "reports.vehicles.export");
  const { data: vehicles } = canExport
    ? await supabase.from("vehicles").select("id,vehicle_code,vehicle_name,license_plate").is("deleted_at", null).order("license_plate")
    : { data: [] };

  return (
    <>
      <div className="vehicle-page-header">
        <PageHeader eyebrow="BÁO CÁO PHƯƠNG TIỆN" title="Báo cáo xe" description="Xuất hồ sơ xe, đăng kiểm, bảo hiểm, bảo dưỡng và nhiên liệu theo năm, tháng hoặc từng xe." />
      </div>
      <VehicleModuleNav active="reports" />
      {canExport ? <VehicleReportSection showHeading={false} vehicles={vehicles ?? []} /> : <section className="panel"><p className="muted">Bạn không có quyền xuất báo cáo xe.</p></section>}
    </>
  );
}
