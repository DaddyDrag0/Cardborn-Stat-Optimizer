import {matchesBorderTarget} from './rarity-results.js?v=9.7';
import {towerSessionPlan,towerTotalCards,towerBonuses} from './tower-simulation.js?v=9.7';
import {normalize,effective,POINTS,BORDERS,CHANCES,LUCKS,sum,validPoints,currentTier,artifactSlots,artifactLevel,scaledMax,cardDistribution,borderProbabilities,profileWarnings} from './core.js?v=9.7';
import {skillCost,skillBudget,skillClosure,removeSkill,skillSelection,corruptedCost,shopCap} from './build.js?v=9.7';
import {periodicGroups} from './roll-timing.js?v=9.7';

const clone=x=>structuredClone(x),STEP=.125;
const pullGoal=settings=>['hits','borders'].includes(settings.objective);
const searchScore=(result,settings)=>pullGoal(settings)?Math.log(Math.max(Number.MIN_VALUE,result.score)):result.score;
export const COMPONENTS={points:'Stat points',skills:'Skill tree & constellations',artifact:'Personal Artifact',equipment:'Relics',shops:'Shop spending'};
export function optimizerSettings(s,data){
  const raw=s.optimizer||{},b=s.build||{};
  return{
    objective:['hits','highest','cards','borders'].includes(raw.objective)?raw.objective:'hits',
    borders:Array.isArray(raw.borders)?BORDERS.filter(k=>raw.borders.includes(k)):['Shiny','Awakened'],
    match:raw.match==='exact'?'exact':'contains',
    rarity:Math.max(1,Math.min(1e100,Number(raw.rarity)||1e15)),tower:s.simulation?.tower===true,
    seconds:Math.max(60,Math.min(172800,Number(raw.seconds)||28800)),
    components:Object.fromEntries(Object.keys(COMPONENTS).map(k=>[k,raw.components?.[k]!==false])),
    relics:[...(raw.relics||[]),...(b.relics||[])].filter(x=>data.relics[x.id]).map(x=>({id:x.id,border:Math.max(1,Math.min(6,Math.floor(Number(x.border)||1)))})).filter((x,i,a)=>a.findIndex(y=>y.id===x.id&&y.border===x.border)===i),
  };
}

