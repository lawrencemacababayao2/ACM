const fs=require('fs');
const s=fs.readFileSync('C:/Users/Acer/OneDrive/Desktop/ACM-Final/web/src/pages/Beneficiaries.jsx','utf8');
const i=s.indexOf('beneficiary_type');
if(i>=0){ const j=s.indexOf('render: (r) => <TypeBadge',i); if(j>=0){ const k=s.lastIndexOf('key:',j-30); const l=s.indexOf('render:',j); const m=s.lastIndexOf('{',l); const n=s.indexOf('},',l); if(n<0) n=s.indexOf('}',l); console.log(s.slice(m,n+2)); } }
