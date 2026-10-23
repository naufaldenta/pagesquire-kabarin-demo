// Owner-defined intent resolver, equivalent to the existing Laragon adapter.
export const categories={nasional:'Nasional',dunia:'Dunia',ekonomi:'Ekonomi',teknologi:'Teknologi',olahraga:'Olahraga','gaya-hidup':'Gaya Hidup',otomotif:'Otomotif',hiburan:'Hiburan',opini:'Opini'};
const collections={editor:['pilihan editor','editor'],populer:['terpopuler','paling populer','paling banyak dibaca','populer'],lensa:['lensa kabarin','lensa','cerita foto','galeri foto'],sorotan:['sorotan','headline']};
export const normalize=value=>String(value).toLocaleLowerCase('id').replace(/\bbuka\s+kan\b/gu,'bukakan').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const has=(text,pattern)=>new RegExp(`\\b(?:${pattern})\\b`,'u').test(text);
const action=(capabilityId,parameters,confirmation)=>({capabilityId,parameters,confirmation});
const clarify=clarification=>({clarification});
const article=a=>action('news.open_article',{articleId:a.id},`Artikel “${a.title}” sudah dibuka.`);
const category=id=>action('news.category',{category:id},`Halaman ${categories[id]} sudah dibuka.`);
const collection=id=>action('news.collection',{collection:id},`Koleksi ${{sorotan:'Sorotan',editor:'Pilihan Editor',populer:'Terpopuler',lensa:'Lensa Kabarin'}[id]} sudah dibuka.`);
function fromUrl(value,pageUrl,byId){
  let target,current;try{current=new URL(pageUrl);target=new URL(value,current);}catch{return clarify('Aku hanya bisa membuka halaman portal Kabarin yang terdaftar.');}
  if(target.username||target.password||target.search)return clarify('Aku hanya bisa membuka halaman portal Kabarin yang terdaftar.');
  if(target.origin!==current.origin)return clarify('Aku dapat menavigasi halaman di portal Kabarin. Tautan di luar portal belum termasuk aksi yang diizinkan.');
  if(![current.pathname,current.pathname.replace(/\/$/,'')+'/index.html'].includes(target.pathname))return clarify('Tautan itu bukan halaman Kabarin yang terdaftar.');
  let route;try{route=decodeURIComponent(target.hash.slice(1)).replace(/^\/+|\/+$/g,'');}catch{return clarify('Tautan halaman tidak valid.');}
  const[id,param]=route.split('/');
  if(!route)return action('news.home',{},'Beranda Kabarin sudah dibuka.');
  if(route==='tersimpan')return action('news.saved',{},'Halaman Bacaan Tersimpan sudah dibuka.');
  if(id==='kategori'&&Object.hasOwn(categories,param)&&route===`kategori/${param}`)return category(param);
  if(id==='koleksi'&&Object.hasOwn(collections,param)&&route===`koleksi/${param}`)return collection(param);
  if(id==='artikel'&&byId.has(param)&&route===`artikel/${param}`)return article(byId.get(param));
  if(id==='cari'&&route.slice(5).trim()&&route.slice(5).length<=120)return action('news.search',{query:route.slice(5)},'Hasil pencarian sudah ditampilkan.');
  return clarify('Halaman itu belum terdaftar. Sebutkan kategori, koleksi, atau judul artikel yang ingin dibuka.');
}
export function navigationIntent(query,catalog,messages,pageUrl){
  const text=normalize(query);
  if(has(text,'jangan|jgn|tidak|nggak|gak|ga|batal|batalkan|bukan'))return null;
  if(!/^(?:(?:tolong|mohon|oke|ok|ya|baik|coba|please|bisa|bisakah|boleh|aku mau|saya mau|aku ingin|saya ingin)\s+)*(?:buka|bukakan|bukain|open|tampilkan|lihat|perlihatkan|bawa|arahkan|pergi|go to)\b/u.test(text))return null;
  const byId=new Map(catalog.map(a=>[a.id,a]));
  const url=/https?:\/\/[^\s<>"']+|#[^\s<>"']+/iu.exec(query)?.[0];if(url)return fromUrl(url.replace(/[.,!?)]+$/g,''),pageUrl,byId);
  const id=/\b(?:news-[a-f0-9]{16}|(?:nasional|dunia|ekonomi|teknologi|olahraga|gaya-hidup|otomotif|hiburan|opini)-(?:[1-9]|1[0-9]|2[0-4]))\b/u.exec(query.toLowerCase())?.[0];
  if(id)return byId.has(id)?article(byId.get(id)):clarify('Artikel itu belum tersedia di Kabarin. Sebutkan judul atau kategori yang ingin dibuka.');
  for(const a of [...catalog].reverse())if(text.includes(normalize(a.title)))return article(a);
  const found=Object.entries(categories).filter(([,label])=>has(text,normalize(label))).map(([id])=>id);
  if(found.length>1)return clarify('Kamu ingin membuka kategori yang mana? Pilih satu kategori agar aku membuka halaman yang tepat.');
  if(has(text,'bagian|section|seksi'))for(const[alias,section]of Object.entries({opini:'opinion',editor:'editor',terbaru:'latest',lensa:'lens',perspektif:'perspectives',newsletter:'newsletter',sorotan:'headline'}))if(has(text,alias))return action('news.section',{section},'Bagian yang kamu minta sudah ditampilkan.');
  if(has(text,'terbaru|terakhir|paling baru|latest|newest')&&has(text,'artikel|berita|news')){
    if(has(text,'semua|daftar|beberapa|halaman|page')&&!has(text,'1|satu|sebuah'))return found.length?category(found[0]):action('news.section',{section:'latest'},'Bagian Kabar Terbaru sudah ditampilkan.');
    const items=catalog.filter(a=>!found.length||a.category===found[0]).sort((a,b)=>(a.ageMinutes??Number.MAX_SAFE_INTEGER)-(b.ageMinutes??Number.MAX_SAFE_INTEGER));return items.length?article(items[0]):null;
  }
  if(/\b(?:artikel|berita|bacaan)\s+(?:itu|tersebut|tadi|ini|yang kamu sebut|yang tadi)\b/u.test(text)){
    const current=/#artikel\/([a-z0-9-]{1,70})$/.exec(pageUrl)?.[1];if(text.includes(' ini')&&byId.has(current))return article(byId.get(current));
    for(const message of [...messages].reverse()){
      if(message.role!=='assistant')continue;let content;try{content=JSON.parse(message.content);}catch{content=null;}
      for(const call of content?.toolCalls??[])if(call.capabilityId==='news.open_article'&&byId.has(call.parameters?.articleId))return article(byId.get(call.parameters.articleId));
      const spoken=normalize(content?.text??message.content);const matches=catalog.filter(a=>spoken.includes(normalize(a.title)));
      if(matches.length===1)return article(matches[0]);if(matches.length>1)return clarify('Tadi ada beberapa artikel yang disebut. Sebutkan judul artikel yang ingin kamu buka.');
    }return clarify('Artikel yang mana? Sebutkan judulnya, atau minta aku membuka satu berita terbaru.');
  }
  if(has(text,'tersimpan|bookmark|favorit'))return action('news.saved',{},'Halaman Bacaan Tersimpan sudah dibuka.');
  for(const[id,aliases]of Object.entries(collections))if(aliases.some(alias=>has(text,alias)))return collection(id);
  if(found.length)return category(found[0]);
  if(has(text,'beranda|home|homepage|halaman utama'))return action('news.home',{},'Beranda Kabarin sudah dibuka.');
  if(has(text,'halaman|page'))return clarify('Halaman mana yang ingin dibuka? Misalnya Beranda, Teknologi, Terpopuler, Pilihan Editor, Lensa Kabarin, atau Bacaan Tersimpan.');
  return null;
}
export function readingIntent(query,pageUrl,navigation,results){
  const text=normalize(query);if(has(text,'jangan|jgn|tidak|nggak|gak|ga|batal|batalkan|bukan'))return null;
  const summary=has(text,'ringkas|ringkaskan|ringkasin|rangkum|rangkumkan|merangkum|ringkasan|summary|summarize');
  const read=summary||has(text,'telusuri|pindai|scan|baca'),scroll=has(text,'scroll|gulir'),highlight=/\b(?:sorot|tandai|highlight)\s+(?:artikel|halaman)(?:\s+ini)?\b/u.test(text);
  const explicit=/^(?:(?:tolong|mohon|oke|ok|ya|baik|coba|please|bisa|bisakah|boleh)\s+)*(?:ringkas|ringkaskan|ringkasin|rangkum|rangkumkan|buat ringkasan|summary|summarize|telusuri|pindai|scan|baca|scroll|gulir|sorot|tandai|highlight)\b/u.test(text);
  if((!read&&!scroll&&!highlight)||(!explicit&&!navigation))return null;
  if(navigation?.clarification)return navigation;
  if(navigation&&!results.some(r=>r.capabilityId===navigation.capabilityId&&r.status==='success'))return navigation;
  const articlePage=/#artikel\/[a-z0-9-]{1,70}$/.test(pageUrl);const scope=articlePage?'article':'page';
  if(!articlePage&&has(text,'artikel|berita ini|bacaan ini'))return clarify('Buka sebuah artikel terlebih dahulu, atau minta “buka satu berita terbaru lalu rangkum isinya”.');
  if(!read){
    if(scroll){const edges=[...text.matchAll(/\b(?:atas|awal|start|bawah|akhir|end)\b/gu)].map(m=>['atas','awal','start'].includes(m[0])?'start':'end');if(!edges.length)return clarify('Ingin menggulir ke atas atau ke bawah?');for(const position of new Set(edges))if(!results.some(r=>r.capabilityId==='page.scroll_to'&&r.status==='success'&&r.evidence?.scope===scope&&r.evidence?.position===position))return action('page.scroll_to',{scope,position});}
    else if(!results.some(r=>r.capabilityId==='page.highlight'&&r.status==='success'))return action('page.highlight',{scope});
    return {summary:false,confirmation:scroll?'Halaman sudah digulir ke posisi yang kamu minta.':'Bagian yang kamu minta sudah ditunjukkan.'};
  }
  const reads=results.filter(r=>r.capabilityId==='page.read'&&r.status==='success'&&r.evidence?.scope===scope&&r.evidence?.url===pageUrl);const last=reads.at(-1)?.evidence;const offset=last?last.nextOffset:0;
  if(!last||(last.truncated&&Number.isInteger(offset)&&offset>0&&offset<=40000&&reads.length<3))return action('page.read',{scope,mode:'full',offset});
  return {summary,complete:!last.truncated,confirmation:`Isi ${articlePage?'artikel':'halaman'} sudah dibaca dan diverifikasi.${last.truncated?' Bacaan masih sebagian karena batas panjang teks.':''}`};
}
