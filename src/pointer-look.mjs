// Native pointer lock keeps the interaction point at the centre and allows unlimited mouse travel.
export function installPointerLook(canvas, {onMove, onClick, onChange, onError}, enabled = true) {
  const doc = canvas.ownerDocument, win = doc.defaultView;
  const abort = new AbortController(), options = {signal: abort.signal};
  let suspended = false, skipClick = false, requesting = false;
  const locked = () => doc.pointerLockElement === canvas;
  const notify = () => onChange(locked(), enabled);
  const unlock = () => {if (locked()) doc.exitPointerLock();};
  const failure = error => {requesting = false; onError(error); notify();};
  const lock = () => {
    if (suspended || locked() || requesting) return;
    enabled = true; requesting = true;
    try {
      if (!canvas.requestPointerLock) {failure(new Error('Pointer Lock API unavailable')); return;}
      canvas.requestPointerLock()?.catch(failure);
    } catch (error) {failure(error);}
  };
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') {
      const changed = enabled; enabled = false; skipClick = false;
      if (locked()) unlock(); else if (changed) notify();
      return;
    }
    enabled = true;
    if (e.button === 0 && !locked() && !suspended) {skipClick = true; lock();}
  }, options);
  canvas.addEventListener('click', e => {
    if (skipClick) {skipClick = false; return;}
    if (e.button === 0 && locked() && !suspended) onClick();
  }, options);
  doc.addEventListener('mousemove', e => {
    if (locked() && !suspended && (e.movementX || e.movementY)) onMove(e.movementX, e.movementY);
  }, options);
  doc.addEventListener('pointerlockchange', () => {requesting = false; notify();}, options);
  doc.addEventListener('pointerlockerror', failure, options);
  doc.addEventListener('keydown', e => {if (e.code === 'Escape') unlock();}, options);
  win.addEventListener('blur', unlock, options);
  doc.addEventListener('visibilitychange', () => {if (doc.hidden) unlock();}, options);
  notify();
  return {
    get enabled() {return enabled;},
    get locked() {return locked();},
    get paused() {return enabled && !locked();},
    lock,
    // Called synchronously from a panel's close click; touch mode never acquires a mouse lock.
    resume() {if (enabled && !suspended) lock();},
    suspend(value) {suspended = value; if (value) unlock();},
    dispose() {abort.abort(); unlock();},
  };
}
