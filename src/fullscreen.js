// Keep the original canvas and controls together, so tool state and handlers
// survive native fullscreen, Escape, and embedded-browser fallback mode.
export function setupFullscreen(player,button){
  let expanded=false,nativeActive=false;
  const light=player.querySelector('#light'),water=player.querySelector('.water-controls');
  const lightSlot=document.createComment('light control home'),waterSlot=document.createComment('water controls home');
  light.before(lightSlot);water.before(waterSlot);
  const hud=document.createElement('div');hud.className='fullscreen-hud';
  const settings=document.createElement('details');settings.className='fullscreen-settings';
  const summary=document.createElement('summary');summary.textContent='물결 조절';summary.setAttribute('aria-label','물결과 빛 반사 조절 열기');
  settings.append(summary);hud.append(settings);player.append(hud);
  for(const [id,title] of [['feed','먹이 주기 (F)'],['clean','물 갈아주기 · 20 코인'],['decorate','원하는 위치에 수초 심기 · 40 코인']])player.querySelector('#'+id).title=title;
  function setExpanded(value){
    expanded=value;
    player.classList.toggle('is-expanded',value);
    document.body.classList.toggle('aquarium-expanded',value);
    button.setAttribute('aria-pressed',String(value));
    button.setAttribute('aria-label',value?'전체 화면 나가기':'어항 전체 화면');
    button.title=value?'전체 화면 나가기 (Esc)':'어항 전체 화면';
    if(value){hud.prepend(light);settings.append(water);}
    else{lightSlot.after(light);waterSlot.after(water);settings.open=false;}
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
