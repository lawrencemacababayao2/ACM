const fs=require('fs');
const p='C:/Users/Acer/OneDrive/Desktop/ACM-Final/web/src/pages/Beneficiaries.jsx';
const s=fs.readFileSync(p,'utf8');
const needle='<TypeBadge value={typeOf(selectedBeneficiary)} />';
const repl='<span className={"badge " + (typeOf(selectedBeneficiary)==="fisherfolk"?"blue":typeOf(selectedBeneficiary)==="farmer"?"green":typeOf(selectedBeneficiary)==="livestock_owner"?"amber":"gray")}>{typeOf(selectedBeneficiary)==="fisherfolk"?"Fisherfolk":typeOf(selectedBeneficiary)==="farmer"?"Farmer":typeOf(selectedBeneficiary)==="livestock_owner"?"Livestock Owner":(typeOf(selectedBeneficiary)||"N/A")}</span>';
if(s.includes(needle)){ fs.writeFileSync(p,s.replace(needle,repl)); console.log('ok'); }else{ console.log('nope'); }
