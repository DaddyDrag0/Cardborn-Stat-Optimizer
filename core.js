import {normalizeBuild,calculateBuild,buildWarnings,luckVariants} from './build.js?v=2';
export const LUCKS=['Luck','ShinyLuck','AwakenedLuck','FabledLuck','CorruptedLuck','VoidLuck'];
export const POINTS=['Luck','Shiny','Awakened','Void'];
export const BORDERS=['Shiny','Awakened','Fabled','Corrupted','Void'];
export const CHANCES=['DoubleRollChance','RollTwiceChance','TripleRollChance','LuckyHandChance'];
export const sum=o=>Object.values(o).reduce((a,b)=>a+b,0);
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const number=(n,a=0,b=1e100)=>clamp(Number.isFinite(Number(n))?Number(n):a,a,b);
export function defaults(data){return{version:1,stats:{Luck:25,ShinyLuck:1,AwakenedLuck:1,FabledLuck:1,CorruptedLuck:1,VoidLuck:1,RollInterval:1,...Object.fromEntries(CHANCES.map(k=>[k,0]))},rolls:10000000,points:{Luck:0,Shiny:0,Awakened:0,Void:0},pointScale:{Luck:1,Shiny:1,Awakened:1,Void:1},badges:[],weather:'Clear',unlocks:{Awakened:false,Fabled:false,Corrupted:false},goal:{kind:'rarity',rarity:1000000,card:'Nihilus, the Final Horizon',borders:['Shiny']},odds:{...data.borderOdds},artifact:{rarity:'Common',gamepass:false,voidSlots:0,strength:0,quality:.9,slots:[]},minutes:60}}
export function normalize(raw,data){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Choose a valid Cardborn profile JSON file.');
  const s=defaults(data);
  for(const k of LUCKS)s.stats[k]=number(raw.stats?.[k]??s.stats[k],.0001);
  s.stats.RollInterval=number(raw.stats?.RollInterval??1,.2,3600);
  for(const k of CHANCES)s.stats[k]=number(raw.stats?.[k]??0,0,1);
  s.rolls=Math.floor(number(raw.rolls??s.rolls,0,1e15));
  for(const k of POINTS){s.points[k]=Math.floor(number(raw.points?.[k]??0,0,1000));s.pointScale[k]=number(raw.pointScale?.[k]??1,0,1000)}
  s.badges=Array.isArray(raw.badges)?[...new Set(raw.badges.filter(x=>data.cards.some(c=>c.badgeRequired===x)))]:[];
  s.weather=Object.hasOwn(data.weather,raw.weather)?raw.weather:'Clear';
  for(const k of Object.keys(s.unlocks))s.unlocks[k]=raw.unlocks?.[k]===true;
  s.goal.kind=raw.goal?.kind==='card'?'card':'rarity';s.goal.rarity=number(raw.goal?.rarity??1e6,1,1e30);
  s.goal.card=data.cards.some(c=>c.name===raw.goal?.card)?raw.goal.card:s.goal.card;
  s.goal.borders=Array.isArray(raw.goal?.borders)?BORDERS.filter(k=>raw.goal.borders.includes(k)):s.goal.borders;
  for(const k of BORDERS)s.odds[k]=number(raw.odds?.[k]??data.borderOdds[k],1,1e30);
  const a=raw.artifact||{};s.artifact.rarity=data.personalArtifact.rarities.some(r=>r.id===a.rarity)?a.rarity:'Common';
  s.artifact.gamepass=a.gamepass===true;s.artifact.voidSlots=Math.floor(number(a.voidSlots??0,0,2));s.artifact.strength=number(a.strength??0,0,10);s.artifact.quality=number(a.quality??.9,0,1);
  s.artifact.slots=Array.isArray(a.slots)?a.slots.slice(0,11).filter(x=>data.personalArtifact.stats.some(d=>d.id===x?.id)).map(x=>({id:x.id,value:number(x.value,0,1e6),locked:x.locked===true})):[];
  if(raw.build&&typeof raw.build==='object'&&!Array.isArray(raw.build)){s.build=normalizeBuild(raw.build,data);s.version=2;s.artifact.gamepass=s.build.passes.ArtifactSlots;s.artifact.voidSlots=s.build.void.PASlots||0}
  s.minutes=number(raw.minutes??60,.01,1e9);return s;
}
export function artifactLevel(s,data){return clamp(Math.floor(100*(s.rolls/data.personalArtifact.rollsForMaxLevel)**data.personalArtifact.levelExponent),0,100)}
export function artifactSlots(s,data){const n=data.personalArtifact.slotUnlockLevels.filter(l=>l<=artifactLevel(s,data)).length;return n?Math.min(11,n+(s.artifact.gamepass?2:0)+(data.personalArtifact.rarities.find(r=>r.id===s.artifact.rarity)?.bonusSlots||0)+s.artifact.voidSlots):0}
export function scaledMax(def,level){const f=10**def.decimals;return Math.floor((def.min+(def.max-def.min)*level/100)*f+.5)/f}
export function artifactBonuses(s,slots,data){
  const flat={},mult={},seen={},rarity=data.personalArtifact.rarities.find(r=>r.id===s.artifact.rarity)?.statMultiplier||1;
  for(const slot of [...slots].sort((a,b)=>(a.position??slots.indexOf(a))-(b.position??slots.indexOf(b)))){const def=data.personalArtifact.stats.find(d=>d.id===slot.id);if(!def)continue;const copy=(seen[slot.id]=(seen[slot.id]||0)+1),scale=(copy===1?1:copy===2?.5:0)*rarity*(1+s.artifact.strength+.05*(s.build?.void.VoidArtifactPower||0));
    if(def.kind==='mult')mult[slot.id.slice(0,-4)]=(mult[slot.id.slice(0,-4)]||1)*(1+(slot.value-1)*scale);
    else flat[slot.id]=(flat[slot.id]||0)+slot.value*scale;
  }return{flat,mult};
}
export function effective(s,data,points=s.points,slots=s.artifact.slots){
  if(s.build)return calculateBuild(s,data,points,artifactBonuses(s,slots,data)).stats;
  const old=artifactBonuses(s,s.artifact.slots,data),next=artifactBonuses(s,slots,data),stats={};
  for(const k of LUCKS){const point=k==='Luck'?'Luck':k.replace('Luck',''),gain=(data.pointGains[point]||0)*(s.pointScale[point]??1);const before=s.stats[k]/(old.mult[k]||1)-(old.flat[k]||0)-gain*(s.points[point]||0);stats[k]=Math.max(.0001,(before+gain*(points[point]||0)+(next.flat[k]||0))*(next.mult[k]||1))}
  stats.RollInterval=Math.max(data.minimumInterval,s.stats.RollInterval+(old.flat.RollSpeed||0)-(next.flat.RollSpeed||0));
  for(const k of CHANCES)stats[k]=clamp(s.stats[k]-(old.flat[k]||0)+(next.flat[k]||0),0,1);
  return stats;
}
export function currentTier(points,data){let tier=0;for(let i=0;i<data.pointCaps.length-1;i++){if(POINTS.every(k=>points[k]>=data.pointCaps[i][k]))tier=i+1;else break}return tier}
export function validPoints(points,budget,data){return POINTS.every(k=>Number.isInteger(points[k])&&points[k]>=0&&points[k]<=data.pointCaps[currentTier(points,data)][k])&&sum(points)<=budget}
export function eligibleCards(s,data){return data.cards.filter(c=>!c.isSecret&&(!c.badgeRequired||s.badges.includes(c.badgeRequired))&&(!c.weatherLock||c.weatherLock===s.weather)).sort((a,b)=>b.rarityValue-a.rarityValue)}
export function cardDistribution(s,data,luck){
  const cards=eligibleCards(s,data),selected=[],by=new Map(data.cards.map(c=>[c.name,c]));let remain=1;
  for(let i=0;i<cards.length;i++){const card=cards[i],p=1/Math.max(1,Math.ceil(card.rarityValue/Math.max(.0001,luck)));let mass=remain*p;remain*=1-p;if(i===cards.length-1){mass+=remain;remain=0}
    for(const skin of data.secretSkins[card.name]||[]){const upgraded=by.get(skin.to);if(!upgraded)continue;const amount=mass/skin.chanceDenom;selected.push({card:upgraded,p:amount});mass-=amount}
    if(mass>0)selected.push({card,p:mass});
  }return selected;
}
export function borderProbabilities(s,stats){return Object.fromEntries(BORDERS.map(k=>{let p=k==='Void'?1/Math.max(1,Math.ceil(s.odds[k]/Math.max(.0001,stats.VoidLuck))):Math.min(1,stats[k+'Luck']/s.odds[k]);if((k==='Awakened'||k==='Fabled'||k==='Corrupted')&&!s.unlocks[k])p=0;return[k,p]}))}
function matchesCard(card,s){return s.goal.kind==='card'?card.name===s.goal.card:card.rarityValue>=s.goal.rarity}
function baseProbability(s,data,stats){return luckVariants(stats).reduce((n,v)=>n+v.weight*cardDistribution(s,data,stats.Luck*v.mult).reduce((p,o)=>p+(matchesCard(o.card,s)?o.p:0),0),0)}
export function fastProbability(s,data,stats){const base=baseProbability(s,data,stats),borders=borderProbabilities(s,stats);return base*s.goal.borders.reduce((n,k)=>n*borders[k],1)}
export function targetProbability(s,data,stats){const variants=luckVariants(stats);let plain=0,best=0;for(const v of variants){const result=singleTargetProbability(s,data,{...stats,Luck:stats.Luck*v.mult,periodic:[]});plain+=v.weight*result.plain;best+=v.weight*result.best}return{plain,best,p:(1-stats.LuckyHandChance)*plain+stats.LuckyHandChance*best}}
function singleTargetProbability(s,data,stats){
  const plain=fastProbability(s,data,stats),hand=stats.LuckyHandChance;if(!hand)return{plain,best:plain,p:plain};
  const bp=borderProbabilities(s,stats),variants=[];
  for(const outcome of cardDistribution(s,data,stats.Luck))for(let mask=0;mask<32;mask++){let p=outcome.p,rarity=outcome.card.rarityValue,match=matchesCard(outcome.card,s);
    for(let j=0;j<BORDERS.length;j++){const k=BORDERS[j],on=!!(mask&(1<<j));p*=on?bp[k]:1-bp[k];if(on)rarity*=data.borderRarity[k];if(!on&&s.goal.borders.includes(k))match=false}
    if(p<=0)continue;const boost=outcome.card.weatherLock===s.weather?(data.weather[s.weather]?.boostMultiplier||1):1,hp=Math.floor((10+rarity**.35*5)*boost),score=hp+2*Math.floor(hp/2);variants.push({p,rarity,score,match});
  }
  variants.sort((a,b)=>a.score-b.score||a.rarity-b.rarity);let below=0,best=0;
  for(let i=0;i<variants.length;){let j=i,mass=0,target=0;while(j<variants.length&&variants[j].score===variants[i].score&&variants[j].rarity===variants[i].rarity){mass+=variants[j].p;if(variants[j].match)target+=variants[j].p;j++}best+=target*(2*below+mass);below+=mass;i=j}
  return{plain,best,p:(1-hand)*plain+hand*best};
}
export function batchDistribution(stats){let dist=[{n:1,p:1}];for(const [key,extra] of [['DoubleRollChance',1],['RollTwiceChance',2],['TripleRollChance',2]]){const chance=stats[key];dist=dist.flatMap(o=>[{n:o.n,p:o.p*(1-chance)},{n:o.n+extra,p:o.p*chance}]).filter(o=>o.p>0)}return dist}
export function evaluate(s,data,points=s.points,slots=s.artifact.slots){
  const stats=effective(s,data,points,slots),target=targetProbability(s,data,stats),batches=batchDistribution(stats),mean=batches.reduce((n,b)=>n+b.n*b.p,0);
  const batchChance=p=>batches.reduce((n,b)=>n+b.p*(-Math.expm1(b.n*Math.log1p(-p))),0),cycleP=luckVariants(stats).reduce((n,v)=>{const t=targetProbability(s,data,{...stats,Luck:stats.Luck*v.mult,periodic:[]});return n+v.weight*((1-stats.LuckyHandChance)*batchChance(t.plain)+stats.LuckyHandChance*batchChance(t.best))},0);
  const hours=3600/stats.RollInterval,rate=mean*hours*target.p,cycles=Math.floor(s.minutes*60/stats.RollInterval),chance=cycleP>=1?1:-Math.expm1(cycles*Math.log1p(-cycleP));
  return{stats,probability:target.p,cycleP,cardsPerHour:mean*hours,hitsPerHour:rate,averageSeconds:cycleP>0?stats.RollInterval/cycleP:Infinity,averageCards:target.p>0?1/target.p:Infinity,chance,medianSeconds:cycleP>0?(cycleP>=1?stats.RollInterval:Math.ceil(Math.log(.5)/Math.log1p(-cycleP))*stats.RollInterval):Infinity,p90Seconds:cycleP>0?(cycleP>=1?stats.RollInterval:Math.ceil(Math.log(.1)/Math.log1p(-cycleP))*stats.RollInterval):Infinity};
}
export function profileWarnings(s,data){const warnings=buildWarnings(s,data);const budget=Math.floor(s.rolls/data.rollsPerPoint);if(!validPoints(s.points,budget,data))warnings.push('Your current allocation exceeds earned points or its unlocked cap. Correct it before optimizing.');
  const old=artifactBonuses(s,s.artifact.slots,data);if(!s.build)for(const k of LUCKS){const point=k==='Luck'?'Luck':k.replace('Luck',''),before=s.stats[k]/(old.mult[k]||1)-(old.flat[k]||0)-(data.pointGains[point]||0)*(s.pointScale[point]??1)*(s.points[point]||0);if(before<0)warnings.push(`${k}: current points/artifact contribute more than your displayed total. Check the total, raw artifact values, or point scaling.`)}
  if(s.artifact.slots.length>artifactSlots(s,data))warnings.push('Your artifact has more stats than its unlocked slots.');const counts={};for(const slot of s.artifact.slots){counts[slot.id]=(counts[slot.id]||0)+1;const def=data.personalArtifact.stats.find(d=>d.id===slot.id);if(slot.value<def.min||slot.value>scaledMax(def,artifactLevel(s,data)))warnings.push(`${slot.id}: value is outside the artifact level range.`)}if(Object.values(counts).some(n=>n>2))warnings.push('Artifacts allow at most two copies of the same stat.');return[...new Set(warnings)]}
