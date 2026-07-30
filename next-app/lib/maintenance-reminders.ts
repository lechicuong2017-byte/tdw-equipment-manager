import "server-only";

import { callAppsScript } from "@/lib/apps-script";
import { createAdminClient } from "@/lib/supabase/admin";

const reminderDays = new Set([7, 3, 1, 0]);
const maxNotificationsPerRun = 200;

type RelatedAsset =
  | { asset_code?: string; asset_name?: string }
  | { asset_code?: string; asset_name?: string }[]
  | null;

type ReminderCandidate = {
  plan_id: string;
  asset_id: string;
  recipient_email: string;
  notification_type: string;
  due_date: string;
  recipient_name: string;
  asset_code: string;
  asset_name: string;
  title: string;
};

type ReminderRunResult = {
  checked: number;
  candidates: number;
  claimed: number;
  sent: number;
  failed: number;
  unknown: number;
  skipped: number;
};

type ClaimedNotification = {
  notification_id: string;
  plan_id: string;
  asset_id: string;
  recipient_email: string;
  notification_type: string;
  due_date: string;
};

type ClaimedReminder = ReminderCandidate & {
  notification_id: string;
};

type ReminderFinishResult = {
  notification_id: string;
  status: "SENT" | "FAILED" | "UNKNOWN";
  error: string;
};

function relatedAsset(value: RelatedAsset) {
  return Array.isArray(value) ? value[0] : value;
}

function vietnamDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
}

function daysBetween(from: string, to: string) {
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  return Math.round((toTime - fromTime) / 86400000);
}

function notificationType(dueDate: string, today: string) {
  const daysUntil = daysBetween(today, dueDate);
  if (reminderDays.has(daysUntil)) return `DUE_${daysUntil}`;
  if (daysUntil < 0 && Math.abs(daysUntil) % 7 === 0) {
    return `OVERDUE_${Math.abs(daysUntil)}`;
  }
  return "";
}

function candidateKey(candidate: {
  plan_id: string;
  recipient_email: string;
  notification_type: string;
  due_date: string;
}) {
  return [
    candidate.plan_id,
    candidate.recipient_email.toLowerCase(),
    candidate.notification_type,
    candidate.due_date,
  ].join("|");
}

