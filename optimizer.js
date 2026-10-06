import {normalize,effective,POINTS,BORDERS,CHANCES,LUCKS,sum,validPoints,currentTier,artifactSlots,artifactLevel,scaledMax,cardDistribution,borderProbabilities,profileWarnings} from './core.js?v=8';
import {skillCost,skillBudget,skillClosure,removeSkill,skillSelection,potionGroup,corruptedCost} from './build.js?v=8';
import {periodicGroups} from './roll-timing.js?v=8';

const clone=x=>structuredClone(x),STEP=.125;
export const COMPONENTS={points:'Stat points',skills:'Skill tree & constellations',artifact:'Personal Artifact',equipment:'Artifact & relics',potions:'Potions',shops:'Shop spending'};
export function optimizerSettings(s,data){
  const raw=s.optimizer||{},b=s.build||{};
  return{
    objective:['highest','cards','borders'].includes(raw.objective)?raw.objective:'highest',
    seconds:Math.max(60,Math.min(172800,Number(raw.seconds)||28800)),
    components:Object.fromEntries(Object.keys(COMPONENTS).map(k=>[k,raw.components?.[k]!==false])),
    crafted:[...(raw.crafted||[]),...(b.crafted?[{id:b.crafted,tier:b.craftedTier}]:[])].filter(x=>data.craftedArtifacts[x.id]&&data.craftedTiers.some(t=>t.id===x.tier)).filter((x,i,a)=>a.findIndex(y=>y.id===x.id&&y.tier===x.tier)===i),
    relics:[...(raw.relics||[]),...(b.relics||[])].filter(x=>data.relics[x.id]).map(x=>({id:x.id,border:Math.max(1,Math.min(6,Math.floor(Number(x.border)||1)))})).filter((x,i,a)=>a.findIndex(y=>y.id===x.id&&y.border===x.border)===i),
    potions:[...new Set([...(raw.potions||[]),...(b.potions||[])])].filter(id=>data.potions[id]&&Object.keys(data.potions[id].Boosts).length),
  };
}

