/* Public news from the local API. No synthetic article fallback. */
(() => {
  'use strict';
  const categories = [
    { id:'nasional',name:'Nasional',color:'#e7433e',description:'Kabar Indonesia dari sumber berita.' },
    { id:'dunia',name:'Dunia',color:'#5089a5',description:'Peristiwa internasional dari sumber berita.' },
    { id:'ekonomi',name:'Ekonomi',color:'#bd843c',description:'Ekonomi, bisnis, dan pergerakan pasar.' },
    { id:'teknologi',name:'Teknologi',color:'#7860ad',description:'Teknologi, sains, dan perkembangan digital.' },
    { id:'olahraga',name:'Olahraga',color:'#33856e',description:'Pertandingan, atlet, dan dunia olahraga.' },
    { id:'gaya-hidup',name:'Gaya Hidup',color:'#c46f7d',description:'Kesehatan, perjalanan, kuliner, dan keseharian.' },
    { id:'otomotif',name:'Otomotif',color:'#54799d',description:'Kendaraan, mobilitas, dan otomotif.' },
    { id:'hiburan',name:'Hiburan',color:'#b76e42',description:'Musik, film, seni, dan hiburan.' },
    { id:'opini',name:'Opini',color:'#59706d',description:'Opini dan analisis dari kolom sumber.' },
  ];
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(`kabarin:${key}`)) ?? fallback; } catch { return fallback; } };
  const articleHosts=new Set(['www.antaranews.com','antaranews.com','otomotif.antaranews.com','www.cnnindonesia.com','cnnindonesia.com','www.cnbcindonesia.com','cnbcindonesia.com']);
  const imageHosts=new Set(['img.antaranews.com','akcdn.detik.net.id','awsimages.detik.net.id','cdn.cnnindonesia.com','cdn.cnbcindonesia.com']);
  const validUrl=(value,image=false)=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&(image?imageHosts:articleHosts).has(url.hostname);}catch{return false;}};
  const validArticle=article=>article&&typeof article.id==='string'&&/^news-[a-f0-9]{16}$/.test(article.id)&&categories.some(c=>c.id===article.category)&&['title','summary','content','source','author','date'].every(key=>typeof article[key]==='string')&&article.coverage==='excerpt'&&Number.isFinite(Date.parse(article.date))&&validUrl(article.sourceUrl)&&(!article.imageUrl||validUrl(article.imageUrl,true))&&Array.isArray(article.photos)&&article.photos.every(photo=>photo&&validUrl(photo.url,true));
  function build(payload, archived = []) {
    const visits = read('reads', {});
    const current = new Set((payload.articles ?? []).map(article => article.id));
    const unique = new Map([...archived,...(payload.articles ?? [])].map(article => [article.id,article]));
    const make = article => {
      const category = categories.find(item => item.id === article.category);
      const item = { ...article, tags:[...new Set([...(article.tags??[]),category.name])], topic:category.name, role:article.authorProvided ? article.source : `Sumber: ${article.source}`, readTime:Math.max(1,Math.ceil((article.content||article.summary||'').split(/\s+/).length/220)), ageMinutes:Math.max(0,Math.floor((Date.now()-new Date(article.date).getTime())/60000)), photoCount:article.photos?.length??0 };
      Object.defineProperty(item,'views',{enumerable:true,get:()=>Math.max(0,Number(visits[item.id])||0)});
      return item;
    };
    const articles = [...unique.values()].filter(validArticle).map(make).sort((a,b)=>new Date(b.date)-new Date(a.date));
    const byId = new Map(articles.map(article=>[article.id,article]));
    const mixed = articles.filter(article=>current.has(article.id));
    const balanced = [];
    for(let index=0;index<40;index++) for(const category of categories){const article=mixed.filter(item=>item.category===category.id)[index];if(article)balanced.push(article);}
    const photoStories = mixed.filter(article=>article.isPhoto && article.photos.length).slice(0,20);
    const collections = { sorotan:balanced.slice(0,20), editor:[...balanced].sort((a,b)=>(a.source==='ANTARA News'?-1:0)-(b.source==='ANTARA News'?-1:0)).slice(0,20), lensa:photoStories, opini:mixed.filter(article=>article.category==='opini').slice(0,20) };
    Object.defineProperty(collections,'populer',{enumerable:true,get:()=>[...mixed].sort((a,b)=>b.views-a.views || a.ageMinutes-b.ageMinutes).slice(0,20)});
    const stop = new Set('yang dengan untuk dari dalam pada hingga jadi menjadi akan telah sudah bisa lebih saat oleh tentang sebagai serta antara karena setelah sebelum tanpa lewat para kini baru ini itu tak dan atau di ke si apa bagaimana kenapa mengapa hari lalu berita indonesia cnn antara cnbc cara daftar orang bagi bikin mulai mengenal foto tahun usai jadwal sinopsis hasil simak begini berikut disebut kapan'.split(' '));
    const frequencies = new Map();
    for(const article of mixed) for(const word of new Set(article.title.match(/[\p{L}][\p{L}\p{N}-]{2,}/gu)??[])){const key=word.toLocaleLowerCase('id');if(!stop.has(key))frequencies.set(key,{word,count:(frequencies.get(key)?.count??0)+1});}
    const topics = [...frequencies.values()].sort((a,b)=>b.count-a.count).slice(0,20).map(item=>item.word);
    for(const article of articles) for(const topic of topics) if(article.title.toLocaleLowerCase('id').includes(topic.toLocaleLowerCase('id'))) article.tags.push(topic);
    return { categories,articles,mixed,collections,topics,authors:[...new Set(articles.map(article=>article.author))],meta:payload.meta??{},get:id=>byId.get(id),async ensure(id,signal){
      if(byId.has(id))return byId.get(id);if(!/^news-[a-f0-9]{16}$/.test(id??''))return null;
      if(location.protocol==='file:')return null;
      try{const response=await fetch(`api/news.php?ids=${id}`,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000)});if(!response.ok)return null;const raw=(await response.json()).articles.find(article=>article.id===id);if(!validArticle(raw))return null;const article=make(raw);byId.set(id,article);articles.push(article);return article;}catch{return null;}
    },persistSaved(ids){
      if(ids.length>500)throw new Error('Maksimal 500 berita tersimpan di browser ini.');
      const snapshots=ids.map(id=>byId.get(id)).filter(Boolean).map(item=>{const{views,ageMinutes,role,readTime,photoCount,topic,...raw}=item;return raw;});
      let previous=null;try{previous=localStorage.getItem('kabarin:saved-articles');localStorage.setItem('kabarin:saved-articles',JSON.stringify(snapshots));localStorage.setItem('kabarin:saved',JSON.stringify(ids));}
      catch{try{if(previous===null)localStorage.removeItem('kabarin:saved-articles');else localStorage.setItem('kabarin:saved-articles',previous);}catch{}throw new Error('Penyimpanan browser penuh atau tidak tersedia.');}
    },recordView(id){if(!byId.has(id))return;visits[id]=(Number(visits[id])||0)+1;try{localStorage.setItem('kabarin:reads',JSON.stringify(visits));}catch{}},unavailable:!mixed.length };
  }
  window.buildKabarinData = build;
  const saved=read('saved',[]);const rawArchive=read('saved-articles',[]);
  const localArchive=Array.isArray(rawArchive)?rawArchive.filter(article=>validArticle(article)&&Array.isArray(saved)&&saved.includes(article.id)).slice(0,500):[];
  const snapshot=window.KABARIN_NEWS_SNAPSHOT;
  if(Array.isArray(snapshot?.articles)&&snapshot.articles.some(validArticle)){
    window.KABARIN=build({...snapshot,meta:{...snapshot.meta,stale:true,origin:'bundled-snapshot'}},localArchive);
  }
  // Render the actual bundled news immediately. Refresh in the background, retaining
  // the same model object so the portal and PageSquire handlers keep valid references.
  window.KABARIN_REFRESH = (async()=>{
    if(location.protocol==='file:'){
      window.KABARIN??=build({articles:[],meta:{unavailable:true}},localArchive);
      return window.KABARIN;
    }
    try {
      const response = await fetch('api/news.php',{credentials:'same-origin',signal:AbortSignal.timeout(35000)});
      const payload = await response.json();
      if(!response.ok || !Array.isArray(payload.articles) || !payload.articles.length)throw new Error('NEWS_UNAVAILABLE');
      const known = new Set(payload.articles.map(article=>article.id));
      const routeId = /^#artikel\/(news-[a-f0-9]{16})$/.exec(location.hash)?.[1];
      const missing = [...new Set([...(Array.isArray(saved)?saved:[]),routeId].filter(id=>/^news-[a-f0-9]{16}$/.test(id??'')&&!known.has(id)))];
      const archived=[...(window.KABARIN?.articles??[]),...localArchive];
      for(let index=0;index<missing.length;index+=100){try{const extra=await fetch(`api/news.php?ids=${missing.slice(index,index+100).join(',')}`,{signal:AbortSignal.timeout(8000)});if(extra.ok)archived.push(...(await extra.json()).articles);}catch{/* Keep unavailable saved IDs for a later retry. */}}
      const next=build(payload,archived);
      if(!next.mixed.length)throw new Error('NEWS_UNAVAILABLE');
      if(window.KABARIN)Object.assign(window.KABARIN,next);else window.KABARIN=next;
      if(typeof CustomEvent==='function')window.dispatchEvent?.(new CustomEvent('kabarin:news-updated'));
    } catch { window.KABARIN??=build({articles:[],meta:{unavailable:true}},localArchive); }
    return window.KABARIN;
  })();
  window.KABARIN_READY=window.KABARIN?Promise.resolve(window.KABARIN):window.KABARIN_REFRESH;
})();
