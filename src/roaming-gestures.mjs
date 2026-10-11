/**
 * Cancel browser zoom only on the roaming UI. OSD is outside this root and
 * continues to receive its own pinch events; single-finger UI scrolling remains.
 * @param {EventTarget} root
 * @param {()=>boolean} isRoaming
 */
export function installRoamingZoomGuard(root,isRoaming){
 const controller=new AbortController();
 const options={capture:true,passive:false,signal:controller.signal};
 const cancelGesture=event=>{if(isRoaming()&&event.cancelable)event.preventDefault();};
 const cancelMultiTouch=event=>{if(event.touches.length>1)cancelGesture(event);};
 for(const type of ['touchstart','touchmove'])root.addEventListener(type,cancelMultiTouch,options);
 // Safari's native pinch events and desktop trackpad pinch fallback.
 for(const type of ['gesturestart','gesturechange'])root.addEventListener(type,cancelGesture,options);
 root.addEventListener('wheel',event=>{if(event.ctrlKey)cancelGesture(event);},options);
 return ()=>controller.abort();
}