// Integrate the survival distribution of the session's best final rarity on a
// 0.125-decade grid. All card/border probabilities and shared batch effects are
// evaluated; only the integration grid and build search are approximate.
export function createBuildEvaluator(s,data,settings=optimizerSettings(s,data)){
  const cards=data.cards,cardIndex=new Map(cards.map((c,i)=>[c.name,i])),geometry=[];
  for(let ci=0;ci<cards.length;ci++)for(let mask=0;mask<32;mask++){
    const card=cards[ci];let rarity=card.rarityValue;
    for(let i=0;i<5;i++)if(mask&(1<<i))rarity*=data.borderRarity[BORDERS[i]];
    const boost=card.weatherLock===s.weather?(data.weather[s.weather]?.boostMultiplier||1):1,hp=Math.floor((10+rarity**.35*5)*boost);
    geometry.push({ci,mask,rarity,score:hp+2*Math.floor(hp/2),bin:Math.floor(Math.log10(Math.max(1,rarity))/STEP+1e-10),multi:mask.toString(2).replace(/0/g,'').length>=2,fabled:card.rarityValue<=s.fabledMax});
  }
  geometry.sort((a,b)=>a.score-b.score||a.rarity-b.rarity);
  const bins=1+Math.max(...geometry.map(o=>o.bin)),ties=[];
  for(let i=0;i<geometry.length;){let j=i+1;while(j<geometry.length&&geometry[j].score===geometry[i].score&&geometry[j].rarity===geometry[i].rarity)j++;ties.push([i,j]);i=j}
  const cache=new Map();let checked=0;
  function evaluate(profile){
    const stats=effective(profile,data),key=[...LUCKS,...CHANCES,'RollInterval'].map(k=>stats[k]).join('|')+'|'+JSON.stringify([stats.periodic,profile.badges,profile.unlocks,profile.globalLuck]);
    if(cache.has(key))return cache.get(key);
    checked++;
    const cycles=Math.floor(settings.seconds/stats.RollInterval),mean=1+stats.DoubleRollChance+2*stats.RollTwiceChance+2*stats.TripleRollChance,cardsPerHour=mean*3600/stats.RollInterval;
    if(settings.objective==='cards'){const result={score:cardsPerHour,cardsPerHour,expectedCards:cycles*mean,stats};cache.set(key,result);return result}
    const logMiss=new Float64Array(bins);let multiCards=0;
    const bp=borderProbabilities(profile,stats),normal=new Float64Array(32),noFabled=new Float64Array(32);
    for(let mask=0;mask<32;mask++){
      let p=1,q=1;
      for(let i=0;i<5;i++){const on=mask&(1<<i),chance=bp[BORDERS[i]];p*=on?chance:1-chance;q*=i===2?(on?0:1):(on?chance:1-chance)}
      normal[mask]=p;noFabled[mask]=q;
    }
    const miss=p=>{
      if(p>=1)return 0;
      // E[(1-p)^N] for N=1 + Bernoulli(double) + 2*twice + 2*triple.
      const z=1-p;return z*(1-stats.DoubleRollChance*p)*(1-stats.RollTwiceChance*(1-z*z))*(1-stats.TripleRollChance*(1-z*z));
    };
    for(const group of periodicGroups(cycles,stats.periodic,profile.rollCounter||0)){
      const masses=new Float64Array(cards.length),plain=new Float64Array(bins),hand=new Float64Array(bins),probabilities=new Float64Array(geometry.length);
      for(const o of cardDistribution(profile,data,stats.Luck*group.mult))masses[cardIndex.get(o.card.name)]+=o.p;
      for(let i=0;i<geometry.length;i++){const o=geometry[i];probabilities[i]=masses[o.ci]*(o.fabled?normal[o.mask]:noFabled[o.mask])}
      let below=0,plainMulti=0,handMulti=0;
      for(const [i,j]of ties){
        let mass=0;for(let k=i;k<j;k++)mass+=probabilities[k];
        const factor=2*below+mass;
        for(let k=i;k<j;k++){const o=geometry[k],p=probabilities[k],h=p*factor;plain[o.bin]+=p;hand[o.bin]+=h;if(o.multi){plainMulti+=p;handMulti+=h}}
        below+=mass;
      }
      multiCards+=group.cycles*mean*((1-stats.LuckyHandChance)*plainMulti+stats.LuckyHandChance*handMulti);
      let p=0,h=0;
      for(let bin=bins-1;bin>=1;bin--){
        p+=plain[bin];h+=hand[bin];
        const m=(1-stats.LuckyHandChance)*miss(Math.min(1,p))+stats.LuckyHandChance*miss(Math.min(1,h));
        logMiss[bin]+=group.cycles*Math.log(Math.max(0,m));
      }
    }
    let bestLog=0,median=0;const curve=[];
    for(let i=1;i<bins;i++){const chance=-Math.expm1(logMiss[i]);bestLog+=STEP*chance;if(chance>=.5)median=10**(i*STEP);if(i%8===0)curve.push({rarity:10**(i*STEP),chance})}
    const result={score:settings.objective==='borders'?multiCards/settings.seconds*3600:bestLog,bestLog,typicalBest:10**bestLog,medianBest:median,cardsPerHour,expectedCards:cycles*mean,multiPerHour:multiCards/settings.seconds*3600,curve,stats};
    if(cache.size>40000)cache.clear();cache.set(key,result);return result;
  }
  return{evaluate,get checked(){return checked}};
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

function paSearch(profile,data,score){
  const length=artifactSlots(profile,data);if(!length)return profile;
  const level=artifactLevel(profile,data),candidates=data.personalArtifact.stats.filter(d=>d.id!=='PotionDurationMult').map(d=>({id:d.id,value:Math.round((d.min+(scaledMax(d,level)-d.min)*profile.artifact.quality)*10**d.decimals)/10**d.decimals,locked:false}));
  const starting=Array.from({length},(_,i)=>profile.artifact.slots[i]?.locked?clone(profile.artifact.slots[i]):{id:'',value:0,locked:false});
  let beam=[{...profile,artifact:{...profile.artifact,slots:starting}}];
  for(let i=0;i<length;i++){
    if(starting[i].locked)continue;const next=[];
    for(const p of beam)for(const slot of candidates){if(p.artifact.slots.filter(x=>x.id===slot.id).length>=2)continue;const slots=p.artifact.slots.slice();slots[i]=slot;next.push({...p,artifact:{...p.artifact,slots}})}
    next.sort((a,b)=>score(b)-score(a));beam=next.slice(0,6);
  }
  let best=bestOf([profile,...beam],score);
  for(let pass=0;pass<3;pass++){
    const next=[best],slots=best.artifact.slots;
    for(let i=0;i<length;i++)if(!slots[i].locked){
      for(const slot of candidates){if(slots.filter((x,j)=>j!==i&&x.id===slot.id).length>=2)continue;const copy=slots.slice();copy[i]=slot;next.push({...best,artifact:{...best.artifact,slots:copy}})}
      for(let j=i+1;j<length;j++)if(!slots[j].locked){const copy=slots.slice();[copy[i],copy[j]]=[copy[j],copy[i]];next.push({...best,artifact:{...best.artifact,slots:copy}})}
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
  for(const crafted of [{id:profile.build.crafted,tier:profile.build.craftedTier},...settings.crafted])for(const relics of combos){const p={...profile,build:{...profile.build,crafted:crafted.id,craftedTier:crafted.tier,relics}};if(score(p)>score(best)+1e-10)best=p}
  return best;
}
function potionSearch(profile,data,settings,score){
  let best=profile;const groups=[...new Set(settings.potions.map(id=>potionGroup(id,data)))];
  for(let pass=0;pass<2;pass++)for(const group of groups){const other=best.build.potions.filter(id=>potionGroup(id,data)!==group),candidates=[best,...['',...settings.potions.filter(id=>potionGroup(id,data)===group)].map(id=>({...best,build:{...best.build,potions:[...other,...(id?[id]:[])]}}))];best=bestOf(candidates,score)}
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
    for(let pass=0;pass<defs.reduce((n,d)=>n+d.maxLevel,0);pass++){
      const next=[],seen=new Set();
      for(const p of beam)for(const d of defs){
        if(d.id==='InfiniteBanSlots'||d.id==='PASlots'&&!settings.components.artifact||d.id==='ThirdRelicSlot'&&!settings.components.equipment)continue;
        const level=p.build[shop][d.id]||0,cost=shop==='corrupted'?corruptedCost(d,level):d.cost;
        if(level>=d.maxLevel||cost>p.build.currencies[shop])continue;
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
  const settings=optimizerSettings(s,data),evaluator=createBuildEvaluator(s,data,settings),score=p=>evaluator.evaluate(p).score,current=evaluator.evaluate(s);
  const operations={equipment:p=>equipmentSearch(p,data,settings,score),potions:p=>potionSearch(p,data,settings,score),points:p=>pointSearch(p,data,score),skills:p=>skillSearch(p,data,score),artifact:p=>paSearch(p,data,score),shops:p=>shopSearch(p,data,settings,score,s)};
  let best=s,done=0;
  // Different group orders and another pass let potion power, multipliers,
  // speed saturation, periodic relics and point allocations influence each other.
  const orders=[['potions','equipment','points','skills','artifact','shops'],['shops','artifact','skills','points','equipment','potions'],['equipment','potions','skills','points','artifact','shops']];
  for(const order of orders)for(const key of order){
    progress({phase:COMPONENTS[key],value:done++/18,checked:evaluator.checked});if(!settings.components[key])continue;
    const candidate=operations[key](best);if(score(candidate)>=score(best)-1e-10)best=candidate;
  }
  best=normalize(best,data);const result=evaluator.evaluate(best);
  if(result.score<current.score-1e-9)throw Error('Search produced an invalid recommendation. Your setup was kept.');
  const invalid=profileWarnings(best,data);if(invalid.length)throw Error(invalid.join(' '));
  best.stats=result.stats;
  const opportunities=nextUpgrades(best,data,settings,evaluator);
  const priceEstimates=data.corruptedUpgrades.filter(d=>{for(let lv=s.build.corrupted[d.id]||0;lv<(best.build.corrupted[d.id]||0);lv++)if(d.knownNextCosts[lv]==null)return true;return false}).map(d=>d.name);
  progress({phase:'Complete',value:1,checked:evaluator.checked});
  return{type:'build',profile:best,current,result,settings,opportunities,priceEstimates,checked:evaluator.checked,method:'Equipment enumeration, prerequisite packages, beam search and repeated group refinement. Approximate search.'};
}

export function nextUpgrades(profile,data,settings,evaluator=createBuildEvaluator(profile,data,settings)){
  const current=evaluator.evaluate(profile),rows=[];
  function add(label,requirement,candidate){const result=evaluator.evaluate(normalize(candidate,data));if(result.score>current.score+1e-9)rows.push({label,requirement,score:result.score,gain:settings.objective==='highest'?10**(result.score-current.score):result.score/current.score,typicalBest:result.typicalBest,cardsPerHour:result.cardsPerHour})}
  for(const shop of ['tower','corrupted','void'])for(const d of shop==='tower'?data.towerShop:shop==='void'?data.voidShop:data.corruptedUpgrades){
    const lv=profile.build[shop][d.id]||0;if(lv>=d.maxLevel)continue;
    const cost=shop==='corrupted'?corruptedCost(d,lv):d.cost;
    let candidate={...profile,build:{...profile.build,[shop]:{...profile.build[shop],[d.id]:lv+1}}};
    if(d.id==='PASlots')candidate=paSearch(normalize(candidate,data),data,p=>evaluator.evaluate(p).score);
    if(d.id==='ThirdRelicSlot')candidate=equipmentSearch(candidate,data,settings,p=>evaluator.evaluate(p).score);
    add(d.name+' '+(lv+1),`${cost} ${shop==='tower'?'gold':shop==='void'?'Void Coins':'Corrupted Coins'}${shop==='corrupted'&&d.knownNextCosts[lv]==null?' (estimated price)':''}`,candidate);
  }
  for(const set of data.indexSets)if(!profile.build.sets.includes(set.id))add(set.name,'Complete Index set',{...profile,build:{...profile.build,sets:[...profile.build.sets,set.id]}});
  for(const achievement of data.achievements)if(!profile.build.achievements.includes(achievement.id))add(achievement.name,'Earn achievement',{...profile,build:{...profile.build,achievements:[...profile.build.achievements,achievement.id]}});
  const tier=data.craftedTiers.findIndex(t=>t.id===profile.build.craftedTier);
  if(profile.build.crafted&&tier<data.craftedTiers.length-1)add(data.craftedArtifacts[profile.build.crafted].Name+' · '+data.craftedTiers[tier+1].label,'Craft higher artifact tier',{...profile,build:{...profile.build,craftedTier:data.craftedTiers[tier+1].id}});
  const rarity=data.personalArtifact.rarities.findIndex(r=>r.id===profile.artifact.rarity);
  if(rarity<data.personalArtifact.rarities.length-1)add(data.personalArtifact.rarities[rarity+1].name+' PA','Roll higher PA rarity',{...profile,artifact:{...profile.artifact,rarity:data.personalArtifact.rarities[rarity+1].id}});
  if(profile.build.skills.length<data.skillNodes.length){
    const index=(Math.floor(profile.build.index/data.indexSkillPoints.every)+1)*data.indexSkillPoints.every;
    const candidate=skillSearch({...profile,build:{...profile.build,index}},data,p=>evaluator.evaluate(p).score);
    add('Next '+data.indexSkillPoints.amount+' skill points',`Reach ${index} Card Index`,candidate);
  }
  const level=artifactLevel(profile,data);
  if(level<100){
    const rolls=Math.ceil(((level+1)/100)**(1/data.personalArtifact.levelExponent)*data.personalArtifact.rollsForMaxLevel);
    let candidate=normalize({...profile,rolls},data);
    candidate=paSearch(candidate,data,p=>evaluator.evaluate(p).score);
    add('PA level '+(level+1),`${rolls.toLocaleString('en-US')} lifetime rolls`,candidate);
  }
  return rows.sort((a,b)=>b.gain-a.gain).slice(0,10);
}
