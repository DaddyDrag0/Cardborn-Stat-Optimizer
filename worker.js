import {optimizePoints,optimizeArtifact,normalize} from './core.js?v=6';
self.onmessage=e=>{const {id,type,profile,data}=e.data;try{const s=normalize(profile,data),run=type==='points'?optimizePoints:optimizeArtifact;const result=run(s,data,value=>postMessage({id,type:'progress',value}));postMessage({id,type:'result',result})}catch(error){postMessage({id,type:'error',message:error.message})}};
