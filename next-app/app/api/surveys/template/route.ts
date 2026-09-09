import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { can, requireModuleAccess } from "@/lib/auth";
export async function GET() {
  const { access } = await requireModuleAccess("surveys");
  if (!can(access, "surveys.manage")) return new NextResponse("Forbidden", { status: 403 });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Cau hoi");
  sheet.columns = [{ header: "Câu hỏi", width: 65 }, { header: "Loại", width: 18 }, { header: "Lựa chọn", width: 65 }, { header: "Bắt buộc", width: 16 }];
  sheet.addRows([
    ["Bạn đang làm việc tại phòng ban nào?", "short", "", "Có"],
    ["Bạn hài lòng với môi trường làm việc không?", "single", "Rất hài lòng | Hài lòng | Cần cải thiện", "Có"],
    ["Bạn muốn công ty cải thiện những nội dung nào?", "multiple", "Không gian làm việc | Đào tạo | Hoạt động nội bộ", "Không"],
    ["Bạn có đề xuất gì cho công ty?", "long", "", "Không"],
  ]);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; sheet.getRow(1).height = 28;
  sheet.getRow(1).eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E6E8E" } }; });
  sheet.eachRow((row) => { row.alignment = { vertical: "middle", wrapText: true }; });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const guide = workbook.addWorksheet("Huong dan"); guide.columns = [{ width: 28 }, { width: 95 }];
  guide.addRows([["Nhập liệu", "Chỉ đọc sheet đầu tiên. Giữ nguyên 4 tiêu đề. Tối đa 100 câu hỏi."], ["short / long", "Điền thông tin: short là câu ngắn, long là đoạn văn. Để trống cột Lựa chọn."], ["single / multiple", "Trắc nghiệm: single chọn một; multiple chọn nhiều. 2–20 đáp án, phân cách bằng |."], ["Bắt buộc", "Có hoặc Không."], ["Lưu ý", "Chỉ dùng văn bản thuần, không dùng công thức hoặc liên kết. Bạn được xem trước và chọn dòng trước khi thêm vào bản nháp."]]);
  guide.eachRow((row) => { row.alignment = { vertical: "top", wrapText: true }; row.height = 42; });
  return new NextResponse(await workbook.xlsx.writeBuffer() as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="Mau_cau_hoi_khao_sat.xlsx"', "Cache-Control": "private, no-store" } });
}
