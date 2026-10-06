import {BORDERS,effective,cardDistribution,borderProbabilities} from './core.js?v=9.1';

// sfc32 with independently mixed seed words. Two draws give a 53-bit fraction,
// so rare checks are not limited to the 1 / 2^32 resolution of the old LCG.
export function rollRandom(seed){
  let word=seed>>>0;
  const mix=()=>{word=(word+0x9e3779b9)>>>0;let z=word;z=Math.imul(z^(z>>>16),0x21f0aaad);z=Math.imul(z^(z>>>15),0x735a2d97);return(z^(z>>>15))>>>0};
  let a=mix(),b=mix(),c=mix(),d=mix();
  const next=()=>{const t=((a+b|0)+d|0)>>>0;d=d+1|0;a=b^(b>>>9);b=c+(c<<3)|0;c=(c<<21|c>>>11)+t|0;return t};
  for(let i=0;i<20;i++)next();
  return{unit53:()=>((next()>>>5)*67108864+(next()>>>6))/9007199254740992};
}

export function prepareExactRolls(s,data,seconds,{stats=effective(s,data),rows=[]}={}){
  const cache=new Map(),bp=borderProbabilities(s,stats),byName=new Map(data.cards.map((c,i)=>[c.name,i]));
  const probabilities=BORDERS.map(b=>bp[b]);
  // This is the exact distribution of the rarest-first independent checks,
  // including secret upgrades. Each card still gets its own random draw; no
  // frequencies are estimated, rounded or sampled in bulk.
  function pool(mult){
    if(!cache.has(mult)){
      const distribution=cardDistribution(s,data,stats.Luck*mult),cdf=new Float64Array(distribution.length),indices=new Uint16Array(distribution.length);let mass=0;
      for(let i=0;i<distribution.length;i++){mass+=distribution[i].p;cdf[i]=mass;indices[i]=byName.get(distribution[i].card.name)}
      cdf[cdf.length-1]=1;cache.set(mult,{cdf,indices});
    }
    return cache.get(mult);
  }
  function drawPool(selection,rng){
    const r=rng.unit53(),cdf=selection.cdf;let lo=0,hi=cdf.length-1;
    while(lo<hi){const mid=(lo+hi)>>>1;if(r<cdf[mid])hi=mid;else lo=mid+1}
    const ci=selection.indices[lo],card=data.cards[ci];let mask=0;
    if(rng.unit53()<probabilities[0])mask|=1;
    if(rng.unit53()<probabilities[1])mask|=2;
    if(card.rarityValue<=s.fabledMax&&rng.unit53()<probabilities[2])mask|=4;
    if(rng.unit53()<probabilities[3])mask|=8;
    if(rng.unit53()<probabilities[4])mask|=16;
    const index=ci*32+mask;
    if(!rows[index]){
      const borders=BORDERS.filter((_,i)=>mask&(1<<i));let rarity=card.rarityValue;
      for(const border of borders)rarity*=data.borderRarity[border];
      const boost=card.weatherLock===s.weather?(data.weather[s.weather]?.boostMultiplier||1):1,hp=Math.floor((10+rarity**.35*5)*boost);
      rows[index]={index,key:card.name+'|'+mask,name:card.name,baseRarity:card.rarityValue,rarity,borders,mask,score:hp+2*Math.floor(hp/2),hit:(s.goal.kind==='card'?card.name===s.goal.card:card.rarityValue>=s.goal.rarity)&&s.goal.borders.every(b=>borders.includes(b))};
    }
    return rows[index];
  }
  return{stats,cycles:Math.floor(seconds/stats.RollInterval),seconds,start:s.rollCounter||0,pool,drawPool,draw:(mult,rng)=>drawPool(pool(mult),rng),rows,capacity:data.cards.length*32};
}

export function simulateExactSession(prepared,seed,progress=()=>{}){
  const rng=rollRandom(seed),stats=prepared.stats,counts=new Uint32Array(prepared.capacity),comboCounts=new Uint32Array(32),periodic=stats.periodic||[],handChance=stats.LuckyHandChance,double=stats.DoubleRollChance,twice=stats.RollTwiceChance,triple=stats.TripleRollChance;let cards=0,hits=0;
  for(let i=1;i<=prepared.cycles;i++){
    let mult=1;for(let p=0;p<periodic.length;p++)if((i+prepared.start)%periodic[p].every===0)mult*=periodic[p].mult;
    const selection=prepared.pool(mult),hand=rng.unit53()<handChance;
    const count=1+(rng.unit53()<double?1:0)+(rng.unit53()<twice?2:0)+(rng.unit53()<triple?2:0);
    for(let j=0;j<count;j++){
      let row=prepared.drawPool(selection,rng);
      if(hand){const other=prepared.drawPool(selection,rng);if(other.score>row.score||other.score===row.score&&other.rarity>row.rarity)row=other}
      counts[row.index]++;cards++;if(row.hit)hits++;comboCounts[row.mask]++;
    }
    if(i%10000===0)progress(i/prepared.cycles,i);
  }
  progress(1,prepared.cycles);
  const rows=[],borderTotals=Object.fromEntries(BORDERS.map(b=>[b,0])),combos={};
  for(let i=0;i<counts.length;i++)if(counts[i]){const {index,key,score,...item}=prepared.rows[i];rows.push({...item,count:counts[i]})}
  for(let mask=0;mask<32;mask++)if(comboCounts[mask]){combos[mask]=comboCounts[mask];for(let b=0;b<5;b++)if(mask&(1<<b))borderTotals[BORDERS[b]]+=comboCounts[mask]}
  rows.sort((a,b)=>b.rarity-a.rarity);
  return{seed,cycles:prepared.cycles,seconds:prepared.seconds,cards,hits,uniqueCards:new Set(rows.map(o=>o.name)).size,borderTotals,combos,best:rows.length?{...rows[0]}:null,inventory:rows};
}
