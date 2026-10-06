const gcd=(a,b)=>b?gcd(b,a%b):a;

// Periodic effects share the same roll-cycle counter. Count their intersections
// rather than treating each boost as an independent random event.
export function periodicGroups(cycles,periodic=[],start=0){
  cycles=Math.max(0,Math.floor(cycles));start=Math.max(0,Math.floor(start));
  const count=periodic.length,groups=[];
  const multiples=mask=>{
    let period=1;
    for(let i=0;i<count;i++)if(mask&(1<<i))period=period/gcd(period,periodic[i].every)*periodic[i].every;
    return Math.floor((start+cycles)/period)-Math.floor(start/period);
  };
  for(let mask=0;mask<(1<<count);mask++){
    let amount=0,mult=1;
    for(let i=0;i<count;i++)if(mask&(1<<i))mult*=periodic[i].mult;
    const rest=((1<<count)-1)^mask;
    for(let sub=rest;;sub=(sub-1)&rest){
      const bits=sub.toString(2).replace(/0/g,'').length;
      amount+=(bits%2?-1:1)*multiples(mask|sub);
      if(!sub)break;
    }
    if(amount>0)groups.push({cycles:amount,mult});
  }
  return groups;
}

export function sessionChance(cycles,periodic,probability,start=0){
  let logMiss=0;
  for(const group of periodicGroups(cycles,periodic,start)){
    const p=probability(group.mult);
    if(p>=1)return 1;
    logMiss+=group.cycles*Math.log1p(-p);
  }
  return Math.max(0,-Math.expm1(logMiss));
}

export function chanceByCycles(target,periodic,probability,start=0){
  const reached=cycles=>sessionChance(cycles,periodic,probability,start)>=target;
  let hi=1;
  while(!reached(hi)&&hi<Number.MAX_SAFE_INTEGER)hi=Math.min(Number.MAX_SAFE_INTEGER,hi*2);
  if(!reached(hi)){
    // At astronomical waits the counter phase is negligible, and doubles can
    // no longer represent individual cycles. Preserve a finite ETA.
    let period=1;
    for(const effect of periodic)period=period/gcd(period,effect.every)*effect.every;
    let logMiss=0;
    for(const group of periodicGroups(period,periodic))logMiss+=group.cycles*Math.log1p(-probability(group.mult))/period;
    return logMiss<0?Math.ceil(Math.log1p(-target)/logMiss):Infinity;
  }
  let lo=0;
  while(hi-lo>1){const mid=lo+Math.floor((hi-lo)/2);if(reached(mid))hi=mid;else lo=mid}
  return hi;
}
