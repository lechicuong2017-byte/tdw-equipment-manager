import type { ReactNode } from "react";
export const useRouter = () => ({ push: (url: string) => { document.body.dataset.navigation = url; }, refresh: () => {} });
export const usePathname = () => "/surveys/new";
export const useSearchParams = () => new URLSearchParams();
export default function Link({ children, href, ...props }: { children: ReactNode; href: string }) { return <a href={href} {...props}>{children}</a>; }
export async function saveSurvey() { return { id: "synthetic-saved" }; }
export async function changeSurveyStatus() { return { success: "Synthetic" }; }
let attempts = 0;
export async function submitSurvey(_token: string, _submission: string, identity: unknown, answers: unknown) {
  attempts++;
  if (attempts === 1) return { error: "Lỗi mạng synthetic, hãy thử lại." };
  document.body.dataset.submitted = JSON.stringify({ identity, answers });
  return { success: true };
}
