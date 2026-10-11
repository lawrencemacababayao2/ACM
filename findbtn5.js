const fs=require('fs');
const s=fs.readFileSync('C:/Users/Acer/OneDrive/Desktop/ACM-Final/web/src/pages/LandingContent.jsx','utf8');
const re=/className="btn[^"]*"/g;
let m,count=0;
while((m=re.exec(s))!==null){ if(count>=10 && count<25){ console.log((re.lastIndex - m[0].length)+': '+m[0]); } count++; if(count>30) break; }
