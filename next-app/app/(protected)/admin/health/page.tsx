import { PageHeader } from "@/components/page-header";
import { callAppsScript } from "@/lib/apps-script";
import { requireAccess } from "@/lib/auth";
import {
  formatHealthLatency,
  healthStatusLabels,
  summarizeSystemHealth,
  type ServiceHealthCheck,
} from "@/lib/system-health";

export const metadata = { title: "Trạng thái hệ thống" };
export const dynamic = "force-dynamic";

async function checkSupabase(
  supabase: Awaited<ReturnType<typeof requireAccess>>["supabase"],
): Promise<ServiceHealthCheck> {
  const startedAt = Date.now();
  const { error } = await supabase.from("audit_logs").select("id").limit(1);
  const latencyMs = Date.now() - startedAt;
  return error
    ? {
        key: "supabase",
        name: "Supabase PostgreSQL",
        status: "down",
        latencyMs,
        detail: "Không thể đọc dữ liệu bằng phiên quản trị hiện tại.",
      }
    : {
        key: "supabase",
        name: "Supabase PostgreSQL",
        status: latencyMs > 2000 ? "degraded" : "operational",
        latencyMs,
        detail: "Kết nối cơ sở dữ liệu và RLS của quản trị viên phản hồi hợp lệ.",
      };
}

async function checkAppsScript(): Promise<ServiceHealthCheck> {
  const startedAt = Date.now();
  try {
    const result = await callAppsScript<{
      ok: true;
      service: string;
      checked_at: string;
      integration_version: string;
    }>("integrationHealthCheck", {}, 10000);
    const latencyMs = Date.now() - startedAt;
    return {
      key: "apps_script",
      name: "Google Apps Script",
      status: latencyMs > 5000 ? "degraded" : "operational",
      latencyMs,
      detail: `HMAC hợp lệ · phiên bản tích hợp ${result.integration_version}`,
    };
  } catch {
    return {
      key: "apps_script",
      name: "Google Apps Script",
      status: "down",
      latencyMs: Date.now() - startedAt,
      detail: "Không thể xác nhận endpoint tích hợp có chữ ký.",
    };
  }
}

export default async function HealthPage() {
  const { supabase } = await requireAccess();
  const [supabaseCheck, appsScriptCheck] = await Promise.all([
    checkSupabase(supabase),
    checkAppsScript(),
  ]);
  const checks: ServiceHealthCheck[] = [
    {
      key: "nextjs",
      name: "Next.js / Vercel",
      status: "operational",
      latencyMs: 0,
      detail: process.env.VERCEL_GIT_COMMIT_SHA
        ? `Server đang chạy commit ${process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)}.`
        : "Server Next.js đang phản hồi yêu cầu quản trị.",
    },
    supabaseCheck,
    appsScriptCheck,
  ];
  const overallStatus = summarizeSystemHealth(checks);
  const checkedAt = new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());

  return (
    <>
      <PageHeader
        eyebrow="VẬN HÀNH"
        title="Trạng thái hệ thống"
        description="Kiểm tra trực tiếp các kết nối server-side; không hiển thị URL, khóa hoặc secret tích hợp."
        actions={(
          <form action="/admin/health" method="get">
            <button className="secondary-button" type="submit">Kiểm tra lại</button>
          </form>
        )}
      />

      <section className={`health-summary health-${overallStatus}`}>
        <div>
          <p className="eyebrow">TỔNG THỂ</p>
          <h2>{healthStatusLabels[overallStatus]}</h2>
        </div>
        <small>Kiểm tra lúc {checkedAt}</small>
      </section>

      <section aria-label="Trạng thái dịch vụ" className="health-grid">
        {checks.map((check) => (
          <article className="health-card" key={check.key}>
            <div className="health-card-heading">
              <span aria-hidden="true" className={`health-indicator health-indicator-${check.status}`} />
              <span className={`health-badge health-badge-${check.status}`}>
                {healthStatusLabels[check.status]}
              </span>
            </div>
            <h2>{check.name}</h2>
            <strong>{formatHealthLatency(check.latencyMs)}</strong>
            <p>{check.detail}</p>
          </article>
        ))}
      </section>

      <section className="panel health-note">
        <div>
          <p className="eyebrow">PHẠM VI KIỂM TRA</p>
          <h2>Những gì màn hình này xác nhận</h2>
        </div>
        <ul>
          <li>Next.js render được trang bảo vệ bằng Supabase Auth và MFA.</li>
          <li>Supabase chấp nhận truy vấn theo RLS của quản trị viên.</li>
          <li>Apps Script xác minh đúng timestamp, nonce và chữ ký HMAC từ server.</li>
        </ul>
      </section>
    </>
  );
}
