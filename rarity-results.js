export const RARITY_THRESHOLDS=[1e13,1e14,1e15,1e16,1e17,1e18,1e20,1e21,1e22,1e23,1e24,1e25,1e26,1e27,1e28,1e29,1e30];
export function matchesBorderTarget(borders,settings){
  const selected=settings.borders??['Shiny','Awakened'];
  return selected.length>0&&selected.every(border=>borders.includes(border))&&(settings.match!=='exact'||borders.length===selected.length);
}
export function rarityResults(runs,thresholds=RARITY_THRESHOLDS){
  return thresholds.map(rarity=>{const counts=runs.map(run=>run.inventory.reduce((n,row)=>n+(row.rarity>=rarity?row.count:0),0)),total=counts.reduce((a,b)=>a+b,0);return{rarity,total,average:runs.length?total/runs.length:0,chance:runs.length?counts.filter(n=>n>0).length/runs.length:0}});
}
export function simulationMetric(run,settings){
  if(settings.objective==='hits')return run.inventory.reduce((n,row)=>n+(row.rarity>=settings.rarity?row.count:0),0);
  if(settings.objective==='cards')return run.cards/run.seconds*3600;
  if(settings.objective==='borders')return run.inventory.reduce((n,row)=>n+(matchesBorderTarget(row.borders,settings)?row.count:0),0);
  return Math.log10(Math.max(1,run.best?.rarity||1));
}
export function pairedSimulationSummary(current,optimized,settings){
  if(current.length!==optimized.length||!current.length)throw Error('Simulation comparison needs matching nonempty runs.');
  const a=current.map(run=>simulationMetric(run,settings)),b=optimized.map(run=>simulationMetric(run,settings)),mean=values=>values.reduce((n,v)=>n+v,0)/values.length;
  const summary=values=>{const average=mean(values),variance=values.length>1?values.reduce((n,v)=>n+(v-average)**2,0)/(values.length-1):0;return{mean:average,error95:1.96*Math.sqrt(variance/values.length)}};
  return{runs:current.length,current:summary(a),optimized:summary(b),difference:summary(a.map((v,i)=>b[i]-v))};
}
