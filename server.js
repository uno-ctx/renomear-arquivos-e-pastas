const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {execFile, execFileSync} = require('node:child_process');
const TOKEN = crypto.randomBytes(32).toString('hex');
let appDirectory = __dirname;
// Libera a pasta do aplicativo para renomeacoes no Windows.
if (require.main === module) process.chdir(require('node:os').tmpdir());
const plans = new Map();
let busy = false;
const norm = s => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
let dict;
function dictionary() {
  if (dict) return dict;
  const lines = zlib.gunzipSync(fs.readFileSync(path.join(appDirectory,'dictionary.gz'))).toString('utf8').split(/\r?\n/);
  const loaded = new Map();
  for (const line of lines) {
    const [word, count] = line.split(' ');
    if (!/^\p{L}+$/u.test(word || '')) continue;
    const key = norm(word), freq = Number(count);
    if (!freq || (key.length === 1 && !['a','e','i','o'].includes(key))) continue;
    loaded.set(key, Math.max(loaded.get(key) || 0, freq));
  }
  dict = loaded;
  return dict;
}
function splitWord(word, sep) {
  const key = norm(word), n = key.length, d = dictionary();
  if (n !== word.length || n > 200) return word;
  const cost = Array(n+1).fill(Infinity), prev = Array(n+1).fill(-1); cost[0] = 0;
  for (let end=1; end<=n; end++) for (let start=Math.max(0,end-40); start<end; start++) {
    const f = d.get(key.slice(start,end));
    if (!f || !Number.isFinite(cost[start])) continue;
    const c = cost[start] + Math.log(1e9/f) + 1;
    if (c < cost[end]) {cost[end]=c; prev[end]=start;}
  }
  if (prev[n] < 0) return word;
  const parts=[];
  for (let end=n; end>0;) {const start=prev[end]; parts.unshift(word.slice(start,end)); end=start;}
  return parts.join(sep);
}
function transform(name, directory, options) {
  const ext = !directory && options.preserveExtension ? path.extname(name) : '';
  let base = ext ? name.slice(0,-ext.length) : name;
  const replace = (a,b) => base.split(a).join(b);
  switch (options.operation) {
    case 'upper': base=base.toLocaleUpperCase('pt-BR'); break;
    case 'lower': base=base.toLocaleLowerCase('pt-BR'); break;
    case 'remove_': base=replace('_',''); break;
    case 'remove-': base=replace('-',''); break;
    case 'removeSpace': base=replace(' ',''); break;
    case 'space_': base=replace(' ','_'); break;
    case 'space-': base=replace(' ','-'); break;
    case '_space': base=replace('_',' '); break;
    case '-space': base=replace('-',' '); break;
    case 'concat': base=base.replace(/[ _-]+/g,''); break;
    case 'splitSpace': case 'split_': {
      const sep=options.operation==='split_' ? '_' : ' ';
      base=base.replace(/\p{L}+/gu,w=>splitWord(w,sep)).replace(/[ _-]+/g,sep); break;
    }
    case 'replace':
      if (!options.find) throw Error('Informe o trecho a procurar.');
      base=replace(String(options.find),String(options.replacement || '')); break;
    case 'prefix': base=String(options.text || '')+base; break;
    case 'suffix': base+=String(options.text || ''); break;
    default: throw Error('Escolha uma operação válida.');
  }
  return base+ext;
}
function invalid(name) {
  if (typeof name !== 'string' || !name.trim() || name==='.' || name==='..') return 'Nome vazio ou inválido';
  if (/[<>:"/\\|?*\x00-\x1f]/.test(name) || /[ .]$/.test(name)) return 'Caracteres não permitidos no Windows';
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name)) return 'Nome reservado pelo Windows';
  if (name.length>255) return 'Nome maior que 255 caracteres';
  return '';
}
function identity(file) {const s=fs.lstatSync(file,{bigint:true});return `${s.dev}:${s.ino}:${s.mtimeNs}:${s.size}`;}
function list(folder) {
  if (!path.isAbsolute(folder)) throw Error('Informe o caminho completo da pasta.');
  folder=fs.realpathSync(folder);
  if (!fs.statSync(folder).isDirectory()) throw Error('O caminho não é uma pasta.');
  // Get-ChildItem sem -Force mantém o comportamento do BAT: ignora ocultos/sistema.
  const output=execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',
    "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $itens=@(Get-ChildItem -LiteralPath $env:RENOMEADOR_FOLDER | Select-Object Name); ConvertTo-Json -InputObject $itens -Compress"],
    {env:{...process.env,RENOMEADOR_FOLDER:folder},encoding:'utf8',windowsHide:true,maxBuffer:10*1024*1024});
  const entries=JSON.parse(output.replace(/^\uFEFF/,'') || '[]');
  const items=[];
  for (const e of entries) {
    const full=path.join(folder,e.Name), stat=fs.lstatSync(full);
    if (stat.isSymbolicLink()) continue;
    items.push({name:e.Name,directory:stat.isDirectory(),identity:identity(full)});
  }
  return {folder,items:items.sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name))};
}
function preview(folder, options) {
  const listed=list(folder), id=crypto.randomUUID();
  const rows=listed.items.filter(it=>options.scope==='files' ? !it.directory : options.scope==='folders' ? it.directory : true)
    .map((it,i)=>({...it,id:String(i),next:transform(it.name,it.directory,options)}));
  plans.clear(); plans.set(id,{folder:listed.folder,rows});
  return {id,folder:listed.folder,rows:rows.map(({identity,...r})=>r)};
}
function apply(id, changes) {
  const plan=plans.get(id);
  if (!plan) throw Error('A prévia expirou. Gere uma nova prévia.');
  if (!Array.isArray(changes) || !changes.length) throw Error('Selecione pelo menos um item.');
  const seen=new Set(), targets=new Set(), selected=[];
  for (const change of changes) {
    const row=plan.rows.find(r=>r.id===change.id);
    if (!row || seen.has(change.id)) throw Error('Seleção inválida. Gere outra prévia.');
    seen.add(change.id);
    if (row.name===change.next) continue;
    const error=invalid(change.next); if(error) throw Error(`${row.name}: ${error}.`);
    const key=change.next.toLowerCase();
    if(targets.has(key)) throw Error(`Dois itens receberiam o nome ${change.next}. Corrija a prévia.`);
    targets.add(key);
    const full=path.join(plan.folder,row.name);
    if(identity(full)!==row.identity) throw Error(`${row.name} mudou desde a prévia. Atualize a lista.`);
    selected.push({...row,next:change.next,temp:'__rename_'+crypto.randomUUID(),state:'original'});
  }
  if(!selected.length) throw Error('Nenhum nome foi alterado.');
  const occupied=fs.readdirSync(plan.folder);
  for(const item of selected) {
    const matches=occupied.filter(n=>n.toLowerCase()===item.next.toLowerCase());
    if(matches.some(n=>!selected.some(s=>s.name===n))) throw Error(`O nome ${item.next} já existe. Nenhum item foi renomeado.`);
  }
  // Duas etapas permitem trocas de caixa e trocas de nomes entre itens selecionados.
  const file=n=>path.join(plan.folder,n);
  try {
    for(const item of selected) {fs.renameSync(file(item.name),file(item.temp)); item.state='temp';}
    for(const item of selected) {
      if(fs.existsSync(file(item.next))) throw Error(`O destino ${item.next} apareceu durante a operação.`);
      fs.renameSync(file(item.temp),file(item.next));item.state='final';
    }
  } catch(error) {
    const recovery=[];
    for(const item of selected.filter(s=>s.state==='final')) {
      try {fs.renameSync(file(item.next),file(item.temp));item.state='temp';}
      catch(e) {recovery.push(`${item.next}: ${e.message}`);}
    }
    for(const item of selected.filter(s=>s.state==='temp')) {
      try {if(fs.existsSync(file(item.name))) throw Error('Nome original ocupado');fs.renameSync(file(item.temp),file(item.name));item.state='original';}
      catch(e) {recovery.push(`${file(item.temp)}: ${e.message}`);}
    }
    plans.delete(id);
    throw Error(error.message + (recovery.length ? '\nVerifique estes itens: '+recovery.join('; ') : '\nOs nomes originais foram restaurados.'));
  }
  // Atualiza tambem quando uma pasta ancestral do aplicativo muda de nome.
  for (const item of selected.filter(item => item.directory)) {
    const previousDirectory = path.join(plan.folder, item.name);
    const relative = path.relative(previousDirectory, appDirectory);
    if (relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))) {
      appDirectory = path.join(plan.folder, item.next, relative);
      break;
    }
  }
  plans.delete(id);
  return {count:selected.length,items:selected.map(s=>({from:s.name,to:s.next}))};
}
function pickFolder() {
  return new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-STA','-Command',
    "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description='Selecione a pasta com os itens a renomear'; if($d.ShowDialog() -eq 'OK'){[Console]::Write($d.SelectedPath)}; $d.Dispose()"],
    {windowsHide:true,encoding:'utf8'},(err,stdout)=>err?reject(Error('Não foi possível abrir o seletor. Cole o caminho da pasta.')):resolve(stdout.trim())));
}
function json(res,status,data) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function route(req,res) {
  const base=`http://127.0.0.1:${server.address().port}`;
  if(req.headers.host!==`127.0.0.1:${server.address().port}`) return json(res,403,{error:'Host inválido'});
  if(req.url.startsWith('/api/')) {
    if(req.method!=='POST' || req.headers['x-session-token']!==TOKEN || (req.headers.origin && req.headers.origin!==base)) return json(res,403,{error:'Sessão inválida. Abra pelo Iniciar.bat.'});
    if(busy) return json(res,409,{error:'Uma operação está em andamento.'});
    busy=true;
    try {
      let raw='';for await (const chunk of req) {raw+=chunk;if(raw.length>2e6) throw Error('Solicitação muito grande');}
      const body=JSON.parse(raw || '{}');
      if(req.url==='/api/theme') {
        if(!['light','dark'].includes(body.theme)) throw Error('Tema invalido');
        fs.writeFileSync(path.join(appDirectory,'.preferences.json'), JSON.stringify({theme:body.theme}));
        return json(res,200,{theme:body.theme});
      }
      if(req.url==='/api/pick') return json(res,200,{folder:await pickFolder()});
      if(req.url==='/api/preview') return json(res,200,preview(String(body.folder||''),body.options||{}));
      if(req.url==='/api/apply') return json(res,200,apply(body.id,body.changes));
      return json(res,404,{error:'Operação inexistente'});
    } catch(e) {return json(res,400,{error:e.message});} finally {busy=false;}
  }
  const assets={'/':'index.html','/app.js':'app.js','/theme.js':'theme.js','/style.css':'style.css'};
  const filename=assets[req.url];
  if(req.method!=='GET' || !filename) {res.writeHead(404);return res.end();}
  const mime=filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':'text/html';
  res.writeHead(200,{'Content-Type':mime+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});
  if(filename==='theme.js') {
    let theme='light';
    try {const saved=JSON.parse(fs.readFileSync(path.join(appDirectory,'.preferences.json'),'utf8')); if(saved.theme==='dark')theme='dark';} catch {}
    return res.end('document.documentElement.dataset.savedTheme='+JSON.stringify(theme)+';'+fs.readFileSync(path.join(appDirectory,'public',filename),'utf8'));
  }
  res.end(fs.readFileSync(path.join(appDirectory,'public',filename)));
}
const server=http.createServer((req,res)=>route(req,res).catch(e=>json(res,500,{error:e.message})));
if(require.main===module) server.listen(0,'127.0.0.1',()=>{
  const url=`http://127.0.0.1:${server.address().port}/#${TOKEN}`;
  console.log('\nRENOMEAR - interface local\nMantenha esta janela aberta enquanto usa o aplicativo.\nPara encerrar, feche esta janela.\n');
  if(!process.env.RENOMEADOR_NO_BROWSER) execFile('powershell.exe',['-NoProfile','-Command',`Start-Process '${url}'`],{windowsHide:true},err=>{if(err)console.log('Abra no navegador: '+url);});
  else console.log(url);
});
module.exports={transform,splitWord,invalid,preview,apply,list};
