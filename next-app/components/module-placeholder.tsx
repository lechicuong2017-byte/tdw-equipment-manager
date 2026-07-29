import { PageHeader } from "@/components/page-header";

export function ModulePlaceholder({
  eyebrow,
  title,
  description,
  items,
}: {
  eyebrow: string;
  title: string;
  description: string;
  items: string[];
}) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <section className="panel migration-panel">
        <div className="migration-badge">ĐANG CHUYỂN ĐỔI</div>
        <h2>Nền tảng bảo mật đã sẵn sàng</h2>
        <p>
          Bảng dữ liệu, khóa ngoại và chính sách RLS cho module này đã nằm trong migration.
          Giao diện sẽ được nối vào Supabase theo đúng thứ tự ưu tiên.
        </p>
        <ul>
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
    </>
  );
}
