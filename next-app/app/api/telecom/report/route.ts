import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { can, hasModule, requireAccess } from "@/lib/auth";
import { telecomCategoryLabel, telecomFilterSchema, telecomPeriod } from "@/lib/telecom-invoices";

export const maxDuration=60;
export async function GET(request:NextRequest) {
  const {access,supabase}=await requireAccess();
  if(!hasModule(access,"telecom")||!can(access,"telecom.view")||!can(access,"reports.telecom.export"))return NextResponse.json({error:"Bạn chưa có quyền xuất báo cáo viễn thông."},{status:403});
  const filter=telecomFilterSchema.safeParse(Object.fromEntries([...request.nextUrl.searchParams].filter(([,v])=>v)));
  if(!filter.success)return NextResponse.json({error:"Chọn năm và tháng hợp lệ."},{status:400});
  const {year,month,category}=filter.data;const {start,end}=telecomPeriod(year,month);
  const workbook=new ExcelJS.Workbook();workbook.creator="TDW Management";
  const summary=workbook.addWorksheet("Tong hop thang");
  const sims=workbook.addWorksheet("Tong hop thue bao");
  const detail=workbook.addWorksheet("Chi tiet hoa don");
  summary.addRow(["Kỳ cước","Hạng mục","Số hóa đơn","Chưa thuế","VAT","Tổng thanh toán","Chưa thanh toán"]);
  sims.addRow(["Thuê bao trên hóa đơn","Hạng mục","Số hóa đơn","Chưa thuế","VAT","Tổng thanh toán","Chưa thanh toán"]);
  detail.addRow(["Kỳ cước","Thuê bao trên hóa đơn","Hạng mục","Nhóm / bộ phận","Nhà cung cấp","Ký hiệu","Số hóa đơn","Ngày lập","Hợp đồng","Dịch vụ","Chưa thuế","VAT","Thanh toán","Ngày thanh toán","Ghi chú","File nguồn","Trang"]);
  type Total={count:number;before:number;tax:number;gross:number;unpaid:number};
  const months=new Map<string,Total>();const subscribers=new Map<string,Total>();
  let complete=false;
  for(let offset=0;offset<50000;offset+=500) {
    let query=supabase.from("telecom_invoices").select("id,category,period_month,subscriber,group_name,provider,invoice_series,invoice_number,issued_on,contract_number,service,amount_before_tax,tax_amount,amount_after_tax,paid_on,note,source_file,source_page")
      .is("deleted_at",null).gte("period_month",start).lt("period_month",end);
    if(category)query=query.eq("category",category);
    const {data,error}=await query.order("period_month").order("subscriber").order("id").range(offset,offset+499);
    if(error)return NextResponse.json({error:"Chưa xuất được báo cáo. Vui lòng thử lại."},{status:500});
    for(const r of data||[]) {
      const period=`${r.period_month.slice(5,7)}/${r.period_month.slice(0,4)}`;
      const before=Number(r.amount_before_tax),tax=Number(r.tax_amount),gross=Number(r.amount_after_tax);
      detail.addRow([period,r.subscriber,telecomCategoryLabel(r.category),r.group_name,r.provider,r.invoice_series,r.invoice_number,r.issued_on,r.contract_number,r.service,before,tax,gross,r.paid_on||"",r.note,r.source_file,r.source_page]);
      for(const [map,key] of [[months,`${period}|${r.category}`],[subscribers,`${r.subscriber}|${r.category}`]] as const) {
        const t=map.get(key)||{count:0,before:0,tax:0,gross:0,unpaid:0};
        t.count++;t.before+=before;t.tax+=tax;t.gross+=gross;if(!r.paid_on)t.unpaid+=gross;map.set(key,t);
      }
    }
    if((data?.length||0)<500){complete=true;break;}
  }
  if(!complete)return NextResponse.json({error:"Báo cáo quá lớn. Hãy xuất riêng từng tháng."},{status:422});
  for(const [sheet,map] of [[summary,months],[sims,subscribers]] as const) {
    const total={count:0,before:0,tax:0,gross:0,unpaid:0};
    for(const [key,r] of map) {const [label,group]=key.split("|");sheet.addRow([label,telecomCategoryLabel(group),r.count,r.before,r.tax,r.gross,r.unpaid]);for(const k of Object.keys(total) as (keyof Total)[])total[k]+=r[k];}
    const row=sheet.addRow(["TỔNG CỘNG","",total.count,total.before,total.tax,total.gross,total.unpaid]);row.font={bold:true};
    for(const col of [4,5,6,7])sheet.getColumn(col).numFmt='#,##0.00 "₫"';
  }
  for(const col of [11,12,13])detail.getColumn(col).numFmt='#,##0.00 "₫"';
  for(const sheet of workbook.worksheets) {
    sheet.views=[{state:"frozen",ySplit:1}];sheet.columns.forEach((c)=>{c.width=23;});
    sheet.getRow(1).height=32;sheet.getRow(1).eachCell((c)=>{c.font={bold:true,color:{argb:"FFFFFFFF"}};c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF0E7490"}};});
    sheet.eachRow((r)=>r.eachCell((c)=>{c.alignment={vertical:"middle",wrapText:true};}));
    sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,sheet.rowCount-(sheet===detail?0:1)),column:sheet.columnCount}};
  }
  detail.getColumn(15).width=38;detail.getColumn(16).width=40;
  const buffer=await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer,{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="TDW_Vien_thong_${year}${month?`_${String(month).padStart(2,"0")}`:""}.xlsx"`,"Cache-Control":"private, no-store"}});
}
