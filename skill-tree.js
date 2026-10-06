import {skillCost,skillBudget} from './build.js?v=9.7';

export const SKILL_BRANCHES=['Fortune','Velocity','Radiance','Mythos','Corrupted','Alchemy'];
export function skillTreePositions(data){
  const positions=new Map();
  for(const [j,branch]of SKILL_BRANCHES.entries()){
    const nodes=data.skillNodes.filter(n=>n.branch===branch),paths=[...new Set(nodes.filter(n=>!['Core','Mastery'].includes(n.path)).map(n=>n.path))],x=110+j*175;
    nodes.filter(n=>n.path==='Core').forEach((n,i)=>positions.set(n.id,{x,y:760-i*75}));
    paths.forEach((path,k)=>nodes.filter(n=>n.path===path).forEach((n,i)=>positions.set(n.id,{x:x+(k===0?-42:42),y:510-i*75})));
    for(const n of nodes.filter(n=>n.path==='Mastery'))positions.set(n.id,{x,y:170});
  }
  data.skillNodes.filter(n=>n.branch==='Grandmastery').forEach((n,i)=>positions.set(n.id,{x:500+i*100,y:95}));
  data.skillNodes.filter(n=>n.branch==='Transcendence').forEach((n,i)=>positions.set(n.id,{x:220+i*110,y:35}));
  return positions;
}
const esc=x=>String(x).replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k]));
export function skillTreeComparison(original,optimized,data){
  const before=new Set(original.build.skills),after=new Set(optimized.build.skills),positions=skillTreePositions(data),nodes=data.skillNodes.filter(n=>positions.has(n.id)),stars=data.skillNodes.filter(n=>n.branch==='Constellations');
  const state=id=>before.has(id)===after.has(id)?'':after.has(id)?'added':'removed';
  function column(profile,owned,label){
    const attributes=n=>`data-compare-skill="${esc(n.id)}" data-compare-owned="${owned.has(n.id)}" data-compare-side="${label}" data-compare-change="${state(n.id)}" tabindex="0" aria-label="${esc(n.name)}: ${owned.has(n.id)?'Owned':'Unowned'}${state(n.id)?', '+(state(n.id)==='added'?'recommended addition':'recommended removal'):''}; ${esc(n.desc)}; ${n.cost} SP"`;
    return `<article class="tree-comparison-card" data-compare-build="${label.toLowerCase()}"><div class="section-heading"><h3>${label}</h3><div class="comparison-tree-tools"><span class="badge">${skillCost(profile.build.skills,data)} / ${skillBudget(profile.build,data)} SP</span><button data-compare-zoom aria-expanded="false">Enlarge tree</button></div></div><div class="comparison-tree-view"><svg class="comparison-tree" viewBox="0 0 1120 855" role="group" aria-label="${label} skill tree">${nodes.flatMap(n=>n.requires.filter(r=>positions.has(r)).map(r=>`<line x1="${positions.get(r).x}" y1="${positions.get(r).y}" x2="${positions.get(n.id).x}" y2="${positions.get(n.id).y}" class="${owned.has(n.id)?'owned':''}"/>`)).join('')}${SKILL_BRANCHES.map((g,i)=>`<text x="${110+i*175}" y="825" class="branch-label">${g}</text>`).join('')}${nodes.map(n=>{const p=positions.get(n.id),change=state(n.id);return `<g ${attributes(n)} class="comparison-node ${owned.has(n.id)?'owned':''} ${change}" transform="translate(${p.x},${p.y})"><circle class="node-hit" r="30"/><circle class="node-dot" r="19"/><text>${owned.has(n.id)?'✓':n.cost}</text>${change?`<text class="node-change" x="24" y="-20">${change==='added'?'+':'−'}</text>`:''}</g>`}).join('')}</svg></div><h4>Constellations</h4><div class="comparison-constellations">${['star1','star2','star3'].map((group,i)=>`<div><h5>${['Normal','Greater','Ascendant'][i]} <small>${stars.filter(n=>n.limitGroup===group&&owned.has(n.id)).length}/${i===0?2:1}</small></h5>${stars.filter(n=>n.limitGroup===group).map(n=>`<div ${attributes(n)} class="comparison-star ${owned.has(n.id)?'owned':''} ${state(n.id)}"><span aria-hidden="true">${owned.has(n.id)?'★':'☆'}</span><b>${esc(n.name.replace(/ (Normal|Greater|Ascendant) star$/,''))}</b>${state(n.id)?`<strong aria-hidden="true">${state(n.id)==='added'?'+':'−'}</strong>`:''}</div>`).join('')}</div>`).join('')}</div></article>`;
  }
  return `<section class="tree-comparison"><h3>Skill tree · before &amp; after</h3><p class="tree-comparison-legend"><span class="owned">● Owned</span><span class="added">+ Add</span><span class="removed">− Remove</span><small>Hover, tap or focus a node for its ability.</small></p><div class="tree-comparison-grid">${column(original,before,'Current')}${column(optimized,after,'Recommended')}</div></section>`;
}
