const CACHE_KEY='atlas-scu-bootstrap-cache-v1';
const CACHE_TTL=120000;
const nativeFetch=window.fetch.bind(window);

function readCache(){
  try{
    const parsed=JSON.parse(sessionStorage.getItem(CACHE_KEY)||'null');
    if(!parsed?.savedAt||!parsed?.data) return null;
    if(Date.now()-parsed.savedAt>CACHE_TTL) return null;
    return parsed.data;
  }catch{return null;}
}
function saveCache(data){
  try{sessionStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),data}));}catch{}
  window.__ATLAS_BOOTSTRAP__=data;
  window.dispatchEvent(new CustomEvent('atlas:bootstrap',{detail:data}));
}
function clearCache(){
  try{sessionStorage.removeItem(CACHE_KEY);}catch{}
  window.__ATLAS_BOOTSTRAP__=null;
}
window.__ATLAS_CLEAR_BOOTSTRAP_CACHE__=clearCache;

const cached=readCache();
if(cached) window.__ATLAS_BOOTSTRAP__=cached;

window.fetch=async function(input,init={}){
  let action='';
  try{action=JSON.parse(init?.body||'{}')?.action||'';}catch{}

  if(action==='bootstrap'){
    const hit=readCache();
    if(hit){
      queueMicrotask(()=>window.dispatchEvent(new CustomEvent('atlas:bootstrap',{detail:hit})));
      return new Response(JSON.stringify(hit),{status:200,headers:{'Content-Type':'application/json'}});
    }
  }

  const response=await nativeFetch(input,init);
  if(action==='bootstrap'&&response.ok){
    response.clone().text().then(raw=>{
      try{const data=JSON.parse(raw);if(data?.ok) saveCache(data);}catch{}
    });
  }else if(/^(save|delete)/i.test(action)){
    clearCache();
  }
  return response;
};

document.addEventListener('click',e=>{
  if(e.target.closest('#refreshButton')) clearCache();
},true);

if(location.hash==='#olp') history.replaceState(null,'','#dashboard');