export function optimizePoints(s,data,progress=()=>{}){
  if(profileWarnings(s,data).length)throw Error(profileWarnings(s,data).join(' '));
  const budget=Math.min(sum(data.pointCaps.at(-1)),Math.floor(s.rolls/data.rollsPerPoint)),zero=Object.fromEntries(POINTS.map(k=>[k,0])),start=effective(s,data,zero),artifact=artifactBonuses(s,s.artifact.slots,data),curves={},required=new Set(s.goal.borders);
  for(const key of POINTS){const max=data.pointCaps.at(-1)[key],stat=key==='Luck'?key:key+'Luck',gain=s.build?effective(s,data,{...zero,[key]:1})[stat]-start[stat]:data.pointGains[key]*s.pointScale[key]*(artifact.mult[stat]||1);curves[key]=Array.from({length:max+1},(_,i)=>{const stats={...start,[stat]:start[stat]+gain*i};if(key==='Luck')return baseProbability(s,data,stats);return required.has(key)?borderProbabilities(s,stats)[key]:1})}
  let best=null,checked=0;const shortlist=[];
  for(let tier=0;tier<data.pointCaps.length;tier++){const upper=data.pointCaps[tier],lower=tier?data.pointCaps[tier-1]:zero;if(sum(lower)>budget)continue;
    for(let l=lower.Luck;l<=Math.min(upper.Luck,budget);l++)for(let sh=lower.Shiny;sh<=Math.min(upper.Shiny,budget-l);sh++)for(let aw=lower.Awakened;aw<=Math.min(upper.Awakened,budget-l-sh);aw++){
      const v=Math.min(upper.Void,budget-l-sh-aw);if(v<lower.Void)continue;const score=curves.Luck[l]*curves.Shiny[sh]*curves.Awakened[aw]*curves.Void[v],points={Luck:l,Shiny:sh,Awakened:aw,Void:v};checked++;
      if(!best||score>best.score+Math.abs(best.score)*1e-14||(score===best.score&&sum(points)>sum(best.points)))best={points,score};
      if(start.LuckyHandChance>0&&(shortlist.length<24||score>shortlist.at(-1).score)){shortlist.push({points,score});shortlist.sort((a,b)=>b.score-a.score);shortlist.length=Math.min(24,shortlist.length)}
    }progress((tier+1)/data.pointCaps.length);
  }
  if(!best)throw Error('No valid point allocation was found.');
  const current=evaluate(s,data);let result=evaluate(s,data,best.points);
  if(start.LuckyHandChance>0){shortlist.push({points:s.points,score:0});for(const candidate of shortlist){const evaluated=evaluate(s,data,candidate.points);if(evaluated.hitsPerHour>result.hitsPerHour){best=candidate;result=evaluated}}}
  if(current.hitsPerHour>result.hitsPerHour){best={points:{...s.points}};result=current}
  return{type:'points',points:best.points,result,current,checked,budget,unused:Math.max(0,Math.floor(s.rolls/data.rollsPerPoint)-sum(best.points)),tier:currentTier(best.points,data)+1,method:start.LuckyHandChance>0?'Candidate search with exact Lucky Hand scoring':'Exhaustive cap-stage search'};
}
export function optimizeArtifact(s,data,progress=()=>{}){
  const warnings=profileWarnings(s,data);if(warnings.length)throw Error(warnings.join(' '));const slots=artifactSlots(s,data);if(!slots)throw Error('Earn enough rolls to unlock your first artifact slot.');
  const level=artifactLevel(s,data),locked=s.artifact.slots.map((x,i)=>({...x,position:i})).filter(x=>x.locked),rarity=data.personalArtifact.rarities.find(r=>r.id===s.artifact.rarity),lockLimit=(s.artifact.gamepass?4:2)+(rarity.bonusLocks||0);
  if(locked.length>lockLimit)throw Error(`The exported rules confirm ${lockLimit} artifact locks for this setup. Void Shop extra locks need confirmation.`);
  const defs=data.personalArtifact.stats.filter(d=>d.id!=='PotionDurationMult'),signature=rows=>rows.map(x=>x.id+':'+x.value).sort().join('|');
  let beam=[{slots:locked,result:evaluate(s,data,s.points,locked)}],checked=0;
  for(let step=locked.length;step<slots;step++){const next=[],seen=new Set();for(const item of beam)for(const def of defs){if(item.slots.filter(x=>x.id===def.id).length>=2)continue;const position=Array.from({length:slots},(_,i)=>i).find(i=>!item.slots.some(x=>x.position===i)),f=10**def.decimals,value=Math.floor((def.min+(scaledMax(def,level)-def.min)*s.artifact.quality)*f+.5)/f,rows=[...item.slots,{id:def.id,value,locked:false,position}].sort((a,b)=>a.position-b.position),key=signature(rows);if(seen.has(key))continue;seen.add(key);next.push({slots:rows,result:evaluate(s,data,s.points,rows)});checked++}next.sort((a,b)=>b.result.hitsPerHour-a.result.hitsPerHour);beam=next.slice(0,12);progress((step+1)/slots)}
  const current=evaluate(s,data),best=beam[0];if(current.hitsPerHour>best.result.hitsPerHour)return{type:'artifact',slots:s.artifact.slots,result:current,current,checked,method:'Beam search; your current artifact is better at this quality'};
  return{type:'artifact',...best,current,checked,method:'Beam search across 17 roll-relevant stats; a recommendation, not a guaranteed global optimum'};
}
