// The information dialog lives inside #app. Never make its ancestor inert.
export function setOverlayInteractivity(app,blocked){
 app.inert=false;
 for(const element of app.querySelectorAll('#gallery,.topbar,.joystick,#enter-gallery'))element.inert=blocked;
}