// Integrate the survival distribution of the session's best final rarity on a
// 0.125-decade grid. All card/border probabilities and shared batch effects are
// evaluated; only the integration grid and build search are approximate.
export function createBuildEvaluator(s,data,settings=optimizerSettings(s,data),{exactTower=false}={}){
  if(settings.objective==='borders'&&!settings.borders?.length)throw Error('Choose at least one border.');
  const cards=data.cards,cardIndex=new Map(cards.map((c,i)=>[c.name,i])),geometry=[];
  for(let ci=0;ci<cards.length;ci++)for(let mask=0;mask<32;mask++){
    const card=cards[ci];let rarity=card.rarityValue;
    for(let i=0;i<5;i++)if(mask&(1<<i))rarity*=data.borderRarity[BORDERS[i]];
    const boost=card.weatherLock===s.weather?(data.weather[s.weather]?.boostMultiplier||1):1,hp=Math.floor((10+rarity**.35*5)*boost);
    geometry.push({ci,mask,rarity,score:hp+2*Math.floor(hp/2),bin:Math.floor(Math.log10(Math.max(1,rarity))/STEP+1e-10),multi:mask.toString(2).replace(/0/g,'').length>=2,hit:settings.objective==='borders'?matchesBorderTarget(BORDERS.filter((b,i)=>mask&(1<<i)),settings):(settings.baseRarity?card.rarityValue:rarity)>=settings.rarity&&(!settings.targetCard||card.name===settings.targetCard)&&(!settings.requiredBorders?.length||matchesBorderTarget(BORDERS.filter((b,i)=>mask&(1<<i)),{borders:settings.requiredBorders,match:'contains'})),fabled:card.rarityValue<=s.fabledMax});
  }
  geometry.sort((a,b)=>a.score-b.score||a.rarity-b.rarity);
  if(settings.objective==='hits'&&!settings.allowUnavailable&&settings.rarity>Math.max(...geometry.map(o=>o.rarity)))throw Error('Minimum rarity is above the highest modeled final rarity. Lower it and try again.');
  const bins=1+Math.max(...geometry.map(o=>o.bin)),ties=[];
  for(let i=0;i<geometry.length;){let j=i+1;while(j<geometry.length&&geometry[j].score===geometry[i].score&&geometry[j].rarity===geometry[i].rarity)j++;ties.push([i,j]);i=j}
  const plan=settings.tower?towerSessionPlan(s.build,settings.seconds):null,towerGroups=[];
  if(plan){
    const last=plan.completedRuns?plan.floor:plan.partialFloor,step=exactTower?1:Math.max(1,Math.ceil(last/24));
    for(let start=1;start<=last;start+=step){const end=Math.min(last,start+step-1),amount=plan.completedRuns*(towerTotalCards(end)-towerTotalCards(start-1))+Math.max(0,towerTotalCards(Math.min(end,plan.partialFloor))-towerTotalCards(Math.min(start-1,plan.partialFloor)));if(amount)towerGroups.push({floor:Math.floor((start+end)/2),amount})}
  }
  const cache=new Map(),leaders=new Map();let checked=0;
  function remember(profile,key,result){
    cache.set(key,result);
    if(leaders.size<8||result.score>[...leaders.values()].at(-1).score){leaders.set(key,{profile:clone(profile),score:result.score});const sorted=[...leaders.entries()].sort((a,b)=>b[1].score-a[1].score).slice(0,8);leaders.clear();for(const entry of sorted)leaders.set(...entry)}
    return result;
  }
  function evaluate(profile){
    const normalProfile=plan?{...profile,build:{...profile.build,inDungeon:false}}:profile,stats=effective(normalProfile,data),key=[...LUCKS,...CHANCES,'RollInterval'].map(k=>stats[k]).join('|')+'|'+JSON.stringify([stats.periodic,profile.badges,profile.unlocks,profile.globalLuck]);
    if(cache.has(key))return cache.get(key);checked++;
    const cycles=Math.floor(settings.seconds/stats.RollInterval),mean=1+stats.DoubleRollChance+2*stats.RollTwiceChance+2*stats.TripleRollChance,normalExpectedCards=cycles*mean,towerExpectedCards=plan?.cards||0,expectedCards=normalExpectedCards+towerExpectedCards,cardsPerHour=expectedCards/settings.seconds*3600;
    if(settings.objective==='cards')return remember(profile,key,{score:cardsPerHour,cardsPerHour,expectedCards,normalExpectedCards,towerExpectedCards,stats});
    const logMiss=new Float64Array(bins);let multiCards=0,normalHits=0,towerHits=0,hitLogMiss=0;
    const grouped=periodicGroups(cycles,stats.periodic,profile.rollCounter||0).map(g=>({...g,stats,tower:false,amount:g.cycles}));
    for(const g of towerGroups){const rewardStats={...stats,periodic:[]};for(const [key,value]of Object.entries(towerBonuses(g.floor)))rewardStats[key]+=value;grouped.push({...g,stats:rewardStats,tower:true,mult:1})}
    const logBatchMiss=p=>{p=Math.max(0,Math.min(1,p));return Math.log1p(-p)+Math.log1p(-stats.DoubleRollChance*p)+Math.log1p(-stats.RollTwiceChance*(2*p-p*p))+Math.log1p(-stats.TripleRollChance*(2*p-p*p))};
    const mixLog=(p,h)=>Math.log1p((1-stats.LuckyHandChance)*Math.expm1(logBatchMiss(p))+stats.LuckyHandChance*Math.expm1(logBatchMiss(h)));
    for(const group of grouped){
      const bp=borderProbabilities(profile,group.stats),normal=new Float64Array(32),noFabled=new Float64Array(32);
      for(let mask=0;mask<32;mask++){let p=1,q=1;for(let i=0;i<5;i++){const on=mask&(1<<i),chance=bp[BORDERS[i]];p*=on?chance:1-chance;q*=i===2?(on?0:1):(on?chance:1-chance)}normal[mask]=p;noFabled[mask]=q}
      const masses=new Float64Array(cards.length),plain=new Float64Array(bins),hand=new Float64Array(bins),probabilities=new Float64Array(geometry.length);
      for(const o of cardDistribution(profile,data,group.stats.Luck*group.mult))masses[cardIndex.get(o.card.name)]+=o.p;
      let below=0,plainMulti=0,handMulti=0,plainHit=0,handHit=0;
      if(group.tower){
        for(const o of geometry){if(!masses[o.ci])continue;const p=masses[o.ci]*(o.fabled?normal[o.mask]:noFabled[o.mask]);if(settings.objective==='highest')plain[o.bin]+=p;if(o.multi)plainMulti+=p;if(o.hit)plainHit+=p}
      }else{
        for(let i=0;i<geometry.length;i++){const o=geometry[i];probabilities[i]=masses[o.ci]*(o.fabled?normal[o.mask]:noFabled[o.mask])}
        for(const [i,j]of ties){let mass=0;for(let k=i;k<j;k++)mass+=probabilities[k];const factor=2*below+mass;
          for(let k=i;k<j;k++){const o=geometry[k],p=probabilities[k],h=p*factor;plain[o.bin]+=p;hand[o.bin]+=h;if(o.multi){plainMulti+=p;handMulti+=h}if(o.hit){plainHit+=p;handHit+=h}}below+=mass;
        }
      }
      if(group.tower){towerHits+=group.amount*plainHit;hitLogMiss+=group.amount*Math.log1p(-Math.min(1,plainHit));multiCards+=group.amount*plainMulti}
      else{normalHits+=group.amount*mean*((1-stats.LuckyHandChance)*plainHit+stats.LuckyHandChance*handHit);hitLogMiss+=group.amount*mixLog(plainHit,handHit);multiCards+=group.amount*mean*((1-stats.LuckyHandChance)*plainMulti+stats.LuckyHandChance*handMulti)}
      if(settings.objective==='highest'){
        let p=0,h=0;for(let bin=bins-1;bin>=1;bin--){p+=plain[bin];h+=hand[bin];logMiss[bin]+=group.amount*(group.tower?Math.log1p(-Math.min(1,p)):mixLog(p,h))}
      }
    }
    let bestLog=0,median=0;const curve=[];
    if(settings.objective==='highest')for(let i=1;i<bins;i++){const chance=-Math.expm1(logMiss[i]);bestLog+=STEP*chance;if(chance>=.5)median=10**(i*STEP);if(i%8===0)curve.push({rarity:10**(i*STEP),chance})}
    const expectedHits=normalHits+towerHits,multiPerHour=multiCards/settings.seconds*3600;
    const result={score:pullGoal(settings)?expectedHits:bestLog,expectedHits,normalHits,towerHits,chance:Math.max(0,-Math.expm1(hitLogMiss)),logMiss:hitLogMiss,bestLog,typicalBest:10**bestLog,medianBest:median,cardsPerHour,expectedCards,normalExpectedCards,towerExpectedCards,multiPerHour,curve,stats};
    if(cache.size>40000)cache.clear();return remember(profile,key,result);
  }
  return{evaluate,get checked(){return checked},finalists:()=>[...leaders.values()].map(x=>x.profile)};
}

