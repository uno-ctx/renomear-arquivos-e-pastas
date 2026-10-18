const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn,execFileSync}=require('node:child_process');
const {once}=require('node:events');
const app=require('../server.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'renomear-tests-'));
let sequence=0;
function fixture(names=['ARQUIVO.TXT','PASTA/filho.txt']){
 const dir=path.join(root,String(++sequence));fs.mkdirSync(dir);
 for(const name of names){const file=path.join(dir,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'conteudo:'+name);}
 return dir;
}
const opts=(operation='lower',extra={})=>({operation,preserveExtension:true,scope:'all',...extra});
const changes=plan=>plan.rows.filter(r=>r.next!==r.name).map(r=>({id:r.id,next:r.next}));
after(()=>fs.rmSync(root,{recursive:true,force:true}));
for(const [operation,input,expected,extra={}] of [
 ['upper','ação.txt','AÇÃO.txt'],['lower','AÇÃO.TXT','ação.TXT'],
 ['remove_','meus_arquivos.txt','meusarquivos.txt'],['remove-','meus-arquivos.txt','meusarquivos.txt'],
 ['removeSpace','meus arquivos.txt','meusarquivos.txt'],['space_','meus arquivos.txt','meus_arquivos.txt'],
 ['space-','meus arquivos.txt','meus-arquivos.txt'],['_space','meus_arquivos.txt','meus arquivos.txt'],
 ['-space','meus-arquivos.txt','meus arquivos.txt'],['concat','casa_-_grande.txt','casagrande.txt'],
 ['splitSpace','imagesfolder.txt','images folder.txt'],['split_','imagenspatas.txt','imagens_patas.txt'],
 ['replace','casa.casa.txt','lar.lar.txt',{find:'casa',replacement:'lar'}],
 ['prefix','arquivo.txt','novo_arquivo.txt',{text:'novo_'}],['suffix','arquivo.txt','arquivo_v2.txt',{text:'_v2'}]
]) test('transformacao '+operation,()=>assert.equal(app.transform(input,false,opts(operation,extra)),expected));
test('extensao pode ser convertida',()=>assert.equal(app.transform('AÇÃO.TXT',false,opts('lower',{preserveExtension:false})),'ação.txt'));
test('pastas com ponto nao tem extensao preservada',()=>assert.equal(app.transform('PASTA.V1',true,opts()),'pasta.v1'));
test('extensao composta preserva somente sufixo final',()=>assert.equal(app.transform('BACKUP.TAR.GZ',false,opts()),'backup.tar.GZ'));
test('operacao desconhecida e substituicao vazia rejeitadas',()=>{assert.throws(()=>app.transform('a',false,opts('x')),/válida/);assert.throws(()=>app.transform('a',false,opts('replace')),/trecho/);});
for(const name of ['', '.', '..','CON','nul.txt','COM¹.txt','a/b','a\\b','a:','nome.','nome ','a\0b','x'.repeat(256)])test('nome invalido '+JSON.stringify(name),()=>assert.ok(app.invalid(name)));
test('nomes validos com Unicode',()=>assert.equal(app.invalid('ação 2026_💚.txt'),''));
test('previa nao modifica conteudo nem nomes e nao percorre filhos',()=>{const dir=fixture();const before=fs.readdirSync(dir);const p=app.preview(dir,opts());assert.deepEqual(fs.readdirSync(dir),before);assert.equal(p.rows.length,2);assert.equal(fs.readFileSync(path.join(dir,'PASTA','filho.txt'),'utf8'),'conteudo:PASTA/filho.txt');assert.ok(p.rows.every(r=>!('identity'in r)));});
test('filtros arquivos e pastas',()=>{const dir=fixture();assert.ok(app.preview(dir,opts('lower',{scope:'files'})).rows.every(r=>!r.directory));assert.ok(app.preview(dir,opts('lower',{scope:'folders'})).rows.every(r=>r.directory));});
test('pasta vazia gera previa vazia',()=>assert.deepEqual(app.preview(fixture([]),opts()).rows,[]));
test('caminho relativo, inexistente ou arquivo rejeitados',()=>{assert.throws(()=>app.preview('relativo',opts()),/completo/);assert.throws(()=>app.preview(path.join(root,'inexistente'),opts()));const dir=fixture(['a']);assert.throws(()=>app.preview(path.join(dir,'a'),opts()),/pasta/);});
test('ocultos e juncoes ignorados',()=>{const dir=fixture(['VISIVEL','OCULTO']);execFileSync('attrib.exe',['+h',path.join(dir,'OCULTO')]);const target=fixture(['filho']);fs.symlinkSync(target,path.join(dir,'ATALHO'),'junction');const p=app.preview(dir,opts());assert.deepEqual(p.rows.map(r=>r.name),['VISIVEL']);});
test('aplica troca de caixa em arquivo e pasta sem mudar conteudo',()=>{const dir=fixture();const p=app.preview(dir,opts());assert.equal(app.apply(p.id,changes(p)).count,2);assert.deepEqual(fs.readdirSync(dir).sort(),['arquivo.TXT','pasta']);assert.equal(fs.readFileSync(path.join(dir,'arquivo.TXT'),'utf8'),'conteudo:ARQUIVO.TXT');assert.ok(fs.existsSync(path.join(dir,'pasta','filho.txt')));});
test('somente itens selecionados mudam',()=>{const dir=fixture(['UM','DOIS']);const p=app.preview(dir,opts());app.apply(p.id,changes(p).slice(0,1));assert.equal(fs.readdirSync(dir).filter(n=>n===n.toLowerCase()).length,1);});
test('edicao manual do novo nome',()=>{const dir=fixture(['A']);const p=app.preview(dir,opts());app.apply(p.id,[{id:p.rows[0].id,next:'Manual'}]);assert.deepEqual(fs.readdirSync(dir),['Manual']);});
test('conflito com item existente nao sobrescreve',()=>{const dir=fixture(['A','B']);const p=app.preview(dir,opts());assert.throws(()=>app.apply(p.id,[{id:p.rows.find(r=>r.name==='A').id,next:'B'}]),/já existe/);assert.equal(fs.readFileSync(path.join(dir,'B'),'utf8'),'conteudo:B');assert.deepEqual(fs.readdirSync(dir),['A','B']);});
test('dois destinos iguais sao rejeitados',()=>{const dir=fixture(['A','B']);const p=app.preview(dir,opts());assert.throws(()=>app.apply(p.id,p.rows.map(r=>({id:r.id,next:'igual'}))),/Dois itens/);assert.deepEqual(fs.readdirSync(dir),['A','B']);});
test('troca de nomes preserva cada conteudo',()=>{const dir=fixture(['A','B']);const p=app.preview(dir,opts());app.apply(p.id,p.rows.map(r=>({id:r.id,next:r.name==='A'?'B':'A'})));assert.equal(fs.readFileSync(path.join(dir,'A'),'utf8'),'conteudo:B');assert.equal(fs.readFileSync(path.join(dir,'B'),'utf8'),'conteudo:A');});
test('previa expira apos nova previa e apos aplicar',()=>{const dir=fixture(['A']);const old=app.preview(dir,opts());const p=app.preview(dir,opts());assert.throws(()=>app.apply(old.id,changes(old)),/expirou/);app.apply(p.id,changes(p));assert.throws(()=>app.apply(p.id,changes(p)),/expirou/);});
test('arquivo alterado depois da previa bloqueia operacao',()=>{const dir=fixture(['A']);const p=app.preview(dir,opts());fs.appendFileSync(path.join(dir,'A'),'alterado');assert.throws(()=>app.apply(p.id,changes(p)),/mudou/);assert.deepEqual(fs.readdirSync(dir),['A']);});
test('selecao vazia duplicada ou desconhecida e nome perigoso bloqueados',()=>{const dir=fixture(['A']);const p=app.preview(dir,opts());for(const c of [[],[{id:'inexistente',next:'b'}],[...changes(p),...changes(p)],[{id:'0',next:'../fora'}]])assert.throws(()=>app.apply(p.id,c));assert.deepEqual(fs.readdirSync(dir),['A']);});
test('rollback restaura nomes e conteudos apos falha parcial',()=>{const dir=fixture(['A','B']);const p=app.preview(dir,opts());const rename=fs.renameSync;let calls=0;fs.renameSync=(...args)=>{if(++calls===4)throw Object.assign(Error('falha simulada'),{code:'EBUSY'});return rename(...args);};try{assert.throws(()=>app.apply(p.id,changes(p)),/restaurados/);}finally{fs.renameSync=rename;}assert.deepEqual(fs.readdirSync(dir),['A','B']);assert.equal(fs.readFileSync(path.join(dir,'A'),'utf8'),'conteudo:A');assert.equal(fs.readFileSync(path.join(dir,'B'),'utf8'),'conteudo:B');});
test('lote de 500 arquivos preserva conteudos e nao deixa nomes temporarios',()=>{const names=Array.from({length:500},(_,i)=>'ARQUIVO '+String(i).padStart(4,'0')+'.TXT');const dir=fixture(names);const p=app.preview(dir,opts('space_'));assert.equal(app.apply(p.id,changes(p)).count,500);const actual=fs.readdirSync(dir);assert.equal(actual.length,500);assert.ok(actual.every(n=>!n.startsWith('__rename_')));for(const name of names)assert.equal(fs.readFileSync(path.join(dir,name.replace(' ','_')),'utf8'),'conteudo:'+name);});
test('falha de leitura do dicionario nao deixa cache vazio permanente',()=>{const source=path.resolve(__dirname,'../server.js');delete require.cache[source];const fresh=require(source);const read=fs.readFileSync;fs.readFileSync=(file,...args)=>{if(String(file).endsWith('dictionary.gz'))throw Error('dicionario indisponivel');return read(file,...args);};try{assert.throws(()=>fresh.splitWord('imagesfolder','_'),/indisponivel/);}finally{fs.readFileSync=read;}assert.equal(fresh.splitWord('imagesfolder','_'),'images_folder');});
test('pasta bloqueada pelo Windows falha sem perder itens e permite tentar novamente',async()=>{const dir=fixture(['PASTA/filho']);const lock=spawn(process.execPath,['-e',"console.log('pronto');setInterval(()=>{},1000)"],{cwd:path.join(dir,'PASTA'),windowsHide:true});await once(lock.stdout,'data');try{const p=app.preview(dir,opts());assert.throws(()=>app.apply(p.id,changes(p)),/restaurados/);assert.ok(fs.existsSync(path.join(dir,'PASTA','filho')));}finally{lock.kill();await once(lock,'exit');}const p=app.preview(dir,opts());app.apply(p.id,changes(p));assert.ok(fs.existsSync(path.join(dir,'pasta','filho')));});

test('HTTP: iniciador, seguranca, erros, renomeacao propria, dicionario e recursos',async t=>{
 const dir=fixture([]),copy=path.join(dir,'APLICATIVO TESTE');fs.mkdirSync(copy);
 for(const name of ['server.js','dictionary.gz','Iniciar.bat','public'])fs.cpSync(path.join(__dirname,'..',name),path.join(copy,name),{recursive:true});
 const child=spawn('cmd.exe',['/d','/c',path.join(copy,'Iniciar.bat')],{cwd:root,env:{...process.env,RENOMEADOR_NO_BROWSER:'1'},windowsHide:true});
 try{
 const url=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Servidor nao iniciou')),15000);child.stdout.on('data',data=>{output+=data;const match=output.match(/http:\/\/127\.0\.0\.1:\d+\/#\w+/);if(match){clearTimeout(timer);resolve(match[0]);}});child.on('error',reject);});
 const [base,token]=url.split('/#');
 async function api(route,body,headers={}){return fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Session-Token':token,...headers},body:JSON.stringify(body)});}
 await t.test('API sem token, origem externa e host externo rejeitados',async()=>{for(const headers of [{'X-Session-Token':''},{Origin:'https://exemplo.invalid'}])assert.equal((await api('preview',{folder:dir,options:opts()},headers)).status,403,JSON.stringify(headers));const status=await new Promise((resolve,reject)=>{require('node:http').get(base,{headers:{Host:'exemplo.invalid'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});assert.equal(status,403);});
 await t.test('metodo GET nao modifica e caminhos desconhecidos retornam 404',async()=>{assert.equal((await fetch(base+'/api/apply')).status,403);assert.equal((await fetch(base+'/inexistente')).status,404);assert.equal((await api('inexistente',{})).status,404);});
 await t.test('JSON invalido e caminho inexistente retornam erro sem derrubar servidor',async()=>{assert.equal((await fetch(base+'/api/preview',{method:'POST',headers:{'X-Session-Token':token},body:'{'})).status,400);assert.equal((await api('preview',{folder:path.join(dir,'nada'),options:opts()})).status,400);assert.equal((await fetch(base)).status,200);});
 await t.test('renomear propria pasta duas vezes e depois carregar dicionario',async()=>{async function run(operation){const res=await api('preview',{folder:dir,options:opts(operation)});assert.equal(res.status,200);const p=await res.json();const applied=await api('apply',{id:p.id,changes:changes(p)});assert.equal(applied.status,200,await applied.text());}
 await run('lower');await run('concat');fs.mkdirSync(path.join(dir,'imagesfolder'));fs.mkdirSync(path.join(dir,'imagenspatas'));await run('split_');assert.ok(fs.existsSync(path.join(dir,'images_folder')));assert.ok(fs.existsSync(path.join(dir,'imagens_patas')));});
 await t.test('pagina e recursos continuam disponiveis depois da renomeacao',async()=>{for(const asset of ['/','/app.js','/theme.js','/style.css']){const res=await fetch(base+asset);assert.equal(res.status,200);assert.ok((await res.text()).length>20);assert.equal(res.headers.get('cache-control'),'no-store');}});
 await t.test('preferencia de tema salva no caminho atualizado',async()=>{assert.equal((await api('theme',{theme:'dark'})).status,200);const appName=fs.readdirSync(dir).find(n=>n.toLowerCase().startsWith('aplicativo'));assert.equal(JSON.parse(fs.readFileSync(path.join(dir,appName,'.preferences.json'))).theme,'dark');assert.equal((await api('theme',{theme:'x'})).status,400);});
 await t.test('renomear pasta ancestral mantem aplicacao funcionando',async()=>{const p=await (await api('preview',{folder:root,options:opts('prefix',{text:'renomeado_'})})).json();const row=p.rows.find(r=>r.name===path.basename(dir));const response=await api('apply',{id:p.id,changes:[{id:row.id,next:row.next}]});assert.equal(response.status,200,await response.text());assert.equal((await fetch(base+'/theme.js')).status,200);assert.equal((await api('theme',{theme:'light'})).status,200);});
 }finally{try{execFileSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{child.kill();}if(child.exitCode===null)await once(child,'exit');}
});
