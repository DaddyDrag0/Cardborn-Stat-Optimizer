import {optimizeBuild} from './optimizer.js?v=9.6';
self.onmessage=e=>{const {id,profile,data}=e.data;try{const result=optimizeBuild(profile,data,value=>postMessage({id,type:'progress',value}));postMessage({id,type:'result',result})}catch(error){postMessage({id,type:'error',message:error.message})}};