function bestOf(candidates,score){let best=candidates[0],value=score(best);for(const candidate of candidates.slice(1)){const v=score(candidate);if(v>value+1e-10){best=candidate;value=v}}return best}
function pointSearch(profile,data,score){
  const budget=Math.min(Math.floor(profile.rolls/data.rollsPerPoint),sum(data.pointCaps.at(-1))),seeds=[profile];
  // Fill the mandatory lower stages, then explore different starting corners.
  let base=Object.fromEntries(POINTS.map(k=>[k,0]));
  for(const cap of data.pointCaps)if(sum(cap)<=budget)base={...cap};else break;
  for(const priority of POINTS){const p={...base};while(sum(p)<budget){const caps=data.pointCaps[currentTier(p,data)],k=[priority,...POINTS.filter(x=>x!==priority)].find(k=>p[k]<caps[k]);if(!k)break;p[k]++}seeds.push({...profile,points:p})}
  let best=bestOf(seeds,score);
  for(const chunk of [25,10,5,1])for(let pass=0;pass<40;pass++){
    const candidates=[best],used=sum(best.points);
    for(const to of POINTS){
      for(const from of [null,...POINTS.filter(k=>k!==to)]){
        const p={...best.points},amount=Math.min(chunk,from?p[from]:budget-used);if(!amount)continue;
        if(from)p[from]-=amount;p[to]+=amount;if(validPoints(p,budget,data))candidates.push({...best,points:p});
      }
    }
    const next=bestOf(candidates,score);if(next===best)break;best=next;
  }
  return best;
}