export async function runMaintenanceReminders(): Promise<ReminderRunResult> {
  const supabase = createAdminClient();
  const today = vietnamDate();
  const { data: plans, error: plansError } = await supabase
    .from("maintenance_plans")
    .select(
      "id, asset_id, title, next_due_date, active, assets(asset_code, asset_name)",
    )
    .eq("active", true)
    .order("next_due_date")
    .limit(5000);
  if (plansError) throw new Error("Không thể đọc kế hoạch bảo trì");

  const duePlans = (plans ?? [])
    .map((plan) => ({
      ...plan,
      notification_type: notificationType(plan.next_due_date, today),
    }))
    .filter((plan) => plan.notification_type);
  const assetIds = [...new Set(duePlans.map((plan) => plan.asset_id))];
  if (!assetIds.length) {
    return {
      checked: plans?.length ?? 0,
      candidates: 0,
      claimed: 0,
      sent: 0,
      failed: 0,
      unknown: 0,
      skipped: 0,
    };
  }

  const { data: responsibles, error: responsibleError } = await supabase
    .from("asset_responsibles")
    .select("asset_id, user_id")
    .in("asset_id", assetIds)
    .eq("active", true)
    .limit(5000);
  if (responsibleError) throw new Error("Không thể đọc người phụ trách");

  const userIds = [...new Set((responsibles ?? []).map((item) => item.user_id))];
  const profiles = userIds.length
    ? await supabase
        .from("profiles")
        .select("id, email, full_name, active")
        .in("id", userIds)
        .eq("active", true)
        .limit(5000)
    : { data: [], error: null };
  if (profiles.error) throw new Error("Không thể đọc địa chỉ người nhận");

  const usersById = new Map(
    (profiles.data ?? []).map((profile) => [profile.id, profile]),
  );
  const recipientsByAsset = new Map<string, Set<string>>();
  (responsibles ?? []).forEach((responsible) => {
    const profile = usersById.get(responsible.user_id);
    if (!profile?.email) return;
    if (!recipientsByAsset.has(responsible.asset_id)) {
      recipientsByAsset.set(responsible.asset_id, new Set());
    }
    recipientsByAsset.get(responsible.asset_id)?.add(profile.id);
  });

  const candidates: ReminderCandidate[] = [];
  duePlans.forEach((plan) => {
    const asset = relatedAsset(plan.assets);
    recipientsByAsset.get(plan.asset_id)?.forEach((userId) => {
      const profile = usersById.get(userId);
      if (!profile) return;
      candidates.push({
        plan_id: plan.id,
        asset_id: plan.asset_id,
        recipient_email: profile.email.trim().toLowerCase(),
        notification_type: plan.notification_type,
        due_date: plan.next_due_date,
        recipient_name: profile.full_name || profile.email,
        asset_code: asset?.asset_code ?? "",
        asset_name: asset?.asset_name ?? "Thiết bị TDW",
        title: plan.title,
      });
    });
  });

  const selectedCandidates = candidates.slice(0, maxNotificationsPerRun);
  if (!selectedCandidates.length) {
    return {
      checked: plans?.length ?? 0,
      candidates: 0,
      claimed: 0,
      sent: 0,
      failed: 0,
      unknown: 0,
      skipped: 0,
    };
  }

  const { data: claimed, error: claimError } = await supabase.rpc(
    "claim_maintenance_notifications",
    {
      target_candidates: selectedCandidates.map((candidate) => ({
        plan_id: candidate.plan_id,
        asset_id: candidate.asset_id,
        recipient_email: candidate.recipient_email,
        notification_type: candidate.notification_type,
        due_date: candidate.due_date,
      })),
    },
  );
  if (claimError) throw new Error("Không thể khóa tác vụ gửi email");

  const candidateByKey = new Map(
    selectedCandidates.map((candidate) => [candidateKey(candidate), candidate]),
  );
  const claimedRows = (claimed ?? []) as ClaimedNotification[];
  const notifications: ClaimedReminder[] = claimedRows.flatMap((item) => {
    const candidate = candidateByKey.get(candidateKey(item));
    return candidate
      ? [{ notification_id: item.notification_id, ...candidate }]
      : [];
  });

  if (!notifications.length) {
    return {
      checked: plans?.length ?? 0,
      candidates: selectedCandidates.length,
      claimed: 0,
      sent: 0,
      failed: 0,
      unknown: 0,
      skipped: selectedCandidates.length,
    };
  }

  try {
    const response = await callAppsScript<{
      ok: true;
      results: Array<{
        notification_id: string;
        status: "SENT" | "FAILED";
        error?: string;
      }>;
    }>(
      "sendSupabaseMaintenanceReminders",
      { notifications },
      50000,
    );
    const resultById = new Map(
      (response.results ?? []).map((item) => [item.notification_id, item]),
    );
    const results: ReminderFinishResult[] = notifications.map((notification) => {
      const result = resultById.get(notification.notification_id);
      return result
        ? {
            notification_id: notification.notification_id,
            status: result.status,
            error: result.error ?? "",
          }
        : {
            notification_id: notification.notification_id,
            status: "UNKNOWN",
            error: "Apps Script không trả về kết quả cho email này",
          };
    });
    const { error: finishError } = await supabase.rpc(
      "finish_maintenance_notifications",
      { target_results: results },
    );
    if (finishError) throw new Error("Không thể lưu kết quả gửi email");

    return {
      checked: plans?.length ?? 0,
      candidates: selectedCandidates.length,
      claimed: notifications.length,
      sent: results.filter((item) => item.status === "SENT").length,
      failed: results.filter((item) => item.status === "FAILED").length,
      unknown: results.filter((item) => item.status === "UNKNOWN").length,
      skipped: selectedCandidates.length - notifications.length,
    };
  } catch (error) {
    await supabase.rpc("finish_maintenance_notifications", {
      target_results: notifications.map((notification) => ({
        notification_id: notification.notification_id,
        status: "UNKNOWN",
        error: "Không xác nhận được kết quả từ Apps Script",
      })),
    });
    throw error;
  }
}
