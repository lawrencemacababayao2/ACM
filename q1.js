const fs=require('fs');
const p='C:/Users/Acer/OneDrive/Desktop/ACM-Final/web/src/pages/Beneficiaries.jsx';
const s=fs.readFileSync(p,'utf8');
const needle=\"badge ' + cls}\";
const repl=\"text-badge text-' + cls}\";
if(s.includes(needle)){ fs.writeFileSync(p, s.replace(needle,repl)); console.log('ok'); }else{ console.log('no'); }