function skillSearch(profile,data,score){
  const budget=skillBudget(profile.build,data),nodes=data.skillNodes;
  function fill(seed){
    let best=seed;
    for(let pass=0;pass<nodes.length;pass++){
      const current=score(best),cost=skillCost(best.build.skills,data);let winner=null,efficiency=-Infinity;
      for(const node of nodes){
        if(best.build.skills.includes(node.id))continue;
        const selection=skillSelection(best.build,node.id,true,data);if(selection.error)continue;
        const spent=skillCost(selection.ids,data)-cost;if(spent<=0||cost+spent>budget)continue;
        const candidate={...best,build:{...best.build,skills:selection.ids}},gain=score(candidate)-current;
        if(gain>1e-10&&gain/spent>efficiency){winner=candidate;efficiency=gain/spent}
      }
      if(!winner)break;best=winner;
    }
    return best;
  }
  const empty={...profile,build:{...profile.build,skills:[]}};
  let best=bestOf([profile,fill(profile),fill(empty)],score);
  // Remove branches or replace exclusive stars, then refill prerequisites as
  // packages. This can escape the path chosen by the initial greedy allocation.
  for(let pass=0;pass<2;pass++){
    const seeds=[];
    for(const group of ['Fortune','Velocity','Radiance','Mythos','Corrupted','Alchemy','star1','star2','star3']){
      let ids=best.build.skills;
      for(const node of nodes.filter(n=>n.branch===group||n.limitGroup===group))ids=removeSkill(ids,node.id,data);
      if(ids.length!==best.build.skills.length)seeds.push({...best,build:{...best.build,skills:ids}});
    }
    // Promote promising partial reallocations; otherwise every branch refill
    // would repeat the same expensive package search.
    for(const node of nodes.filter(n=>!best.build.skills.includes(n.id)&&n.limitGroup)){
      let ids=best.build.skills;for(const old of nodes.filter(n=>ids.includes(n.id)&&n.limitGroup===node.limitGroup))ids=removeSkill(ids,old.id,data);
      const b={...best.build,skills:ids},selection=skillSelection(b,node.id,true,data);if(!selection.error)seeds.push({...best,build:{...b,skills:selection.ids}});
    }
    seeds.sort((a,b)=>score(b)-score(a));const next=bestOf([best,...seeds.slice(0,5).map(fill)],score);if(next===best)break;best=next;
  }
  return best;
}

const plannedPAValue=(def,profile,data)=>Math.round((def.min+(scaledMax(def,artifactLevel(profile,data))-def.min)*profile.artifact.quality)*10**def.decimals)/10**def.decimals;

// Treat the proposed stats as a multiset. Retain matching owned rolls once each,
// in their actual slots; planned quality applies only to new or improved rolls.
export function reuseOwnedPARolls(profile,origin,data){
  const length=artifactSlots(profile,data),slots=Array.from({length},(_,i)=>profile.artifact.slots[i]?.locked?clone(profile.artifact.slots[i]):{id:'',value:0,locked:false}),pending=[];
  for(const def of data.personalArtifact.stats){
    const requested=profile.artifact.slots.slice(0,length).map((slot,i)=>({...slot,i})).filter(x=>!x.locked&&x.id===def.id).sort((a,b)=>b.value-a.value||a.i-b.i);
    const owned=origin.artifact.slots.slice(0,length).map((slot,i)=>({...slot,i})).filter(x=>!x.locked&&!slots[x.i].locked&&x.id===def.id).sort((a,b)=>b.value-a.value||a.i-b.i);
    for(let i=0;i<requested.length;i++){
      const value=Math.min(requested[i].value,plannedPAValue(def,profile,data)),keep=owned[i];
      if(keep)slots[keep.i]={id:def.id,value:Math.max(value,keep.value),locked:false};
      else pending.push({id:def.id,value,locked:false,i:requested[i].i});
    }
  }
  for(const {i,...slot}of pending){const position=!slots[i].id?i:slots.findIndex(x=>!x.id&&!x.locked);slots[position]=slot}
  return{...profile,artifact:{...profile.artifact,slots}};
}

