export function encodeState(value){return btoa(unescape(encodeURIComponent(JSON.stringify(value))))}
export function decodeState(value){try{if(!value||value.length>12000)return null;const state=JSON.parse(decodeURIComponent(escape(atob(value))));return state&&typeof state==='object'&&!Array.isArray(state)?state:null}catch{return null}}
export function shareUrl(state){const url=new URL(location.href);url.search='';url.searchParams.set('state',encodeState(state));return url.toString()}
