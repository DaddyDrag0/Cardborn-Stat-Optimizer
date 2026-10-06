import {evaluate} from './core.js?v=9.5';
import {createBuildEvaluator} from './optimizer.js?v=9.5';
import {towerSessionPlan} from './tower-simulation.js?v=9.5';
const cache=new Map();
export function evaluateTarget(s,data){
  const key=JSON.stringify(s);let byProfile=cache.get(data);if(!byProfile){byProfile=new Map();cache.set(data,byProfile)}
  if(byProfile.has(key))return byProfile.get(key);
  let result=evaluate(s,data);
  if(!s.simulation?.tower){
    const hour=s.minutes===60?result:evaluate({...s,minutes:60},data);
    result={...result,hitsPerHour:hour.expectedHits,cardsPerHour:hour.expectedCards,probability:hour.expectedCards?hour.expectedHits/hour.expectedCards:0};
  }
  if(s.simulation?.tower&&s.build){
    try{towerSessionPlan(s.build,3600)}catch(error){return{...result,towerError:error.message}}
    const settings={objective:'hits',rarity:s.goal.kind==='card'?1:s.goal.rarity,targetCard:s.goal.kind==='card'?s.goal.card:null,baseRarity:s.goal.kind==='rarity',requiredBorders:s.goal.borders,tower:true,allowUnavailable:true};
    const forecast=seconds=>createBuildEvaluator(s,data,{...settings,seconds},{exactTower:true}).evaluate(s);
    const hour=forecast(3600),session=s.minutes===60?hour:forecast(s.minutes*60),firstDraw=Math.min(hour.stats.RollInterval,s.build.dungeonSeconds/s.build.floor);
    const hazard=Number.isFinite(hour.logMiss)?-hour.logMiss/3600:hour.expectedHits/3600,wait=p=>hazard>0?Math.max(firstDraw,-Math.log1p(-p)/hazard):Infinity;
    result={...result,stats:hour.stats,probability:hour.expectedCards?hour.expectedHits/hour.expectedCards:0,cardsPerHour:hour.expectedCards,hitsPerHour:hour.expectedHits,averageSeconds:hour.expectedHits>0?Math.max(firstDraw,3600/hour.expectedHits):Infinity,averageCards:hour.expectedHits>0?hour.expectedCards/hour.expectedHits:Infinity,chance:session.chance,medianSeconds:wait(.5),p90Seconds:wait(.9),expectedCards:session.expectedCards,expectedHits:session.expectedHits,normalHits:session.normalHits,towerHits:session.towerHits,tower:true};
  }
  if(byProfile.size>2)byProfile.clear();byProfile.set(key,result);return result;
}
