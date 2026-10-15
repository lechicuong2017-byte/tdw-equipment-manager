import {createRoot} from 'react-dom/client';
import {ActionToastProvider}from '../../next-app/components/action-toast';
import {ItManualEntry}from '../../next-app/components/it-cost-forms';
import {ItCostImport}from '../../next-app/components/it-cost-import';
import {ItReport}from '../../next-app/components/it-cost-report';
import type {ItCategory}from '../../next-app/lib/it-costs';
const categories:ItCategory[]=[{id:'11111111-1111-4111-8111-111111111111',code:'hosting',name:'Hosting website',active:true,sort_order:1}];
createRoot(document.getElementById('root')!).render(<ActionToastProvider><main className="main-content it-cost-page"><header className="page-header"><div><p className="eyebrow">CÔNG NGHỆ THÔNG TIN</p><h1>Chi phí công nghệ thông tin</h1><p className="muted">Quản lý dịch vụ, chứng từ, kỳ gia hạn và chi phí theo năm.</p></div><div className="header-actions"><ItCostImport categories={categories} services={[]} periods={[]}/><ItManualEntry categories={categories} services={[]} periods={[]}/></div></header><ItReport categories={categories} summary={{total:110,groups:[{category_id:categories[0].id,month:8,amount:110}]}} filter={{year:'2026',month:'',category:'',service:'',provider:'',payment:'',q:'',page:1}} canExport={true}/></main></ActionToastProvider>);