function paSearch(profile,data,score,origin=profile){
  const length=artifactSlots(profile,data);if(!length)return profile;
  const candidates=data.personalArtifact.stats.filter(d=>d.id!=='PotionDurationMult').map(d=>({id:d.id,value:plannedPAValue(d,profile,data),locked:false}));
  const reuse=p=>reuseOwnedPARolls(p,origin,data),reusedScore=p=>score(reuse(p));
  const starting=Array.from({length},(_,i)=>profile.artifact.slots[i]?.locked?clone(profile.artifact.slots[i]):{id:'',value:0,locked:false});
  let beam=[{...profile,artifact:{...profile.artifact,slots:starting}}];
  for(let i=0;i<length;i++){
    if(starting[i].locked)continue;const next=[];
    for(const p of beam)for(const slot of candidates){if(p.artifact.slots.filter(x=>x.id===slot.id).length>=2)continue;const slots=p.artifact.slots.slice();slots[i]=slot;next.push({...p,artifact:{...p.artifact,slots}})}
    next.sort((a,b)=>reusedScore(b)-reusedScore(a));beam=next.slice(0,6);
  }
  let best=bestOf([profile,...beam.map(reuse)],score);
  for(let pass=0;pass<3;pass++){
    const next=[best],slots=best.artifact.slots;
    for(let i=0;i<length;i++)if(!slots[i].locked){
      for(const slot of candidates){if(slots.filter((x,j)=>j!==i&&x.id===slot.id).length>=2)continue;const copy=slots.slice();copy[i]=slot;next.push(reuse({...best,artifact:{...best.artifact,slots:copy}}))}
    }
    const winner=bestOf(next,score);if(winner===best)break;best=winner;
  }
  return best;
}

function equipmentSearch(profile,data,settings,score){
  const slots=1+(profile.build.passes.TwoRelic?1:0)+(profile.build.tower.ThirdRelicSlot||0),combos=[[]];
  function enumerate(start,items){if(items.length===slots)return;for(let i=start;i<settings.relics.length;i++){const item=settings.relics[i];if(items.some(x=>x.id===item.id))continue;const list=[...items,item];if(list.filter(x=>data.relics[x.id].Tier==='Legendary').length>2)continue;combos.push(list);enumerate(i+1,list)}}
  enumerate(0,[]);
  // Exact enumeration of the permitted owned equipment combinations for the
  // current point/tree/PA allocation. Revisiting it after those searches matters.
  let best=profile;
  for(const relics of combos){const p={...profile,build:{...profile.build,relics}};if(score(p)>score(best)+1e-10)best=p}
  return best;
}
function shopSearch(profile,data,settings,score,origin=profile){
  // Reconsider purchases using the original owned levels and unspent balances.
  // Earlier hypothetical purchases must not become locked investments merely
  // because another search pass chose them before the final loadout changed.
  let best=normalize({...profile,build:{...profile.build,tower:clone(origin.build.tower),void:clone(origin.build.void),corrupted:clone(origin.build.corrupted),currencies:clone(origin.build.currencies)}},data);
  if(settings.components.equipment)best=equipmentSearch(best,data,settings,score);
  else best.build.relics=best.build.relics.slice(0,1+(best.build.passes.TwoRelic?1:0)+(best.build.tower.ThirdRelicSlot||0));
  for(const shop of ['tower','corrupted','void']){
    const defs=shop==='tower'?data.towerShop:shop==='void'?data.voidShop:data.corruptedUpgrades;
    // Beam search over whole level packages avoids buying prerequisites that
    // give no immediate stat benefit, notably the PA/relic slot upgrades.
    let beam=[best],winner=best;
    for(let pass=0;pass<defs.reduce((n,d)=>n+shopCap(best.build,d,shop),0);pass++){
      const next=[],seen=new Set();
      for(const p of beam)for(const d of defs){
        if(d.id==='InfiniteBanSlots'||d.id==='PASlots'&&!settings.components.artifact||d.id==='ThirdRelicSlot'&&!settings.components.equipment)continue;
        const level=p.build[shop][d.id]||0,cost=shop==='corrupted'?corruptedCost(d,level):d.cost;
        if(level>=shopCap(p.build,d,shop)||cost>p.build.currencies[shop])continue;
        let candidate={...p,build:{...p.build,[shop]:{...p.build[shop],[d.id]:level+1},currencies:{...p.build.currencies,[shop]:p.build.currencies[shop]-cost}}};
        if(shop==='void'&&d.id==='PASlots'){
          candidate=normalize(candidate,data);
          const i=candidate.artifact.slots.length-1,level=artifactLevel(candidate,data);
          const choices=data.personalArtifact.stats.filter(d=>d.id!=='PotionDurationMult'&&candidate.artifact.slots.filter(x=>x.id===d.id).length<2).map(def=>{const slots=candidate.artifact.slots.slice();slots[i]={id:def.id,value:Math.round((def.min+(scaledMax(def,level)-def.min)*candidate.artifact.quality)*10**def.decimals)/10**def.decimals,locked:false};return{...candidate,artifact:{...candidate.artifact,slots}}});
          candidate=bestOf([candidate,...choices],score);
        }
        if(d.id==='ThirdRelicSlot')candidate=equipmentSearch(candidate,data,settings,score);
        const key=JSON.stringify(candidate.build[shop]);if(seen.has(key))continue;seen.add(key);
        next.push(candidate);
      }
      if(!next.length)break;
      next.sort((a,b)=>score(b)-score(a)||b.build.currencies[shop]-a.build.currencies[shop]);beam=next.slice(0,5);winner=bestOf([winner,...beam],score);
    }
    best=winner;
  }
  return bestOf([profile,best],score);
}

