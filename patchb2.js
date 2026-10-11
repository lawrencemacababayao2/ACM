const fs=require('fs');
const p='C:/Users/Acer/OneDrive/Desktop/ACM-Final/web/src/pages/Beneficiaries.jsx';
const s=fs.readFileSync(p,'utf8');
const needle='render: (r) => <TypeBadge value={typeOf(r)} />';
const repl = "render: (r) => { const t = typeOf(r); const cls = t === 'fisherfolk' ? 'blue' : t === 'farmer' ? 'green' : t === 'livestock_owner' ? 'amber' : 'gray'; const label = t === 'fisherfolk' ? 'Fisherfolk' : t === 'farmer' ? 'Farmer' : t === 'livestock_owner' ? 'Livestock Owner' : (t || 'N/A'); return <span className={'badge ' + cls}>{label}</span>; }";
if(s.includes(needle)){ fs.writeFileSync(p, s.replace(needle,repl)); console.log('ok'); }else{ console.log('nope'); }
