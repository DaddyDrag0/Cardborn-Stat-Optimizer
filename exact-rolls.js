import {BORDERS,effective,eligibleCards,borderProbabilities} from './core.js?v=8';

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

export function prepareExactRolls(s,data,seconds){
  const stats=effective(s,data),cards=eligibleCards(s,data),byName=new Map(data.cards.map(c=>[c.name,c])),cache=new Map(),rows=new Map(),bp=borderProbabilities(s,stats);
  const trials=mult=>{if(!cache.has(mult))cache.set(mult,cards.map(c=>({card:c,p:1/Math.max(1,Math.ceil(c.rarityValue/(stats.Luck*s.globalLuck*mult)))})));return cache.get(mult)};
  function draw(mult,rng){
    let card=cards.at(-1);
    for(const entry of trials(mult))if(rng.unit53()<entry.p){card=entry.card;break}
    for(const skin of data.secretSkins[card.name]||[])if(rng.unit53()<1/skin.chanceDenom){card=byName.get(skin.to)||card;break}
    let mask=0;
    for(let i=0;i<BORDERS.length;i++){
      const border=BORDERS[i];
      if(border==='Fabled'&&card.rarityValue>s.fabledMax)continue;
      if(rng.unit53()<bp[border])mask|=1<<i;
    }
    const key=card.name+'|'+mask;
    if(!rows.has(key)){
      const borders=BORDERS.filter((_,i)=>mask&(1<<i));let rarity=card.rarityValue;
      for(const border of borders)rarity*=data.borderRarity[border];
      const boost=card.weatherLock===s.weather?(data.weather[s.weather]?.boostMultiplier||1):1,hp=Math.floor((10+rarity**.35*5)*boost);
      rows.set(key,{key,name:card.name,baseRarity:card.rarityValue,rarity,borders,mask,score:hp+2*Math.floor(hp/2),hit:(s.goal.kind==='card'?card.name===s.goal.card:card.rarityValue>=s.goal.rarity)&&s.goal.borders.every(b=>borders.includes(b))});
    }
    return rows.get(key);
  }
  return{stats,cycles:Math.floor(seconds/stats.RollInterval),seconds,start:s.rollCounter||0,draw};
}

export function simulateExactSession(prepared,seed,progress=()=>{}){
  const rng=rollRandom(seed),stats=prepared.stats,inventory=new Map(),borderTotals=Object.fromEntries(BORDERS.map(b=>[b,0])),combos={};let cards=0,hits=0;
  for(let i=1;i<=prepared.cycles;i++){
    const mult=(stats.periodic||[]).reduce((n,p)=>n*((i+prepared.start)%p.every===0?p.mult:1),1);
    const hand=rng.unit53()<stats.LuckyHandChance;let count=1;
    for(const [k,extra]of [['DoubleRollChance',1],['RollTwiceChance',2],['TripleRollChance',2]])if(rng.unit53()<stats[k])count+=extra;
    for(let j=0;j<count;j++){
      let row=prepared.draw(mult,rng);
      if(hand){const other=prepared.draw(mult,rng);if(other.score>row.score||other.score===row.score&&other.rarity>row.rarity)row=other}
      const old=inventory.get(row.key);if(old)old.count++;else{const {key,score,...item}=row;inventory.set(key,{...item,count:1})}
      cards++;if(row.hit)hits++;combos[row.mask]=(combos[row.mask]||0)+1;for(const border of row.borders)borderTotals[border]++;
    }
    if(i%10000===0)progress(i/prepared.cycles,i);
  }
  progress(1,prepared.cycles);
  const rows=[...inventory.values()].sort((a,b)=>b.rarity-a.rarity);
  return{seed,cycles:prepared.cycles,seconds:prepared.seconds,cards,hits,uniqueCards:new Set(rows.map(o=>o.name)).size,borderTotals,combos,best:rows.length?{...rows[0]}:null,inventory:rows};
}