export function optimizeBuild(raw,data,progress=()=>{}){
  const s=normalize(raw,data);if(!s.build)throw Error('Complete Setup before optimizing.');
  const warnings=profileWarnings(s,data);if(warnings.length)throw Error(warnings.join(' '));
  const settings=optimizerSettings(s,data),evaluator=createBuildEvaluator(s,data,settings),score=p=>searchScore(evaluator.evaluate(p),settings),current=evaluator.evaluate(s);
  const operations={equipment:p=>equipmentSearch(p,data,settings,score),points:p=>pointSearch(p,data,score),skills:p=>skillSearch(p,data,score),artifact:p=>paSearch(p,data,score,s),shops:p=>shopSearch(p,data,settings,score,s)};
  let best=s,done=0;
  // Different group orders and another pass let potion power, multipliers,
  // speed saturation, periodic relics and point allocations influence each other.
  const orders=[['equipment','points','skills','artifact','shops'],['shops','artifact','skills','points','equipment'],['equipment','skills','points','artifact','shops']];
  for(const order of orders)for(const key of order){
    progress({phase:COMPONENTS[key],value:done++/15,checked:evaluator.checked});if(!settings.components[key])continue;
    const candidate=operations[key](best);if(score(candidate)>=score(best)-1e-10)best=candidate;
  }
  best=normalize(best,data);
  let finalEvaluator=evaluator,baseline=current;
  if(settings.tower){
    progress({phase:'Checking every Tower floor',value:.96,checked:evaluator.checked});
    finalEvaluator=createBuildEvaluator(s,data,settings,{exactTower:true});baseline=finalEvaluator.evaluate(s);
    best=bestOf([s,best,...evaluator.finalists().map(p=>normalize(p,data)).filter(p=>!profileWarnings(p,data).length)],p=>searchScore(finalEvaluator.evaluate(p),settings));
    best=normalize(best,data);best.build.inDungeon=false;
  }
  const result=finalEvaluator.evaluate(best);
  if(result.score<(pullGoal(settings)?baseline.score*(1-1e-12):baseline.score-1e-9))throw Error('Search produced an invalid recommendation. Your setup was kept.');
  const invalid=profileWarnings(best,data);if(invalid.length)throw Error(invalid.join(' '));
  best.stats=result.stats;
  const opportunities=nextUpgrades(best,data,settings,evaluator);
  const priceEstimates=data.corruptedUpgrades.filter(d=>{for(let lv=s.build.corrupted[d.id]||0;lv<(best.build.corrupted[d.id]||0);lv++)if(d.knownNextCosts[lv]==null)return true;return false}).map(d=>d.name);
  progress({phase:'Complete',value:1,checked:evaluator.checked});
  return{type:'build',original:clone(s),profile:best,current:baseline,result,settings,opportunities,priceEstimates,checked:evaluator.checked+(settings.tower?finalEvaluator.checked:0),method:(settings.tower?'Search uses weighted Tower floor samples; final comparison checks every cleared floor. ':'')+'Equipment enumeration, prerequisite packages, beam search and repeated group refinement. Approximate search.'};
}

