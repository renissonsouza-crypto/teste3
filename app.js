const SUPABASE_URL='https://cltboopfppuddojdbxiz.supabase.co';
const SUPABASE_KEY='sb_publishable_kLT9vO5NcIZ0n6ZDOEePow_q0MquB4G';
const isTeacher=new URLSearchParams(location.search).get('professor')==='1';
const screens=['loading','student-home','teacher-home','lobby','question-screen','leaderboard-screen','final-screen'];
let pollId=null,timerId=null,polling=false,currentState=null,answerLocked=false;
const $=id=>document.getElementById(id);

async function rpc(name,body={}){
  const res=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{'apikey':SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const text=await res.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
  if(!res.ok)throw new Error(data?.message||data?.hint||'Não foi possível comunicar com o jogo.');
  return data;
}
function show(id){screens.forEach(s=>$(s)?.classList.add('hidden'));$(id)?.classList.remove('hidden')}
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.remove('hidden');clearTimeout(t._x);t._x=setTimeout(()=>t.classList.add('hidden'),3200)}
function setError(id,msg=''){const e=$(id);e.textContent=msg;e.classList.toggle('hidden',!msg)}
function studentBaseUrl(){return location.origin+location.pathname}
function stopTimers(){clearInterval(timerId);timerId=null}
function stopPolling(){clearInterval(pollId);pollId=null;polling=false}
function startPolling(fn){stopPolling();fn();pollId=setInterval(fn,850)}

async function createRoom(){
  const b=$('create-room');b.disabled=true;setError('teacher-error');
  try{const d=await rpc('quiz_create_room');sessionStorage.setItem('logic_host',JSON.stringify({pin:d.pin,token:d.host_token}));renderTeacherSession({pin:d.pin,token:d.host_token})}
  catch(e){setError('teacher-error',e.message);b.disabled=false}
}
function renderTeacherSession(host){
  show('loading');startPolling(async()=>{if(polling)return;polling=true;try{const s=await rpc('quiz_host_state',{p_pin:host.pin,p_host_token:host.token});renderState(s,true)}catch(e){stopPolling();show('teacher-home');setError('teacher-error',e.message)}finally{polling=false}})
}
async function joinRoom(ev){
  ev.preventDefault();setError('join-error');const pin=$('join-pin').value.replace(/\D/g,'').slice(0,6);const name=$('join-name').value.trim();
  if(pin.length!==6){setError('join-error','Digite o PIN de 6 números.');return}
  if(name.length<2){setError('join-error','Digite seu nome.');return}
  const btn=ev.submitter||$('join-form').querySelector('button');btn.disabled=true;
  try{const d=await rpc('quiz_join_room',{p_pin:pin,p_name:name});sessionStorage.setItem('logic_player',JSON.stringify({pin:d.pin,id:d.player_id,name:d.name}));renderStudentSession({pin:d.pin,id:d.player_id,name:d.name})}
  catch(e){setError('join-error',e.message);btn.disabled=false}
}
function renderStudentSession(player){
  show('loading');startPolling(async()=>{if(polling)return;polling=true;try{const s=await rpc('quiz_get_state',{p_pin:player.pin,p_player_id:player.id});renderState(s,false)}catch(e){stopPolling();sessionStorage.removeItem('logic_player');show('student-home');setError('join-error',e.message)}finally{polling=false}})
}

