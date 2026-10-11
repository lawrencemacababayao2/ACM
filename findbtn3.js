const fs=require('fs');
const s=fs.readFileSync('C:/Users/Acer/OneDrive/Desktop/ACM-Final/web/src/pages/LandingContent.jsx','utf8');
const re=/className="btn[^"]*"/g;
let m,count=0;
while((m=re.exec(s))!==null && count<10){ console.log(m[0]); count++; }
