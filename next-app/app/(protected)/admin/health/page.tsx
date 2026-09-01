import { PageHeader } from "@/components/page-header";
import { callAppsScript } from "@/lib/apps-script";
import { requireAccess } from "@/lib/auth";
import {
  formatCapacityBytes,
  getCapacityProgress,
  getSupabaseCapacityLimits,
  parseCapacityUsage,
  type CapacityUsage,
} from "@/lib/system-capacity";
import {
  formatHealthLatency,
  healthStatusLabels,
  summarizeSystemHealth,
  type ServiceHealthCheck,
} from "@/lib/system-health";

export const metadata = { title: "Trạng thái hệ thống" };
export const dynamic = "force-dynamic";

async function getCapacityUsage(
  supabase: Awaited<ReturnType<typeof requireAccess>>["supabase"],
): Promise<CapacityUsage | null> {
  const { data, error } = await supabase.rpc("get_system_capacity_usage");
  return error ? null : parseCapacityUsage(data);
}

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
  const [supabaseCheck, appsScriptCheck, capacityUsage] = await Promise.all([
    checkSupabase(supabase),
    checkAppsScript(),
    getCapacityUsage(supabase),
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
  const capacityLimits = getSupabaseCapacityLimits();
  const databaseCapacity = capacityUsage
    ? getCapacityProgress(
        capacityUsage.databaseBytes,
        capacityLimits.database.bytes,
      )
    : null;
  const storageCapacity = capacityUsage
    ? getCapacityProgress(
        capacityUsage.storageBytes,
        capacityLimits.storage.bytes,
      )
    : null;

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

      <section className="panel capacity-panel">
        <div className="capacity-panel-heading">
          <div>
            <p className="eyebrow">DUNG LƯỢNG DỊCH VỤ</p>
            <h2>Dung lượng còn lại</h2>
          </div>
          <p>
            Số đã dùng tải trực tiếp từ Supabase; hạn mức đang theo gói Free hiện tại.
          </p>
        </div>

        <div className="capacity-grid">
          <CapacityCard
            name="Supabase Database"
            usedBytes={capacityUsage?.databaseBytes ?? null}
            limit={capacityLimits.database}
            progress={databaseCapacity}
            detail="Bao gồm dữ liệu và chỉ mục PostgreSQL."
          />
          <CapacityCard
            name="Supabase Storage"
            usedBytes={capacityUsage?.storageBytes ?? null}
            limit={capacityLimits.storage}
            progress={storageCapacity}
            detail={capacityUsage
              ? `${new Intl.NumberFormat("vi-VN").format(capacityUsage.storageObjects)} tệp đang lưu trong các bucket.`
              : "Không đọc được dung lượng file ở lần kiểm tra này."}
          />
          <article className="capacity-card capacity-card-unmetered">
            <div className="capacity-card-topline">
              <span>Vercel Runtime</span>
              <span className="capacity-source">Không áp dụng</span>
            </div>
            <strong>Không lưu file bền vững</strong>
            <p>
              Ứng dụng chạy trên Vercel, còn hóa đơn và tài liệu được lưu ở
              Supabase Storage. Ổ đĩa runtime của Vercel chỉ là tạm thời.
            </p>
            <a href="https://vercel.com/dashboard/usage" rel="noreferrer" target="_blank">
              Mở Usage Vercel ↗
            </a>
          </article>
        </div>
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

function CapacityCard({
  name,
  usedBytes,
  limit,
  progress,
  detail,
}: {
  name: string;
  usedBytes: number | null;
  limit: { bytes: number; label: string };
  progress: ReturnType<typeof getCapacityProgress> | null;
  detail: string;
}) {
  if (usedBytes === null || progress === null) {
    return (
      <article className="capacity-card capacity-card-unavailable">
        <div className="capacity-card-topline">
          <span>{name}</span>
          <span className="capacity-source">Chưa có số liệu</span>
        </div>
        <strong>Không thể kiểm tra</strong>
        <p>{detail}</p>
      </article>
    );
  }

  return (
    <article className={`capacity-card capacity-card-${progress.tone}`}>
      <div className="capacity-card-topline">
        <span>{name}</span>
        <span className="capacity-source">{limit.label}</span>
      </div>
      <strong>Còn {formatCapacityBytes(progress.remainingBytes)}</strong>
      <div
        aria-label={`${name} đã dùng ${progress.percentage.toFixed(1)}%`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.min(100, Math.round(progress.percentage))}
        className="capacity-progress"
        role="progressbar"
      >
        <span style={{ width: `${progress.displayPercentage}%` }} />
      </div>
      <div className="capacity-usage-row">
        <span>Đã dùng {formatCapacityBytes(usedBytes)}</span>
        <span>{progress.percentage.toFixed(1)}%</span>
      </div>
      <p>{detail}</p>
    </article>
  );
}