export function nextUpgrades(profile,data,settings,evaluator=createBuildEvaluator(profile,data,settings)){
  const current=evaluator.evaluate(profile),rows=[];
  function add(label,requirement,candidate){const result=evaluator.evaluate(normalize(candidate,data));if(result.score>(pullGoal(settings)?current.score*(1+1e-10):current.score+1e-9))rows.push({label,requirement,score:result.score,gain:settings.objective==='highest'?10**(result.score-current.score):result.score/current.score,typicalBest:result.typicalBest,cardsPerHour:result.cardsPerHour})}
  for(const shop of ['tower','corrupted','void'])for(const d of shop==='tower'?data.towerShop:shop==='void'?data.voidShop:data.corruptedUpgrades){
    const lv=profile.build[shop][d.id]||0;if(lv>=shopCap(profile.build,d,shop))continue;
    const cost=shop==='corrupted'?corruptedCost(d,lv):d.cost;
    let candidate={...profile,build:{...profile.build,[shop]:{...profile.build[shop],[d.id]:lv+1}}};
    if(d.id==='PASlots')candidate=paSearch(normalize(candidate,data),data,p=>searchScore(evaluator.evaluate(p),settings));
    if(d.id==='ThirdRelicSlot')candidate=equipmentSearch(candidate,data,settings,p=>searchScore(evaluator.evaluate(p),settings));
    add(d.name+' '+(lv+1),`${cost} ${shop==='tower'?'gold':shop==='void'?'Void Coins':'Corrupted Coins'}${shop==='corrupted'&&d.knownNextCosts[lv]==null?' (estimated price)':''}`,candidate);
  }
  for(const set of data.indexSets)if(!profile.build.sets.includes(set.id))add(set.name,'Complete Index set',{...profile,build:{...profile.build,sets:[...profile.build.sets,set.id]}});
  for(const achievement of data.achievements)if(!profile.build.achievements.includes(achievement.id))add(achievement.name,'Earn achievement',{...profile,build:{...profile.build,achievements:[...profile.build.achievements,achievement.id]}});
  const rarity=data.personalArtifact.rarities.findIndex(r=>r.id===profile.artifact.rarity);
  if(rarity<data.personalArtifact.rarities.length-1)add(data.personalArtifact.rarities[rarity+1].name+' PA','Roll higher PA rarity',{...profile,artifact:{...profile.artifact,rarity:data.personalArtifact.rarities[rarity+1].id}});
  if(profile.build.skills.length<data.skillNodes.length){
    const index=(Math.floor(profile.build.index/data.indexSkillPoints.every)+1)*data.indexSkillPoints.every;
    const candidate=skillSearch({...profile,build:{...profile.build,index}},data,p=>searchScore(evaluator.evaluate(p),settings));
    add('Next '+data.indexSkillPoints.amount+' skill points',`Reach ${index} Card Index`,candidate);
  }
  const level=artifactLevel(profile,data);
  if(level<100){
    const rolls=Math.ceil(((level+1)/100)**(1/data.personalArtifact.levelExponent)*data.personalArtifact.rollsForMaxLevel);
    let candidate=normalize({...profile,rolls},data);
    candidate=paSearch(candidate,data,p=>searchScore(evaluator.evaluate(p),settings));
    add('PA level '+(level+1),`${rolls.toLocaleString('en-US')} lifetime rolls`,candidate);
  }
  return rows.sort((a,b)=>b.gain-a.gain).slice(0,10);
}
