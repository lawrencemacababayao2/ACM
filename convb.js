const fs=require('fs');
const p='C:/Users/Acer/OneDrive/Desktop/ACM-Final/web/src/pages/Beneficiaries.jsx';
let s=fs.readFileSync(p,'utf8');
s=s.replace(/<span className=\"badge /g, '<span className=\"text-badge text-');
fs.writeFileSync(p,s);
console.log('done');
