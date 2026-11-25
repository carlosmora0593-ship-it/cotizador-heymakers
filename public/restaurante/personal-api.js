/* Sesiones de personal: el servidor decide cuenta, rol y operaciones. */
(function(){
  'use strict';
  const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const missing=e=>e&&(/PGRST202|42883/.test(e.code||'')||/function.*not.*found/i.test(e.message||''));
  function device(user,account){const k='nuvoor_personal_device_'+user+'_'+account;let id=localStorage.getItem(k);if(!id){id=crypto.randomUUID();localStorage.setItem(k,id);}return id;}
  function portal(account){const u=new URL('./personal.html',location.href);if(account)u.searchParams.set('cuenta',account);location.replace(u.href);}
  async function boot(raw,session,requested){
    const r=await raw.rpc('rest_personal_mis_negocios');
    if(r.error){if(missing(r.error))return null;throw r.error;}
    const list=(r.data||[]).filter(p=>!p.producto||p.producto==='restaurant');
    if(!list.length)return null;
    // Un miembro del negocio conserva la aplicación y permisos anteriores.
    const members=await raw.from('mis_empresas').select('*');
    const own=!members.error&&Array.isArray(members.data)?members.data:[];
    if(requested&&own.some(x=>String(x.id||x.cuenta_id)===requested&&x.rol==='admin'))return null;
    if(!requested&&own.some(x=>x.producto==='restaurant'&&x.activa&&(x.rol==='admin'||!list.some(p=>p.cuenta===String(x.id||x.cuenta_id)))))return null;
    const ctx=requested?list.find(x=>x.cuenta===requested):list.length===1?list[0]:null;
    if(!ctx){portal();return {redireccion:true};}
    const aparato=device(session.user.id,ctx.cuenta);
    const lease=await raw.rpc('rest_personal_sesion',{p_cuenta:ctx.cuenta,p_aparato:aparato});
    if(lease.error){portal(ctx.cuenta);return {redireccion:true};}
    const account={accountId:ctx.cuenta,accountName:ctx.negocio,userId:session.user.id,productos:['restaurant'],producto:'restaurant',activa:true,personal:ctx,actualizado:new Date().toISOString()};
    return {account,client:facade(raw,ctx,aparato),ctx,device:aparato};
  }
  function facade(raw,ctx,aparato){
    let cache=[],loaded=0,loading=null,cursor=null;const subscriptions=new Set();
    const fail=e=>{if(e?.hint==='PIN_REQUERIDO'||e?.code==='42501'&&/^Tu (acceso a este negocio|perfil ya no)/.test(e.message||''))portal(ctx.cuenta);return {data:null,error:e};};
    async function rows(force){
      if(!force&&Date.now()-loaded<1200)return cache;
      if(loading)return loading;
      loading=(async()=>{const args={p_cuenta:ctx.cuenta,p_aparato:aparato};if(cursor)args.p_desde=new Date(Math.max(0,Date.parse(cursor)-1000)).toISOString();const r=await raw.rpc('rest_personal_documentos',args);if(r.error){fail(r.error);throw r.error;}const merged=new Map(cache.map(d=>[d.coleccion+'/'+d.doc_id,d]));for(const d of r.data||[]){const k=d.coleccion+'/'+d.doc_id,old=merged.get(k);if(!old||old.actualizado<=d.actualizado)merged.set(k,d);if(d.actualizado&&(!cursor||d.actualizado>cursor))cursor=d.actualizado;}cache=[...merged.values()];loaded=Date.now();return cache;})().finally(()=>loading=null);
      return loading;
    }
    class Query{
      constructor(table){this.table=table;this.filters=[];this.one=false;this.limitN=5000;this.write=null;}
      select(){return this;}eq(k,v){this.filters.push(d=>String(d[k])===String(v));return this;}
      like(k,v){const re=new RegExp('^'+String(v).replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/%/g,'.*').replace(/_/g,'.')+'$');this.filters.push(d=>re.test(d[k]));return this;}
      gt(k,v){this.filters.push(d=>d[k]>v);return this;}in(k,v){this.filters.push(d=>v.includes(d[k]));return this;}
      order(k,opt){this.orderKey=k;this.asc=opt?.ascending!==false;return this;}limit(n){this.limitN=n;return this;}
      maybeSingle(){this.one=true;return this;}single(){this.one=true;return this;}
      upsert(v){this.write=Array.isArray(v)?v:[v];return this;}
      async run(){try{
        if(this.table!=='documentos')return fail({code:'42501',message:'Tu perfil no puede consultar esta sección.'});
        let data;
        if(this.write){const r=await raw.rpc('rest_personal_guardar',{p_cuenta:ctx.cuenta,p_aparato:aparato,p_filas:this.write});if(r.error)return fail(r.error);data=r.data||[];loaded=0;}
        else data=(await rows(false)).filter(d=>this.filters.every(fn=>fn(d)));
        if(this.orderKey)data.sort((a,b)=>(a[this.orderKey]>b[this.orderKey]?1:-1)*(this.asc?1:-1));
        data=data.slice(0,this.limitN);return {data:this.one?(data[0]||null):data,error:null};
      }catch(e){return fail(e);}}
      then(resolve,reject){return this.run().then(resolve,reject);}
    }
    function channel(){
      let timer=null,busy=false,seen=new Map();const callbacks=[];
      const ch={on(_event,_filter,callback){callbacks.push(callback);return ch;},subscribe(status){
        const poll=async()=>{if(busy||!navigator.onLine)return;busy=true;try{const fresh=await rows(true);const next=new Map();for(const row of fresh){const key=row.coleccion+'/'+row.doc_id;next.set(key,row.actualizado);if(seen.get(key)!==row.actualizado)callbacks.forEach(cb=>cb({eventType:'UPDATE',new:row}));}seen=next;}catch(_e){}finally{busy=false;}};
        timer=setInterval(poll,2500);poll();status?.('SUBSCRIBED');subscriptions.add(ch);return ch;
      },unsubscribe(){clearInterval(timer);subscriptions.delete(ch);return Promise.resolve('ok');}};return ch;
    }
    const client={auth:raw.auth,storage:raw.storage,functions:raw.functions,from:t=>new Query(t),channel,removeChannel:ch=>ch.unsubscribe(),
      async rpc(name,args={}){
        if(/^nuvoor_rest_[a-z_]+_disponible$/.test(name))return raw.rpc(name,args);
        const r=await raw.rpc('rest_personal_rpc',{p_cuenta:ctx.cuenta,p_aparato:aparato,p_nombre:name,p_args:args});if(r.error)return fail(r.error);if(r.data?._personalError)return fail({message:r.data._personalError,code:'42501'});loaded=0;return r;
      }};
    client.personal={ctx,device:aparato,raw,async pin(pin){return raw.rpc('rest_personal_pin',{p_cuenta:ctx.cuenta,p_aparato:aparato,p_pin:pin});},async cancelar(obj,solicitud,pin){
      const r=await raw.rpc('rest_personal_cancelar',{p_cuenta:ctx.cuenta,p_aparato:aparato,p_solicitud:solicitud,p_objetivo:obj,p_pin:pin||''});loaded=0;return r;
    }};
    return client;
  }
  window.NuvoorPersonal={boot,device,portal,missing,UUID};
})();