function renderState(s,teacher){
  currentState=s;
  if(s.phase==='waiting')return renderLobby(s,teacher);
  if(s.phase==='question')return renderQuestion(s,teacher);
  if(s.phase==='leaderboard')return renderBoard(s,teacher);
  if(s.phase==='finished')return renderFinal(s,teacher);
}
function renderLobby(s,teacher){
  stopTimers();show('lobby');$('lobby-pin').textContent=s.pin;$('player-count').textContent=s.players_count;
  $('teacher-lobby').classList.toggle('hidden',!teacher);$('student-lobby').classList.toggle('hidden',teacher);
  if(teacher){const list=$('players-list');list.innerHTML='';(s.players||[]).forEach(p=>{const x=document.createElement('span');x.textContent=p.name;list.appendChild(x)});$('start-game').disabled=s.players_count<1;$('student-url').textContent=studentBaseUrl()}
  else{const p=JSON.parse(sessionStorage.getItem('logic_player')||'{}');$('student-welcome').textContent=`Olá, ${p.name||'jogador'}! Seu nome já está na sala.`}
}
function renderQuestion(s,teacher){
  show('question-screen');$('q-number').textContent=`Questão ${s.current_question}/${s.total_questions}`;$('q-category').textContent=s.question.category;$('q-text').textContent=s.question.prompt;$('q-context').textContent=s.question.context||'';
  const grid=$('answer-grid');grid.innerHTML='';const hasAnswered=!teacher&&(s.player?.has_answer||answerLocked);
  s.question.options.forEach((opt,i)=>{const b=document.createElement('button');b.className='answer';b.disabled=teacher||hasAnswered;b.innerHTML=`<span class="letter">${String.fromCharCode(65+i)}</span>${escapeHtml(String(opt))}`;if(!teacher)b.addEventListener('click',()=>submitAnswer(i));grid.appendChild(b)});
  $('submitted').classList.toggle('hidden',teacher||!hasAnswered);$('teacher-progress').classList.toggle('hidden',!teacher);
  if(teacher){$('answers-count').textContent=`${s.answers_count} de ${s.players_count}`;$('answers-bar').style.width=`${s.players_count?Math.min(100,s.answers_count/s.players_count*100):0}%`}
  setCountdown(s.server_now,s.round_ends_at);
}
async function submitAnswer(choice){
  if(answerLocked)return;answerLocked=true;document.querySelectorAll('.answer').forEach(b=>b.disabled=true);$('submitted').classList.remove('hidden');
  const p=JSON.parse(sessionStorage.getItem('logic_player')||'{}');
  try{await rpc('quiz_submit_answer',{p_pin:p.pin,p_player_id:p.id,p_choice:choice})}catch(e){answerLocked=false;$('submitted').classList.add('hidden');toast(e.message)}
}
function setCountdown(serverNow,endAt){
  stopTimers();const offset=new Date(serverNow).getTime()-Date.now(),end=new Date(endAt).getTime();
  const draw=()=>{const n=Math.max(0,Math.ceil((end-(Date.now()+offset))/1000));$('timer').textContent=n;$('timer').parentElement.classList.toggle('danger',n<=5);if(n<=0)stopTimers()};draw();timerId=setInterval(draw,200)
}
function renderBoard(s,teacher){
  stopTimers();answerLocked=false;show('leaderboard-screen');const letter=String.fromCharCode(65+(s.review?.correct_index??0));$('review-answer').textContent=`Resposta correta: alternativa ${letter}`;$('review-explanation').textContent=s.review?.explanation||'';renderRanking('leaderboard',s.leaderboard||[]);
  $('next-question').classList.toggle('hidden',!teacher);$('student-score').classList.toggle('hidden',teacher);
  if(teacher){$('next-question').textContent=s.current_question>=s.total_questions?'ENCERRAR E VER PÓDIO 🏆':'PRÓXIMA QUESTÃO →'}
  else if(s.player){$('student-score').innerHTML=`Sua pontuação: <b>${s.player.score??0}</b> pontos<br><small>${s.player.correct_count??0} acertos • sequência atual ${s.player.streak??0}</small>`}
}
function renderRanking(target,data){
  const box=$(target);box.innerHTML='';if(!data.length){box.innerHTML='<p class="hint">Ainda não há classificação.</p>';return}
  data.forEach((p,i)=>{const row=document.createElement('div');row.className='rank-row';const pos=i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}º`;row.innerHTML=`<div class="rank-pos">${pos}</div><div class="rank-name">${escapeHtml(p.name)}</div><div class="rank-score">${p.score}<small>${p.correct_count||0} acertos</small></div>`;box.appendChild(row)})
}
function renderFinal(s,teacher){
  stopTimers();answerLocked=false;show('final-screen');renderRanking('final-ranking',s.leaderboard||[]);renderPodium(s.leaderboard||[]);$('new-game').textContent=teacher?'CRIAR NOVA SALA':'SAIR';
}
function renderPodium(data){
  const p=$('podium');p.innerHTML='';const order=[[1,'p2','🥈'],[0,'p1','🥇'],[2,'p3','🥉']];order.forEach(([idx,cl,medal])=>{const x=data[idx];if(!x)return;const el=document.createElement('div');el.className=`podium-item ${cl}`;el.innerHTML=`<b>${medal}</b><span>${escapeHtml(x.name)}</span><small>${x.score} pts</small>`;p.appendChild(el)})
}
async function startGame(){const h=JSON.parse(sessionStorage.getItem('logic_host')||'{}');$('start-game').disabled=true;try{const s=await rpc('quiz_host_start',{p_pin:h.pin,p_host_token:h.token});renderState(s,true)}catch(e){toast(e.message);$('start-game').disabled=false}}
async function nextQuestion(){const h=JSON.parse(sessionStorage.getItem('logic_host')||'{}');$('next-question').disabled=true;try{const s=await rpc('quiz_host_next',{p_pin:h.pin,p_host_token:h.token});renderState(s,true)}catch(e){toast(e.message)}finally{$('next-question').disabled=false}}
function reset(){stopPolling();stopTimers();if(isTeacher){sessionStorage.removeItem('logic_host');show('teacher-home');$('create-room').disabled=false}else{sessionStorage.removeItem('logic_player');show('student-home');$('join-form').reset();$('join-form').querySelector('button').disabled=false}}
function escapeHtml(v){return v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

$('create-room').addEventListener('click',createRoom);$('join-form').addEventListener('submit',joinRoom);$('start-game').addEventListener('click',startGame);$('next-question').addEventListener('click',nextQuestion);$('new-game').addEventListener('click',reset);$('join-pin').addEventListener('input',e=>e.target.value=e.target.value.replace(/\D/g,'').slice(0,6));

(function boot(){
  if(isTeacher){const h=sessionStorage.getItem('logic_host');if(h){try{return renderTeacherSession(JSON.parse(h))}catch{sessionStorage.removeItem('logic_host')}}show('teacher-home')}
  else{const p=sessionStorage.getItem('logic_player');if(p){try{return renderStudentSession(JSON.parse(p))}catch{sessionStorage.removeItem('logic_player')}}show('student-home')}
})();