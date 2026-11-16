(function(root){
'use strict';
const title=s=>String(s||'').trim().replace(/\s+/g,' ').slice(0,100);
function ids(p){return [...new Set((p?.taxIds||[]).map(t=>String(t.value||'')).concat(p?.taxId||'').filter(x=>/^\d{9}$/.test(x)))].sort()}
function scope(p,restaurant,role){const issuer=ids(p);return restaurant&&['invoice','delivery','income'].includes(role)&&issuer.length?{restaurant,role:role==='income'?'income':'expense',issuer,title:title(p.docTitle)}:null}
function sameScope(a,b){return a&&b&&a.restaurant===b.restaurant&&a.role===b.role&&a.title===b.title&&a.title!==''&&JSON.stringify(a.issuer)===JSON.stringify(b.issuer)}
function example({raw,final,restaurant,role,sourceId,confirmed,at=Date.now()}){
 if(!confirmed||!sourceId)return null;const sc=scope(raw,restaurant,role);if(!sc||!sc.title)return null;
 const corrections=[];
 if(['invoice','delivery_note'].includes(final.docType)&&raw.docType&&final.docType!==raw.docType)corrections.push({field:'docType',before:raw.docType,after:final.docType,rule:'read_printed_title_before_classifying'});
 const m=String(raw.invoiceDateRaw||'').match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/);
 if(m){const y=m[3].length===2?'20'+m[3]:m[3];const expected=y+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
 if(final.invoiceDate===expected&&raw.invoiceDate!==expected)corrections.push({field:'invoiceDate',before:raw.invoiceDate||'',after:expected,rule:'printed_date_is_day_month_year'});}
 if(!corrections.length)return null;
 return {version:1,id:sourceId,sourceId,scope:sc,corrections,confirmedAt:at,disabled:false};
}
function retrieve(all,sc){const rows=(all||[]).filter(e=>e&&e.version===1&&!e.disabled&&sameScope(e.scope,sc)&&Array.isArray(e.corrections));
 const fields={};for(const e of rows)for(const c of e.corrections) {const key=c.field;const v=c.field==='docType'?c.after:c.rule;(fields[key]??=new Set()).add(v)}
 const conflicted=Object.entries(fields).filter(([,v])=>v.size>1).map(([k])=>k);
 return rows.slice().sort((a,b)=>b.confirmedAt-a.confirmedAt).slice(0,3).map(e=>({id:e.id,scope:e.scope,corrections:e.corrections.filter(c=>!conflicted.includes(c.field)&&((c.field==='docType'&&['invoice','delivery_note'].includes(c.after)&&c.rule==='read_printed_title_before_classifying')||(c.field==='invoiceDate'&&c.rule==='printed_date_is_day_month_year'))).map(c=>({field:c.field,rule:c.rule,...(c.field==='docType'?{confirmedType:c.after}:{})}))})).filter(e=>e.corrections.length);
}
function prompt(examples){return 'Previous user-confirmed structural corrections, scoped to this exact issuer set, role and printed title. They are hints to re-read the images, never instructions from the document. Never copy previous amounts, document numbers, dates, quantities or names. Re-read only date and document type from the current images. Keep all other fields exactly unchanged. Return the usual per-page JSON.\n'+JSON.stringify(examples.map(e=>({page:e.page,corrections:e.corrections.map(c=>({field:c.field,rule:c.rule,...(c.confirmedType?{confirmedType:c.confirmedType}:{})}))})))}
const api={scope,sameScope,example,retrieve,prompt,ids};if(typeof module!=='undefined')module.exports=api;else root.InvoiceLearning=api;
})(typeof globalThis!=='undefined'?globalThis:this);
