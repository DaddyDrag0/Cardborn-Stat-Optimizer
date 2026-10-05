// Shared definitions are confirmed; the missing server's aggregation order is modeled.
export const BUILD_STATS=['Luck','ShinyLuck','AwakenedLuck','FabledLuck','CorruptedLuck','VoidLuck','RollSpeed','DoubleRollChance','RollTwiceChance','TripleRollChance','LuckyHandChance','PotionPowerMult','PotionDurationMult'];
const LUCKS=BUILD_STATS.slice(0,6),CHANCES=BUILD_STATS.slice(7,11);
const n=(v,lo=0,hi=1e9)=>Math.max(lo,Math.min(hi,Number.isFinite(Number(v))?Number(v):lo));
export function buildDefaults(){return{skills:[],sets:[],crafted:'',craftedTier:'Normal',craftedIndexPoints:0,craftedIndexOrder:'separate',craftedIndexSpeed:false,relics:[],potions:[],passes:{},tower:{},void:{},base:{Luck:1,ShinyLuck:1,AwakenedLuck:1,FabledLuck:2,CorruptedLuck:1,VoidLuck:1},baseInterval:1,under10M:true,inDungeon:false,floor:0,percentOrder:'separate',towerAwakenedGain:.4,extras:[],observed:{}}}
export function normalizeBuild(raw,data){
  const b=buildDefaults(),known=(values,ids)=>Array.isArray(values)?[...new Set(values.filter(x=>ids.includes(x)))]:[];
  b.skills=known(raw.skills,(data.skillNodes||[]).map(x=>x.id));b.sets=known(raw.sets,data.indexSets.map(x=>x.id));
  const groupCounts={};for(const id of [...b.skills]){const node=data.skillNodes.find(x=>x.id===id);if(node.limitGroup&&(groupCounts[node.limitGroup]=(groupCounts[node.limitGroup]||0)+1)>(node.limitGroup==='star1'?2:1))b.skills=removeSkill(b.skills,id,data)}
  b.index=raw.index==null?null:Math.floor(n(raw.index,0,1e9));b.extraSkillPoints=Math.floor(n(raw.extraSkillPoints??0,0,1e6));
  b.towerCapExtra=Math.floor(n(raw.towerCapExtra??0,0,1000));b.currencies=Object.fromEntries(['tower','void','corrupted'].map(k=>[k,Math.floor(n(raw.currencies?.[k]??0,0,1e15))]));
  b.dungeonSeconds=Math.floor(n(raw.dungeonSeconds??3600,1,1e9));
  b.crafted=Object.hasOwn(data.craftedArtifacts||{},raw.crafted)?raw.crafted:'';
  b.craftedTier=data.craftedTiers.some(t=>t.id===raw.craftedTier)?raw.craftedTier:'Normal';
  b.craftedIndexPoints=Math.floor(n(raw.craftedIndexPoints??0,0,Object.keys(data.craftedArtifacts).length*data.craftedTiers.length));
  b.craftedIndexOrder=raw.craftedIndexOrder==='combined'?'combined':'separate';b.craftedIndexSpeed=raw.craftedIndexSpeed===true;
  b.relics=Array.isArray(raw.relics)?raw.relics.slice(0,3).filter(x=>Object.hasOwn(data.relics||{},x?.id)).map(x=>({id:x.id,border:Math.floor(n(x.border,1,6))})):[];
  b.potions=known(raw.potions,Object.keys(data.potions||{}));
  for(const p of data.gamepasses||[])b.passes[p.passKey]=raw.passes?.[p.passKey]===true;
  for(const d of data.towerShop||[])b.tower[d.id]=Math.floor(n(raw.tower?.[d.id]??0,0,shopCap(b,d,'tower')));
  for(const d of data.voidShop||[])b.void[d.id]=Math.floor(n(raw.void?.[d.id]??0,0,d.maxLevel));
  for(const k of LUCKS)b.base[k]=n(raw.base?.[k]??b.base[k],.0001);
  b.baseInterval=n(raw.baseInterval??1,.2,3600);b.under10M=raw.under10M!==false;b.inDungeon=raw.inDungeon===true;b.floor=Math.floor(n(raw.floor??0,0,1e6));
  b.percentOrder=raw.percentOrder==='combined'?'combined':'separate';b.towerAwakenedGain=n(raw.towerAwakenedGain??.4,0,10);
  b.extras=Array.isArray(raw.extras)?raw.extras.slice(0,20).map(x=>({name:String(x.name||'Other bonus').slice(0,80),stat:BUILD_STATS.includes(x.stat)?x.stat:BUILD_STATS.find(k=>x.flat?.[k]||x.percent?.[k])||'Luck',flat:Object.fromEntries(BUILD_STATS.map(k=>[k,n(x.flat?.[k]??0,-1e9,1e9)])),percent:Object.fromEntries(LUCKS.map(k=>[k,n(x.percent?.[k]??0,-.99,100)]))})):[];
  b.observed=Object.fromEntries(BUILD_STATS.map(k=>[k,raw.observed?.[k]==null?null:n(raw.observed[k],0,1e12)]));return b;
}
export function skillClosure(ids,data){const out=new Set(ids),by=new Map(data.skillNodes.map(x=>[x.id,x]));function add(id){for(const req of by.get(id)?.requires||[])if(!out.has(req)){out.add(req);add(req)}}for(const id of [...out])add(id);return[...out]}
export function removeSkill(ids,id,data){const out=new Set(ids);out.delete(id);let changed=true;while(changed){changed=false;for(const node of data.skillNodes)if(out.has(node.id)&&node.requires.some(r=>!out.has(r))){out.delete(node.id);changed=true}}return[...out]}
export function skillBudget(b,data){return b.index==null?null:Math.floor(b.index/data.indexSkillPoints.every)*data.indexSkillPoints.amount+(b.extraSkillPoints||0)}
export function skillCost(ids,data){return data.skillNodes.filter(n=>ids.includes(n.id)).reduce((a,n)=>a+n.cost,0)}
export function skillSelection(b,id,on,data){
  const ids=on?skillClosure([...b.skills,id],data):removeSkill(b.skills,id,data);
  for(const g of ['star1','star2','star3'])if(data.skillNodes.filter(n=>ids.includes(n.id)&&n.limitGroup===g).length>(g==='star1'?2:1))return{error:'Constellations allow only 2 Normal, 1 Greater, and 1 Ascendant stars.'};
  const budget=skillBudget(b,data);if(on&&budget!=null&&skillCost(ids,data)>budget)return{error:'Not enough skill points for this node and its prerequisites.'};return{ids};
}
export function shopCap(b,d,shop){return d.maxLevel+(shop==='tower'&&!d.noExtraLevels?(b.towerCapExtra||0):0)}
export function shopAction(b,shop,id,direction,data){
  const defs=shop==='tower'?data.towerShop:data.voidShop,d=defs.find(d=>d.id===id);if(!d)return{error:'Unknown upgrade.'};
  const level=b[shop][id]||0,cost=d.cost;
  if(direction<0&&shop==='void')return{error:'Void upgrades cannot be refunded.'};
  if(direction>0){if(level>=shopCap(b,d,shop))return{error:'Upgrade is at its cap.'};if((b.currencies?.[shop]||0)<cost)return{error:'Not enough currency.'}}
  else if(level<=0)return{error:'No upgrade to refund.'};
  return{level:level+direction,balance:(b.currencies?.[shop]||0)-direction*cost};
}
export function buildWarnings(s,data){const b=s.build;if(!b)return[];const w=[],owned=new Set(b.skills),groups={};for(const node of data.skillNodes){if(!owned.has(node.id))continue;if(node.requires.some(r=>!owned.has(r)))w.push(`${node.name}: prerequisite missing.`);if(node.limitGroup)groups[node.limitGroup]=(groups[node.limitGroup]||0)+1}for(const [g,count]of Object.entries(groups))if(count>(g==='star1'?2:1))w.push('Constellations allow 2 Normal, 1 Greater, and 1 Ascendant stars.');
  if(skillBudget(b,data)!=null&&skillCost(b.skills,data)>skillBudget(b,data))w.push('Selected skills exceed your Index skill-point budget. Remove nodes or check your Index / extra SP.');
  const relicSlots=1+(b.passes.TwoRelic?1:0)+(b.tower.ThirdRelicSlot||0);if(b.relics.length>relicSlots)w.push(`You equipped ${b.relics.length} relics but have ${relicSlots} slots.`);if(new Set(b.relics.map(x=>x.id)).size!==b.relics.length)w.push('Equip each relic only once.');if(b.relics.filter(x=>data.relics[x.id].Tier==='Legendary').length>2)w.push('At most two Legendary relics can be equipped.');
  const cats={};for(const id of b.potions){const category=data.potions[id].StatCategory;cats[category]=(cats[category]||0)+1}if(Object.values(cats).some(x=>x>1))w.push('Select one active potion per category. The strongest selected boost in a category is used; stacking behavior is unconfirmed.');
  if(b.towerAwakenedGain!==.4&&b.towerAwakenedGain!==.3)w.push('Tower Awakened gain is a custom model value.');return[...new Set(w)];
}
function merge(target,values,scale=1){for(const[k,v]of Object.entries(values||{}))if(typeof v==='number')target[k]=(target[k]||0)+v*scale}
export function craftedBonuses(b,data){
  const tier=data.craftedTiers.find(t=>t.id===b.craftedTier)||data.craftedTiers[0],tierMult=1+tier.boost/100,indexPercent=Math.floor((b.craftedIndexPoints||0)/2)*10,indexMult=1+indexPercent/100,resonance=1+.05*(b.void.VoidArtifactPower||0),preview={},flat={};
  for(const[k,v]of Object.entries(data.craftedArtifacts[b.crafted]?.Boosts||{})){
    // The client's tier preview explicitly excludes RollSpeed. Index stacking and
    // resonance scope are modeled because their server calculation is absent.
    preview[k]=v*(k==='RollSpeed'?1:tierMult);
    const scale=k==='RollSpeed'?(b.craftedIndexSpeed?indexMult:1):b.craftedIndexOrder==='combined'?tierMult+indexMult-1:tierMult*indexMult;
    flat[k]=v*scale*resonance;
  }
  return{tier,tierMult,indexPercent,indexMult,pointsToNext:(b.craftedIndexPoints||0)%2?1:2,resonance,preview,flat};
}
export function calculateBuild(s,data,points,pa){
  const b=s.build,rows=[],flat={},percent={},finalMult={},periodic=[];
  function row(name,f={},p={},m={}){rows.push({name,flat:f,percent:p,mult:m});merge(flat,f);merge(percent,p);for(const[k,v]of Object.entries(m))finalMult[k]=(finalMult[k]||1)*v}
  row('Starting stats',b.base);row('Stat points',Object.fromEntries(Object.entries(points).map(([k,v])=>[k==='Luck'?k:k+'Luck',v*data.pointGains[k]*(s.pointScale[k]??1)])));
  const passFlat={},passMult={};for(const[k,on]of Object.entries(b.passes)){if(!on)continue;if(k==='Luck')passFlat.Luck=5;else if(k==='Fabled')passFlat.FabledLuck=1;else if(['Shiny','Awakened','Corrupted'].includes(k)){passFlat[k+'Luck']=.5;passMult[k+'Luck']=1.1}}row('Gamepasses',passFlat,{},passMult);
  row('Crafted artifact',craftedBonuses(b,data).flat);
  row('Personal Artifact',pa.flat,{},pa.mult);
  const treeFlat={},treePct={};for(const node of data.skillNodes)if(b.skills.includes(node.id)){merge(treeFlat,node.bonus);merge(treePct,node.percent)}row('Skill tree',treeFlat,treePct);
  const relicFlat={};let raidMult=1;for(const relic of b.relics){const def=data.relics[relic.id],scale=(def.BorderScale||[1,1.4,1.9,2.5,3.2,4])[relic.border-1];merge(relicFlat,def.Boosts,scale);if(relic.id==='RelicOfTheLuckyHand')relicFlat.LuckyHandChance=(relicFlat.LuckyHandChance||0)+Math.min(.6,.1*scale);if(relic.id==='RaidersSword')raidMult*=2*scale;if(['RelicOfBonus','WeightedDice'].includes(relic.id))periodic.push({every:Math.max(relic.id==='WeightedDice'?10:5,Math.floor((relic.id==='WeightedDice'?50:25)/scale+.5)),mult:relic.id==='WeightedDice'?4:2})}row('Relics',relicFlat);
  const setFlat={};for(const set of data.indexSets)if(b.sets.includes(set.id))merge(setFlat,set.bonus);row('Completed Index Sets',setFlat);
  const towerFlat={};for(const def of data.towerShop)if(def.id!=='ThirdRelicSlot')towerFlat[def.id]=(b.tower[def.id]||0)*(def.id==='AwakenedLuck'?b.towerAwakenedGain:def.gain);row('Tower Shop',towerFlat);
  row('Void Shop',{}, {},{VoidLuck:1+.03*(b.void.VoidLuckPct||0)});
  for(const extra of b.extras)row(extra.name,extra.flat,extra.percent);
  const power=Math.max(0,1+(flat.PotionPowerMult||0)+.04*(b.void.VoidPotionPower||0)),potionFlat={},potionMult={},categories=new Map();
  for(const id of b.potions){const def=data.potions[id],selected=categories.get(def.StatCategory)||{};for(const[k,v]of Object.entries(def.Boosts))selected[k]=Math.max(selected[k]||0,v);categories.set(def.StatCategory,selected)}
  const finalNames={FinalLuckMult:'Luck',FinalShinyMult:'ShinyLuck',FinalAwakenedMult:'AwakenedLuck',FinalFabledMult:'FabledLuck',FinalCorruptedMult:'CorruptedLuck',FinalVoidMult:'VoidLuck',FinalRollSpeedMult:'RollSpeed'};
  for(const selected of categories.values())for(const[k,v]of Object.entries(selected)){if(finalNames[k])potionMult[finalNames[k]]=(potionMult[finalNames[k]]||1)*(1+v*power);else potionFlat[k]=(potionFlat[k]||0)+v*power}row('Active potions / Parkour Orb',potionFlat,{},potionMult);
  const weather=data.weather[s.weather]||{};row('Weather',{Luck:weather.luckBonus||0},{},{Luck:weather.luckMultiplier||1});
  row('Under 10M rolls boost',{}, {},{Luck:b.under10M&&s.rolls<1e7?1.25:1});
  const stats={};for(const k of LUCKS){const paMult=pa.mult[k]||1;let multiplier=finalMult[k]||1;if(b.percentOrder==='combined'){// Keep weather/under-10M and potion multipliers separate; combine tree with artifact.
    multiplier=multiplier/paMult*(1+(paMult-1)+(percent[k]||0));
  }else multiplier*=1+(percent[k]||0);stats[k]=Math.max(.0001,(flat[k]||0)*multiplier)}
  const speed=(flat.RollSpeed||0)*(finalMult.RollSpeed||1);stats.RollSpeed=speed;stats.RollInterval=Math.max(data.minimumInterval,b.baseInterval-speed);
  for(const k of CHANCES)stats[k]=Math.max(0,Math.min(1,flat[k]||0));stats.PotionPowerMult=power;stats.PotionDurationMult=Math.max(0,(1+(flat.PotionDurationMult||0))*(1+(percent.PotionDurationMult||0)));
  if(b.inDungeon){const bonus={Luck:8*Math.floor(b.floor/5),ShinyLuck:.4*Math.floor(b.floor/10),AwakenedLuck:Math.floor(b.floor/15),CorruptedLuck:.5*Math.floor(b.floor/12)};rows.push({name:'Infinite Dungeon floor (historical estimate)',flat:bonus,percent:{},mult:{}});for(const[k,v]of Object.entries(bonus))stats[k]+=v}
  stats.periodic=periodic;stats.RaidFabledLuck=stats.FabledLuck*raidMult;
  return{stats,rows,power,periodic,raidMult};
}
export function luckVariants(stats){const a=stats.periodic?.[0],b=stats.periodic?.[1];if(!a)return[{weight:1,mult:1}];if(!b)return[{weight:1-1/a.every,mult:1},{weight:1/a.every,mult:a.mult}];const gcd=(x,y)=>y?gcd(y,x%y):x,joint=gcd(a.every,b.every)/(a.every*b.every);return[{weight:1-1/a.every-1/b.every+joint,mult:1},{weight:1/a.every-joint,mult:a.mult},{weight:1/b.every-joint,mult:b.mult},{weight:joint,mult:a.mult*b.mult}].filter(x=>x.weight>0)}
