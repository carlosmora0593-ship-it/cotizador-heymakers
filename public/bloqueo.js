(function(){
  'use strict';
  let reloj=null;
  function pinta(){
    const h=document.querySelector('#nvLockHora'),f=document.querySelector('#nvLockFecha');if(!h||!f)return;
    const ahora=new Date();
    h.textContent=new Intl.DateTimeFormat('es-MX',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).format(ahora).replace(/\s+/g,' ').replace(/a\. m\./,'a.m.').replace(/p\. m\./,'p.m.');
    h.dateTime=ahora.toISOString();
    f.textContent=new Intl.DateTimeFormat('es-MX',{weekday:'long',day:'numeric',month:'long'}).format(ahora);
  }
  function activa(abierto){clearInterval(reloj);reloj=null;if(abierto&&!document.hidden){pinta();reloj=setInterval(pinta,1000);}}
  window.NuvoorBloqueo={activa};
  document.addEventListener('visibilitychange',()=>activa(!document.querySelector('#acceso')?.hidden));
})();
