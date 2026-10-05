// Matches PersonalArtifactUI's stat and Max display. Void Artifact Resonance
// affects crafted artifacts, not Personal Artifact values.
const rarity=(s,data)=>data.personalArtifact.rarities.find(r=>r.id===s.artifact.rarity)?.statMultiplier||1;
const percent=def=>def.kind==='chance'||def.kind==='potion';
export function paGameValue(s,def,raw,data){const factor=rarity(s,data),value=def.kind==='mult'?1+(raw-1)*factor:raw*factor;return value*(percent(def)?100:1)}
export function paRawValue(s,def,shown,data){const factor=rarity(s,data),value=shown/(percent(def)?100:1);return def.kind==='mult'?1+(value-1)/factor:value/factor}
export function paDisplayValue(s,def,raw,data){const decimals=percent(def)?1:def.kind==='mult'||def.id==='RollSpeed'?3:Math.min(def.decimals,2),scale=10**decimals;return Math.floor(paGameValue(s,def,raw,data)*scale+.5)/scale}
export const paUnit=def=>!def?'':percent(def)?' (%)':def.kind==='mult'?' (×)':def.id==='RollSpeed'?' (s)':'';
