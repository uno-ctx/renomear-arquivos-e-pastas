const $=id=>document.getElementById(id);
const token=location.hash.slice(1)||sessionStorage.getItem('renomear-token')||'';
if(token)sessionStorage.setItem('renomear-token',token);
history.replaceState(null,'',location.pathname);
const groups={
 clean:[['concat','a↔b','Juntar tudo','casa_-_grande → casagrande'],['remove_','_','Retirar underline _','meus_arquivos → meusarquivos'],['remove-','−','Retirar hífen -','meus-arquivos → meusarquivos'],['removeSpace','␣','Retirar espaços','meus arquivos → meusarquivos'],['space_','␣ → _','Espaços → underline _','meus arquivos → meus_arquivos'],['space-','␣ → -','Espaços → hífen -','meus arquivos → meus-arquivos'],['_space','_ → ␣','Underline _ → espaços','meus_arquivos → meus arquivos'],['-space','- → ␣','Hífen - → espaços','meus-arquivos → meus arquivos']],
 case:[['upper','AA','Tudo em MAIÚSCULAS','Meus arquivos → MEUS ARQUIVOS'],['lower','aa','Tudo em minúsculas','Meus Arquivos → meus arquivos']],
 split:[['splitSpace','a b','Separar com espaços','imagesfolder → images folder'],['split_','a_b','Separar com underline _','imagenspatas → imagens_patas']],
 custom:[['replace','a→b','Substituir trecho','MinhaPasta → Minha_Pasta'],['prefix','+a','Adicionar no início','arquivo → projeto_arquivo'],['suffix','a+','Adicionar no final','arquivo → arquivo_final']]
};
let operation='concat', currentCategory='clean', plan=null, rows=[], working=false, applied=false, messageTimer;
function message(text,error=false){clearTimeout(messageTimer);$('message').textContent=text;$('message').className=error?'error':'';$('message').hidden=false;messageTimer=setTimeout(()=>$('message').hidden=true,error?20000:9000);}
async function api(route,body){const res=await fetch('/api/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Session-Token':token},body:JSON.stringify(body)});const data=await res.json();if(!res.ok)throw Error(data.error||'Falha na operação');return data;}
function options(){return {operation,scope:$('scope').value,preserveExtension:$('preserve').checked,find:$('find').value,replacement:$('replacement').value,text:$('text').value};}
function invalidate(){if(plan){plan=null;rows=[];applied=false;$('results').hidden=true;$('empty').hidden=false;$('count-badge').textContent='Atualize a prévia';$('preview-caption').textContent='As opções mudaram. Gere uma nova prévia.';}updateSelection();}
function renderOperations(){
 $('operations').replaceChildren();
 for(const [id,symbol,title,example] of groups[currentCategory]){
  const b=document.createElement('button');b.className='operation'+(operation===id?' selected':'');b.setAttribute('aria-pressed',String(operation===id));
  const icon=document.createElement('span');icon.className='op-symbol';icon.textContent=symbol;
  const text=document.createElement('span'),name=document.createElement('span'),sample=document.createElement('span');name.className='op-title';sample.className='op-example';name.textContent=title;sample.textContent=example;text.append(name,sample);b.append(icon,text);
  b.onclick=()=>{if(working)return;operation=id;invalidate();renderOperations();};$('operations').append(b);
 }
 $('extra').hidden=!['replace','prefix','suffix'].includes(operation);$('find-label').hidden=operation!=='replace';$('replacement-label').hidden=operation!=='replace';$('text-label').hidden=!['prefix','suffix'].includes(operation);$('split-note').hidden=currentCategory!=='split';
}
document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{if(working)return;currentCategory=b.dataset.category;operation=groups[currentCategory][0][0];document.querySelectorAll('[data-category]').forEach(x=>x.classList.toggle('selected',x===b));invalidate();renderOperations();});
function validate(name){if(!name.trim()||['.','..'].includes(name))return 'Nome vazio';if(/[<>:"/\\|?*\x00-\x1f]/.test(name)||/[ .]$/.test(name))return 'Nome inválido';if(/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name))return 'Nome reservado';if(name.length>255)return 'Nome longo demais';return '';}
function selectedRows(){return rows.filter(r=>r.selected&&r.next!==r.name);}
function updateSelection(){const chosen=selectedRows();$('selection-count').textContent=`${chosen.length} ${chosen.length===1?'item selecionado':'itens selecionados'}`;$('apply').disabled=working||!plan||!chosen.length||applied||chosen.some(r=>validate(r.next));$('select-all').checked=rows.length>0&&rows.filter(r=>r.next!==r.name).every(r=>r.selected);}
function renderRows(){
 const tbody=$('rows');tbody.replaceChildren();
 for(const r of rows){
  if($('changed-only').checked&&r.next===r.name)continue;
  const tr=document.createElement('tr'),checkCell=document.createElement('td'),check=document.createElement('input');check.type='checkbox';check.checked=r.selected;check.disabled=working||applied;check.setAttribute('aria-label','Selecionar '+r.name);check.onchange=()=>{r.selected=check.checked;updateSelection();};checkCell.append(check);
  const original=document.createElement('td'),icon=document.createElement('span');icon.className='name-icon';icon.textContent=r.directory?'▱':'▤';original.append(icon,document.createTextNode(r.name));
  const arrow=document.createElement('td');arrow.className='arrow';arrow.textContent='→';
  const next=document.createElement('td'),input=document.createElement('input');input.className='row-name';input.value=r.next;input.disabled=working||applied;input.setAttribute('aria-label','Novo nome para '+r.name);next.append(input);
  const statusCell=document.createElement('td'),status=document.createElement('span');status.className='status';statusCell.append(status);
  function updateStatus(){const err=validate(r.next);status.textContent=applied?'Concluído':err||(r.name===r.next?'Sem alteração':'Revisar');status.classList.toggle('error',!!err);input.classList.toggle('invalid',!!err);input.setAttribute('aria-invalid',String(!!err));}
  input.oninput=()=>{r.next=input.value;r.selected=true;check.checked=true;updateStatus();updateSelection();};updateStatus();tr.append(checkCell,original,arrow,next,statusCell);tbody.append(tr);
 }
 $('summary').textContent=`${rows.length} itens · ${rows.filter(r=>r.name!==r.next).length} alterações propostas`;
 updateSelection();
}
async function run(button,label,fn){if(working)return;working=true;const old=button.textContent;button.textContent=label;document.querySelectorAll('button,input,select').forEach(e=>e.disabled=true);try{await fn();}catch(e){message(e.message,true);}finally{working=false;document.querySelectorAll('button,input,select').forEach(e=>e.disabled=false);button.textContent=old;if(plan)renderRows();else updateSelection();}}
function updateFolderButton(){ $('browse').textContent=$('folder').value.trim()?'Usar caminho →':'Escolher pasta ↗'; }
$('folder').addEventListener('input',updateFolderButton);
$('folder').addEventListener('keydown',event=>{if(event.key==='Enter'&&!working){event.preventDefault();$('preview').click();}});
$('browse').onclick=()=>{
 if($('folder').value.trim()){ $('preview').click(); return; }
 return run($('browse'),'Escolha a pasta…',async()=>{const result=await api('pick',{});if(result.folder){$('folder').value=result.folder;invalidate();} }).finally(updateFolderButton);
};
updateFolderButton();
$('preview').onclick=()=>run($('preview'),'Preparando prévia…',async()=>{
 const folder=$('folder').value.trim().replace(/^"|"$/g,'');if(!folder)throw Error('Escolha uma pasta ou cole seu caminho.');
 const data=await api('preview',{folder,options:options()});plan=data.id;rows=data.rows.map(r=>({...r,selected:r.name!==r.next}));applied=false;$('folder').value=data.folder;$('empty').hidden=true;$('results').hidden=false;$('count-badge').textContent=rows.length+' itens';$('preview-caption').textContent='Edite os nomes, marque os itens e confira antes de confirmar.';renderRows();if(!rows.length)message('Nenhum item visível foi encontrado com esse filtro.');
});
$('apply').onclick=()=>{if(working||!plan)return;const n=selectedRows().length;$('confirm-text').textContent=`Você vai renomear ${n} ${n===1?'item':'itens'} na pasta ${$('folder').value}.`;$('confirm').showModal();};
$('confirm').addEventListener('close',()=>{if($('confirm').returnValue!=='apply')return;run($('apply'),'Renomeando…',async()=>{const data=await api('apply',{id:plan,changes:selectedRows().map(r=>({id:r.id,next:r.next}))});rows=rows.filter(r=>r.selected&&r.name!==r.next);applied=true;$('preview-caption').textContent=`Tudo certo! ${data.count} itens renomeados. Gere outra prévia para continuar.`;message(`${data.count} itens renomeados com sucesso.`);});});
$('select-all').onchange=()=>{rows.forEach(r=>r.selected=$('select-all').checked);renderRows();};$('changed-only').onchange=renderRows;
for(const id of ['folder','scope','preserve','find','replacement','text'])$(id).addEventListener(id==='folder'||['find','replacement','text'].includes(id)?'input':'change',invalidate);
renderOperations();updateSelection();if(!token)message('Abra o aplicativo pelo arquivo Iniciar.bat para iniciar sua sessão local.',true);
