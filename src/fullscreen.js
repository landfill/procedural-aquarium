// Keep the original canvas and controls together, so tool state and handlers
// survive native fullscreen, Escape, and embedded-browser fallback mode.
export function setupFullscreen(player,button){
  let expanded=false,nativeActive=false;
  function setExpanded(value){
    expanded=value;
    player.classList.toggle('is-expanded',value);
    document.body.classList.toggle('aquarium-expanded',value);
    button.setAttribute('aria-pressed',String(value));
    button.setAttribute('aria-label',value?'전체 화면 나가기':'어항 전체 화면');
    button.title=value?'전체 화면 나가기 (Esc)':'어항 전체 화면';
    if(!value)button.focus({preventScroll:true});
  }
  button.onclick=async()=>{
    if(expanded){
      if(document.fullscreenElement===player){
        try{await document.exitFullscreen();}catch{return;}
      }
      setExpanded(false);return;
    }
    setExpanded(true);
    // Some app webviews prohibit the Fullscreen API. The viewport-sized CSS
    // mode still exposes the entire tank and both control rows in that case.
    if(document.fullscreenEnabled&&player.requestFullscreen){
      try{await player.requestFullscreen();}catch{/* Keep CSS expansion. */}
    }
  };
  document.addEventListener('fullscreenchange',()=>{
    if(document.fullscreenElement===player){nativeActive=true;setExpanded(true);}
    else if(nativeActive){nativeActive=false;setExpanded(false);}
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&expanded&&!document.fullscreenElement){event.preventDefault();setExpanded(false);}
  });
}
