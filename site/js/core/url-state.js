export function encodeState(value){return btoa(unescape(encodeURIComponent(JSON.stringify(value))))}
export function decodeState(value){try{return JSON.parse(decodeURIComponent(escape(atob(value))))}catch{return null}}
export function shareUrl(state){const url=new URL(location.href);url.search='';url.searchParams.set('state',encodeState(state));return url.toString()}
