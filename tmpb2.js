const fs=require('fs');
const s=fs.readFileSync('C:/Users/Acer/OneDrive/Desktop/ACM-Final/web/src/pages/Beneficiaries.jsx','utf8');
const old =     {
      key: 'beneficiary_type',
      label: 'Beneficiary Type',
      render: (r) => <TypeBadge value={typeOf(r)} />,
    },;
if(s.includes(old)){ s2=s.replace(old,     {
      key: 'beneficiary_type',
      label: 'Beneficiary Type',
      render: (r) => <TypeBadge value={typeOf(r)} />,
    },); } // no change needed
console.log('ok');
