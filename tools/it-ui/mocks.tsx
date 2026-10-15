import type {ReactNode} from "react";
export function useRouter(){return {refresh(){document.body.dataset.refreshed="yes";}};}
export function usePathname(){return "/it-costs";}
export function useSearchParams(){return new URLSearchParams();}
export default function Link({children,href,...props}:{children:ReactNode;href:string;[key:string]:unknown}){return <a href={href} {...props}>{children}</a>;}
export async function saveItEntity(_kind:string,_input:unknown){return {success:"Đã lưu thông tin."};}
let attempt=0;
export async function saveItEntry(input:unknown){document.body.dataset.saved=JSON.stringify(input);attempt++;if(attempt===1)return {error:"Kết nối gián đoạn synthetic."};return {success:"Đã lưu khoản chi phí."};}
export async function getItEntry(){return {error:"Synthetic"};}
export async function linkItDocument(){return {success:"Đã liên kết."};}
export async function compareItDocument(){return {saved:null,used:[],candidates:[]};}
export async function findItEntryCandidates(){return {entries:[]};}
export async function prepareItUpload(id:string){return {path:`synthetic/${id}.docx`,token:"synthetic-only"};}
export async function registerItDocument(input:{id:string}){return {id:input.id,success:"Đã lưu chứng từ."};}
export function createClient(){return {storage:{from(){return {async uploadToSignedUrl(){return {error:null};},async remove(){return {error:null};}};}}};}
