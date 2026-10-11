const fs=require('fs');
const s=fs.readFileSync('C:/Users/Acer/OneDrive/Desktop/ACM-Final/web/src/pages/Beneficiaries.jsx','utf8');
const needle = 'render: (r) => <TypeBadge value={typeOf(r)} />';
const repl = ender: (r) => {
        const t = typeOf(r);
        const cls = t === 'fisherfolk' ? 'blue' : t === 'farmer' ? 'green' : t === 'livestock_owner' ? 'amber' : 'gray';
        const label = t === 'fisherfolk' ? 'Fisherfolk' : t === 'farmer' ? 'Farmer' : t === 'livestock_owner' ? 'Livestock Owner' : (t || 'N/A');
        return <span className={'badge ' + cls}>{label}</span>;
      };
if(s.includes(needle)){ const s2=s.replace(needle, repl); fs.writeFileSync('C:/Users/Acer/OneDrive/Desktop/ACM-Final/web/src/pages/Beneficiaries.jsx', s2); console.log('ok'); } else { console.log('nope'); }
