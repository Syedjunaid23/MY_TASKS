(function(){
"use strict";
const SUPABASE_URL = "https://gphhqduzfpvcqatfuviq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_juaQo-1G66hHWvNN7KcvaA_RZ61YSjr";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const $ = s => document.querySelector(s);
let session = null;
let user = null;
let mission = null;
let tasks = [];
let today = null;
let history = [];
let projects = [];
let editingProjectId = null;


function fmtMinutes(m){ m=Number(m)||0; return m>=60 ? `${Math.floor(m/60)}h${m%60?` ${m%60}m`:""}` : `${m}m`; }
function dateKeyInIST(date=new Date()){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value])); return `${p.year}-${p.month}-${p.day}`;
}
function dateFromKey(k){ const [y,m,d]=k.split("-").map(Number); return new Date(Date.UTC(y,m-1,d,12)); }
function addDays(k,n){ const d=dateFromKey(k); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
function daysBetween(a,b){ return Math.round((dateFromKey(b)-dateFromKey(a))/86400000); }
function formatDate(k,opts={weekday:"long",day:"numeric",month:"long",year:"numeric"}){ return dateFromKey(k).toLocaleDateString("en-IN",opts); }
function isHoliday(k){ return false; }
function missionDayNumber(k){ if(!mission)return null; return daysBetween(mission.start_date,k)+1; }
function totalMinutesFor(k){ return tasks.filter(t=>isTaskScheduled(t,k)).reduce((s,t)=>s+Number(t.minutes),0); }
function isTaskScheduled(t,k){ return t.active!==false; }

function showToast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),1800); }
function setAuthMessage(msg,error=false){ const e=$("#authMessage"); e.textContent=msg; e.className=`auth-message ${error?"error":""}`; }

function updateClock(){
  const now=new Date();
  $("#clock").textContent=now.toLocaleTimeString("en-IN",{hour12:false,timeZone:"Asia/Kolkata"});
  $("#todayDate").textContent=now.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Asia/Kolkata"});
}
setInterval(updateClock,1000); updateClock();

async function ensureMission(){
  const {data,error}=await supabase.from("missions").select("id,user_id,start_date,created_at").eq("user_id",user.id).order("id",{ascending:true}).limit(1).maybeSingle();
  if(error) throw error;
  if(data){ mission=data; return; }
  const start=dateKeyInIST();
  const ins=await supabase.from("missions").insert({user_id:user.id,start_date:start}).select().single();
  if(ins.error) throw ins.error; mission=ins.data;
}

async function loadTasks(){
  const r=await supabase.from("tasks").select("id,name,weekday_minutes,holiday_minutes,sort_order,active,user_id").eq("user_id",user.id).order("sort_order");
  if(r.error) throw r.error;
  tasks=(r.data||[]).filter(t=>t.active!==false).map(t=>({id:t.id,name:t.name,minutes:0,weekday:Number(t.weekday_minutes)||0,holiday:Number(t.holiday_minutes ?? t.weekday_minutes)||0,sort_order:Number(t.sort_order)||0,active:t.active!==false}));
}

async function getDay(date){
  const dayNo=missionDayNumber(date);
  if(dayNo<1 || dayNo>100) return {date,tasks:[],completedTasks:0,totalTasks:0,completedMinutes:0,totalMinutes:0,percent:0,completed:false,notes:"",isHolidayPlan:false};
  const [dt,nt,ct]=await Promise.all([
    supabase.from("daily_tasks").select("task_id,completed").eq("user_id",user.id).eq("task_date",date),
    supabase.from("daily_notes").select("notes").eq("user_id",user.id).eq("task_date",date).maybeSingle(),
    supabase.from("completed_days").select("completed").eq("user_id",user.id).eq("task_date",date).maybeSingle()
  ]);
  if(dt.error||nt.error||ct.error) throw (dt.error||nt.error||ct.error);
  const completedMap=Object.fromEntries((dt.data||[]).map(x=>[x.task_id,!!x.completed]));
  const holiday=isHoliday(date);
  const dayTasks=tasks.filter(t=>isTaskScheduled(t,date)).map(t=>({...t,minutes:holiday?t.holiday:t.weekday,completed:!!completedMap[t.id]}));
  const completedTasks=dayTasks.filter(t=>t.completed).length;
  const completedMinutes=dayTasks.filter(t=>t.completed).reduce((s,t)=>s+t.minutes,0);
  const totalMinutes=dayTasks.reduce((s,t)=>s+t.minutes,0);
  const percent=totalMinutes?Math.round(completedMinutes/totalMinutes*100):0;
  return {date,tasks:dayTasks,completedTasks,totalTasks:dayTasks.length,completedMinutes,totalMinutes,percent,completed:!!ct.data?.completed,notes:nt.data?.notes||"",isHolidayPlan:holiday};
}

async function getHistory(){
  const [dt,nt,ct]=await Promise.all([
    supabase.from("daily_tasks").select("task_date,task_id,completed").eq("user_id",user.id),
    supabase.from("daily_notes").select("task_date,notes").eq("user_id",user.id),
    supabase.from("completed_days").select("task_date,completed").eq("user_id",user.id)
  ]);
  if(dt.error||nt.error||ct.error) throw (dt.error||nt.error||ct.error);
  const end=dateKeyInIST(); const start=mission.start_date;
  const doneMap=Object.fromEntries((ct.data||[]).map(x=>[x.task_date,!!x.completed]));
  const noteMap=Object.fromEntries((nt.data||[]).map(x=>[x.task_date,x.notes||""]));
  const taskMap={};
  for(const x of dt.data||[]){ (taskMap[x.task_date] ||= {})[x.task_id]=!!x.completed; }
  const rows=[];
  for(let i=0;i<100;i++){
    const date=addDays(start,i); if(date>end) break;
    const holiday=isHoliday(date);
    const dayTasks=tasks.filter(t=>isTaskScheduled(t,date)).map(t=>({id:t.id,name:t.name,minutes:holiday?t.holiday:t.weekday,completed:!!taskMap[date]?.[t.id]}));
    const totalTasks=dayTasks.length, completedTasks=dayTasks.filter(t=>t.completed).length;
    const totalMinutes=dayTasks.reduce((s,t)=>s+t.minutes,0), completedMinutes=dayTasks.filter(t=>t.completed).reduce((s,t)=>s+t.minutes,0);
    rows.push({date,tasks:dayTasks,totalTasks,completedTasks,totalMinutes,completedMinutes,percent:totalMinutes?Math.round(completedMinutes/totalMinutes*100):0,completed:!!doneMap[date],notes:noteMap[date]||"",isHolidayPlan:holiday});
  }
  return rows;
}


function renderSetupSummary(){
  const s=$("#setupChecklistSummary");
  if(s) s.textContent=tasks.length?`${tasks.length} custom task${tasks.length===1?"":"s"} configured.`:"No tasks yet. Use “Edit checklist” to add your own.";
  const m=$("#setupMissionSummary");
  if(m&&mission?.start_date) m.textContent=`Starts ${formatDate(mission.start_date,{day:"numeric",month:"long",year:"numeric"})}.`;
}
function openChecklistModal(){
  renderTaskManager(); $("#checklistModal").classList.add("open"); $("#checklistModal").setAttribute("aria-hidden","false");
}
function closeChecklistModal(){ $("#checklistModal").classList.remove("open"); $("#checklistModal").setAttribute("aria-hidden","true"); }
function renderTaskManager(){
  const box=$("#taskManagerList"); if(!box)return;
  if(!tasks.length){ box.innerHTML='<div class="projects-empty"><b>Your checklist is empty</b><span>Add your first task. You decide the name and time.</span></div>'; return; }
  box.innerHTML=tasks.map((t,i)=>`<div class="task-manager-row" data-task-id="${escapeHtml(t.id)}">
    <div class="task-manager-top"><input class="task-manager-name" value="${escapeHtml(t.name)}" maxlength="100" aria-label="Task name"><button class="secondary task-delete" type="button">Delete</button></div>
    <div class="task-time-grid"><label>Daily time<input class="task-weekday-hours" type="number" min="0" max="9999" value="${Math.floor(t.weekday/60)}"><small>hours</small></label><label>Minutes<input class="task-weekday-minutes" type="number" min="0" max="59" value="${t.weekday%60}"><small>minutes</small></label></div>
    <div class="task-manager-row-actions"><button class="secondary task-up" type="button" ${i===0?'disabled':''}>↑</button><button class="secondary task-down" type="button" ${i===tasks.length-1?'disabled':''}>↓</button><button class="primary task-save" type="button">Save task</button></div>
  </div>`).join("");
  box.querySelectorAll('.task-save').forEach(b=>b.addEventListener('click',()=>saveManagedTask(b.closest('.task-manager-row'))));
  box.querySelectorAll('.task-delete').forEach(b=>b.addEventListener('click',()=>deleteManagedTask(b.closest('.task-manager-row').dataset.taskId)));
  box.querySelectorAll('.task-up').forEach(b=>b.addEventListener('click',()=>moveManagedTask(b.closest('.task-manager-row').dataset.taskId,-1)));
  box.querySelectorAll('.task-down').forEach(b=>b.addEventListener('click',()=>moveManagedTask(b.closest('.task-manager-row').dataset.taskId,1)));
}
function readTaskTime(row){
  const h=Math.max(0,parseInt(row.querySelector('.task-weekday-hours').value,10)||0);
  const m=Math.max(0,parseInt(row.querySelector('.task-weekday-minutes').value,10)||0);
  return h*60+Math.min(59,m);
}
async function saveManagedTask(row){
  const id=row.dataset.taskId, name=row.querySelector('.task-manager-name').value.trim(), minutes=readTaskTime(row);
  if(!name){alert('Enter a task name.');return;} if(minutes<=0){alert('Set a time greater than 0 minutes.');return;}
  const r=await supabase.from('tasks').update({name,weekday_minutes:minutes,holiday_minutes:minutes,active:true}).eq('id',id).eq('user_id',user.id);
  if(r.error){alert('Could not save task: '+r.error.message);return;}
  await loadTasks(); renderToday(); renderTaskManager(); renderSetupSummary(); await refreshStats(); showToast('Task updated');
}
async function addManagedTask(){
  const nextOrder=tasks.reduce((m,t)=>Math.max(m,Number(t.sort_order)||0),-1)+1;
  const name=prompt('Task name'); if(name===null)return; const clean=name.trim(); if(!clean)return;
  const minsText=prompt('Time in minutes'); if(minsText===null)return; const mins=Math.max(0,parseInt(minsText,10)||0); if(mins<=0){alert('Time must be greater than 0 minutes.');return;}
  const r=await supabase.from('tasks').insert({user_id:user.id,name:clean,weekday_minutes:mins,holiday_minutes:mins,sort_order:nextOrder,active:true}).select().single();
  if(r.error){alert('Could not add task: '+r.error.message);return;}
  await loadTasks(); renderToday(); renderTaskManager(); renderSetupSummary(); await refreshStats(); showToast('Task added');
}
async function deleteManagedTask(id){
  const t=tasks.find(x=>String(x.id)===String(id)); if(!t)return;
  if(!confirm(`Remove "${t.name}" from your checklist? Existing completion records are kept.`))return;
  const r=await supabase.from('tasks').update({active:false}).eq('id',id).eq('user_id',user.id);
  if(r.error){alert('Could not remove task: '+r.error.message);return;}
  await loadTasks(); renderToday(); renderTaskManager(); renderSetupSummary(); await refreshStats(); showToast('Task removed');
}
async function moveManagedTask(id,delta){
  const ordered=[...tasks].sort((a,b)=>a.sort_order-b.sort_order), idx=ordered.findIndex(x=>String(x.id)===String(id)), target=idx+delta;
  if(idx<0||target<0||target>=ordered.length)return;
  const a=ordered[idx], b=ordered[target], aOrder=a.sort_order, bOrder=b.sort_order;
  const r1=await supabase.from('tasks').update({sort_order:bOrder}).eq('id',a.id).eq('user_id',user.id);
  if(r1.error){alert('Could not reorder task: '+r1.error.message);return;}
  const r2=await supabase.from('tasks').update({sort_order:aOrder}).eq('id',b.id).eq('user_id',user.id);
  if(r2.error){alert('Could not reorder task: '+r2.error.message);return;}
  await loadTasks(); renderTaskManager(); renderToday(); showToast('Order updated');
}
async function saveMissionStart(e){
  e.preventDefault(); const start=$("#missionStartDate").value; if(!start)return;
  const r=await supabase.from('missions').update({start_date:start}).eq('id',mission.id).eq('user_id',user.id);
  if(r.error){alert('Could not change mission start: '+r.error.message);return;}
  mission={...mission,start_date:start}; $("#missionModal").classList.remove('open'); $("#missionModal").setAttribute('aria-hidden','true');
  today=await getDay(dateKeyInIST()); renderToday(); renderSetupSummary(); await refreshStats(); showToast('Mission start updated');
}
function openMissionModal(){ $("#missionStartDate").value=mission?.start_date||dateKeyInIST(); $("#missionModal").classList.add('open'); $("#missionModal").setAttribute('aria-hidden','false'); }
function closeMissionModal(){ $("#missionModal").classList.remove('open'); $("#missionModal").setAttribute('aria-hidden','true'); }

function renderToday(){
  const dayNo=missionDayNumber(today.date);
  const beforeMission=dayNo<1, afterMission=dayNo>100;
  $("#planTitle").textContent=beforeMission?`Starts ${formatDate(mission.start_date,{day:"numeric",month:"short",year:"numeric"})}`:afterMission?"100-Day Mission Complete":(today.isHolidayPlan?"Holiday / Sunday Plan":"Normal Working-Day Plan");
  $("#planBadge").textContent=beforeMission?"UPCOMING":afterMission?"FINISHED":(today.isHolidayPlan?"HOLIDAY":"WORKDAY");
  $("#todayPercent").textContent=`${today.percent}%`;
  $(".ring").style.setProperty("--p",`${today.percent}%`);
  $("#todayTasks").textContent=`${today.completedTasks} / ${today.totalTasks} tasks`;
  $("#todayMinutes").textContent=`${fmtMinutes(today.completedMinutes)} / ${fmtMinutes(today.totalMinutes)}`;
  $("#notes").value=today.notes||"";
  $("#completeDayBtn").textContent=today.completed?"✓ Day completed":"Mark day complete";
  $("#checklistTitle").textContent=beforeMission?"Waiting to start":afterMission?"Mission finished":`Day ${dayNo} of 100`;
  const list=$("#taskList"); list.innerHTML="";
  if(beforeMission){ list.innerHTML=`<div class="projects-empty"><b>Your mission hasn't started yet.</b><span>Choose any start date from the ⚙ Mission button.</span></div>`; renderSetupSummary(); return; }
  if(afterMission){ list.innerHTML=`<div class="projects-empty"><b>Your 100-day mission is complete.</b><span>You can change the start date if you want to begin another 100-day run.</span></div>`; renderSetupSummary(); return; }
  if(!today.tasks.length){ list.innerHTML=`<div class="projects-empty"><b>Your checklist is empty.</b><span>Click ⚙ Edit checklist and add your own tasks and times.</span></div>`; renderSetupSummary(); return; }
  today.tasks.forEach(t=>{
    const row=document.createElement("label"); row.className=`task ${t.completed?"done":""}`;
    row.innerHTML=`<input type="checkbox" ${t.completed?"checked":""}><span class="task-name">${escapeHtml(t.name)}</span><span class="minutes">${fmtMinutes(t.minutes)}</span>`;
    row.querySelector("input").addEventListener("change",e=>toggleTask(t,e.target.checked)); list.appendChild(row);
  });
}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

async function toggleTask(t,completed){
  const r=await supabase.from("daily_tasks").upsert({user_id:user.id,task_date:today.date,task_id:t.id,completed,updated_at:new Date().toISOString()},{onConflict:"user_id,task_date,task_id"});
  if(r.error){alert(r.error.message); return;}
  today=await getDay(today.date); renderToday(); await refreshStats();
}

$("#completeDayBtn").addEventListener("click",async()=>{
  const completed=!today.completed;
  const r=await supabase.from("completed_days").upsert({user_id:user.id,task_date:today.date,completed,updated_at:new Date().toISOString()},{onConflict:"user_id,task_date"});
  if(r.error){alert(r.error.message);return;} today=await getDay(today.date); renderToday(); await refreshStats();
});

$("#saveNotes").addEventListener("click",async()=>{
  const notes=$("#notes").value;
  const r=await supabase.from("daily_notes").upsert({user_id:user.id,task_date:today.date,notes,updated_at:new Date().toISOString()},{onConflict:"user_id,task_date"});
  if(r.error){alert(r.error.message);return;} today.notes=notes; $("#saveNotes").textContent="Saved ✓"; setTimeout(()=>$("#saveNotes").textContent="Save note",1000);
});

async function refreshStats(){
  history=await getHistory();
  const completedDays=history.filter(x=>x.completed).length;
  $("#daysCompleted").textContent=Math.min(completedDays,100);
  $("#daysRemaining").textContent=Math.max(0,100-completedDays);
  $("#missionPercent").textContent=`${Math.min(100,completedDays)}%`;
  $("#missionBar").style.width=`${Math.min(100,completedDays)}%`;
  const totalTasks=history.reduce((s,x)=>s+x.totalTasks,0), doneTasks=history.reduce((s,x)=>s+x.completedTasks,0);
  $("#completionRate").textContent=totalTasks?`${Math.round(doneTasks/totalTasks*100)}%`:"0%";
  let streak=0; for(const x of [...history].reverse()){if(x.completed)streak++;else break;} $("#currentStreak").textContent=streak;
  renderHistory(); drawChart();
}

function renderHistory(){
  const box=$("#historyGrid"); box.innerHTML=""; const byDate=Object.fromEntries(history.map(x=>[x.date,x]));
  for(let i=0;i<100;i++){
    const date=addDays(mission.start_date,i), x=byDate[date];
    const cell=document.createElement("div"); cell.className=`day-cell ${x?.completed?"done":x?.percent>0?"partial":""}`;
    cell.title=`Day ${i+1} · ${date}: ${x?x.percent+"% task completion":"Not started"}`; cell.innerHTML=`<span>D${i+1}</span>`;
    if(x && date<=dateKeyInIST()) cell.addEventListener("click",()=>openDayModal(date)); box.appendChild(cell);
  }
}

function drawChart(){
  const chart=$("#progressChart"); if(!chart||!mission||!today)return; chart.innerHTML="";
  const byDate=Object.fromEntries(history.map(x=>[x.date,x])); byDate[today.date]=today;
  const days=Array.from({length:100},(_,i)=>{const date=addDays(mission.start_date,i); const row=byDate[date]; return {day:i+1,date,percent:Number(row?.percent??0),completed:!!row?.completed,recorded:date<=today.date,data:row,future:date>today.date};});
  const recorded=days.filter(x=>x.recorded), average=recorded.length?Math.round(recorded.reduce((s,x)=>s+x.percent,0)/recorded.length):0, best=recorded.reduce((a,x)=>!a||x.percent>a.percent?x:a,null);
  const NS="http://www.w3.org/2000/svg", width=100*48+30,height=310,left=48,right=20,top=20,bottom=48,plotW=width-left-right,plotH=height-top-bottom;
  const svg=document.createElementNS(NS,"svg"); svg.setAttribute("viewBox",`0 0 ${width} ${height}`); svg.setAttribute("width",width); svg.setAttribute("height",height);
  const add=(tag,attrs={},text="")=>{const e=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text)e.textContent=text;svg.appendChild(e);return e;};
  [100,75,50,25,0].forEach(v=>{const y=top+plotH*(1-v/100);add("line",{x1:left,y1:y,x2:width-right,y2:y,class:"chart-grid"});add("text",{x:left-8,y:y+4,class:"chart-axis chart-y"},`${v}%`);});
  days.forEach((p,i)=>{const slot=plotW/100,x=left+i*slot+slot*.18,barW=Math.max(14,slot*.64),clamped=Math.max(0,Math.min(100,p.percent)),barH=plotH*clamped/100,y=top+plotH-barH;add("rect",{x,y:top,width:barW,height:plotH,rx:5,class:"chart-bar-track"});if(p.recorded){const bar=add("rect",{x,y:y+(barH<3?plotH-3:0),width:barW,height:Math.max(3,barH),rx:5,class:`chart-bar ${p.completed?"complete":""} ${clamped===0?"empty":""}`});bar.style.cursor="pointer";bar.addEventListener("click",()=>openDayModal(p.date));if(clamped>0)add("text",{x:x+barW/2,y:Math.max(top+12,y-6),class:"chart-value"},`${clamped}%`);else add("text",{x:x+barW/2,y:top+plotH-8,class:"chart-value"},"0%");}if(p.date===today.date)add("rect",{x:x-3,y:top-3,width:barW+6,height:plotH+6,rx:7,class:"today-outline"});add("text",{x:x+barW/2,y:height-16,class:`chart-axis ${p.date===today.date?"today-label":""}`},`D${p.day}`);});
  chart.appendChild(svg);
  $("#chartStats").innerHTML=`<div><b>${recorded.length}</b><span>days recorded</span></div><div><b>${average}%</b><span>average work</span></div><div><b>${best?best.percent+"%":"—"}</b><span>${best?"best day · D"+best.day:"best day"}</span></div><div><b>${today.percent}%</b><span>today · D${missionDayNumber(today.date)}</span></div>`;
  requestAnimationFrame(()=>{const idx=days.findIndex(x=>x.date===today.date),scroll=$("#chartScroll");if(scroll&&idx>=0)scroll.scrollLeft=Math.max(0,(idx/100)*scroll.scrollWidth-scroll.clientWidth/2);});
}

async function openDayModal(date){
  const d=history.find(x=>x.date===date) || await getDay(date); if(!d)return;
  const dayNo=missionDayNumber(date); $("#modalKicker").textContent=dayNo<1?"BEFORE MISSION":`DAY ${Math.min(dayNo,100)} OF 100`;
  $("#modalTitle").textContent=formatDate(date); $("#modalSubtitle").textContent=d.isHolidayPlan?"Holiday / Sunday Plan":"Normal Working-Day Plan";
  $("#modalStats").innerHTML=`<div><b>${d.percent}%</b><span>work completed</span></div><div><b>${d.completedTasks}/${d.totalTasks}</b><span>tasks finished</span></div><div><b>${fmtMinutes(d.completedMinutes)}</b><span>study time</span></div><div><b>${d.completed?"✓":"—"}</b><span>${d.completed?"day completed":"day not completed"}</span></div>`;
  $("#modalProgressFill").style.width=`${d.percent}%`; $("#modalTaskCount").textContent=`${d.completedTasks} of ${d.totalTasks} complete`;
  $("#modalTasks").innerHTML=d.tasks.map(t=>`<div class="modal-task ${t.completed?"is-done":""}"><span class="task-status">${t.completed?"✓":"○"}</span><span>${escapeHtml(t.name)}</span><strong>${fmtMinutes(t.minutes)}</strong></div>`).join("");
  $("#modalNote").textContent=d.notes?.trim()||"No note recorded."; $("#dayModal").classList.add("open"); $("#dayModal").setAttribute("aria-hidden","false");
}
function closeDayModal(){$("#dayModal").classList.remove("open");$("#dayModal").setAttribute("aria-hidden","true");}
document.querySelectorAll("[data-close-modal]").forEach(e=>e.addEventListener("click",closeDayModal));document.addEventListener("keydown",e=>{if(e.key==="Escape")closeDayModal();});

async function exportBackup(){
  const [dt,nt,ct]=await Promise.all([supabase.from("daily_tasks").select("task_date,task_id,completed,updated_at").eq("user_id",user.id),supabase.from("daily_notes").select("task_date,notes,updated_at").eq("user_id",user.id),supabase.from("completed_days").select("task_date,completed,updated_at").eq("user_id",user.id)]);
  const backup={version:2,exportedAt:new Date().toISOString(),mission:{start_date:mission.start_date},daily_tasks:dt.data||[],daily_notes:nt.data||[],completed_days:ct.data||[]};
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`study-tracker-backup-${today.date}.json`;a.click();URL.revokeObjectURL(a.href);
}
$("#exportBtn").addEventListener("click",async()=>{try{await exportBackup();showToast("Backup exported");}catch(e){alert(e.message);}});

$("#importFile").addEventListener("change",async e=>{
  const file=e.target.files[0];if(!file)return;
  try{const b=JSON.parse(await file.text());if(!confirm("Restore this backup? Existing matching records will be updated."))return;
    if(b.daily_tasks?.length){const rows=b.daily_tasks.map(x=>({user_id:user.id,task_date:x.task_date,task_id:x.task_id,completed:!!x.completed,updated_at:new Date().toISOString()}));const r=await supabase.from("daily_tasks").upsert(rows,{onConflict:"user_id,task_date,task_id"});if(r.error)throw r.error;}
    if(b.daily_notes?.length){const rows=b.daily_notes.map(x=>({user_id:user.id,task_date:x.task_date,notes:x.notes||"",updated_at:new Date().toISOString()}));const r=await supabase.from("daily_notes").upsert(rows,{onConflict:"user_id,task_date"});if(r.error)throw r.error;}
    if(b.completed_days?.length){const rows=b.completed_days.map(x=>({user_id:user.id,task_date:x.task_date,completed:!!x.completed,updated_at:new Date().toISOString()}));const r=await supabase.from("completed_days").upsert(rows,{onConflict:"user_id,task_date"});if(r.error)throw r.error;}
    today=await getDay(today.date);renderToday();await refreshStats();showToast("Backup restored");
  }catch(err){alert("Could not restore backup: "+err.message);}finally{e.target.value="";}
});

["Focus","Phone","Review","Next"].forEach(name=>{const key=`booster${name}`,el=$("#"+key);el.addEventListener("change",()=>localStorage.setItem(`tracker-${today?.date}-${key}`,el.checked));});
function loadBoosters(){["Focus","Phone","Review","Next"].forEach(name=>{const key=`booster${name}`,el=$("#"+key);el.checked=localStorage.getItem(`tracker-${today.date}-${key}`)==="true";});}


async function loadProjects(){
  if(!user)return;
  const r=await supabase.from("projects").select("id,name,target_minutes,created_at,updated_at").eq("user_id",user.id).order("created_at",{ascending:true});
  if(r.error) throw r.error;
  projects=r.data||[];
  renderProjects();
}

function fmtProjectTime(m){
  m=Math.max(0,Number(m)||0);
  const h=Math.floor(m/60), mins=m%60;
  if(h && mins)return `${h}h ${mins}m`;
  if(h)return `${h}h`;
  return `${mins}m`;
}

function renderProjects(){
  const list=$("#projectsList");
  if(!list)return;
  if(!projects.length){
    list.innerHTML=`<div class="projects-empty"><b>No projects yet</b><span>Create your own private project and set its target time.</span></div>`;
    return;
  }
  list.innerHTML=projects.map(p=>`<div class="project-row" data-project-id="${escapeHtml(p.id)}">
    <div class="project-main"><span class="project-dot"></span><div><b>${escapeHtml(p.name)}</b><span class="project-private">PRIVATE · ONLY YOU</span></div></div>
    <div class="project-meta"><span class="project-meta-label">TARGET TIME</span><strong>${fmtProjectTime(p.target_minutes)}</strong></div>
    <div class="project-actions"><button class="secondary project-edit" type="button">Edit</button><button class="secondary project-delete" type="button">Delete</button></div>
  </div>`).join("");
  list.querySelectorAll(".project-edit").forEach(btn=>btn.addEventListener("click",()=>openProjectModal(btn.closest(".project-row").dataset.projectId)));
  list.querySelectorAll(".project-delete").forEach(btn=>btn.addEventListener("click",()=>deleteProject(btn.closest(".project-row").dataset.projectId)));
}

function openProjectModal(id=null){
  editingProjectId=id;
  const p=id?projects.find(x=>String(x.id)===String(id)):null;
  $("#projectModalTitle").textContent=p?"Edit project":"Create new project";
  $("#projectName").value=p?.name||"";
  const total=Math.max(0,Number(p?.target_minutes)||0);
  $("#projectHours").value=Math.floor(total/60);
  $("#projectMinutes").value=total%60;
  $("#projectModal").classList.add("open");
  $("#projectModal").setAttribute("aria-hidden","false");
  setTimeout(()=>$("#projectName").focus(),0);
}

function closeProjectModal(){
  editingProjectId=null;
  $("#projectModal").classList.remove("open");
  $("#projectModal").setAttribute("aria-hidden","true");
}

async function saveProject(e){
  e.preventDefault();
  const name=$("#projectName").value.trim();
  let hours=Math.max(0,parseInt($("#projectHours").value,10)||0);
  let minutes=Math.max(0,parseInt($("#projectMinutes").value,10)||0);
  if(minutes>59){hours+=Math.floor(minutes/60);minutes%=60;}
  const target_minutes=hours*60+minutes;
  if(!name){return;}
  if(target_minutes<=0){alert("Set a target time greater than 0 minutes.");return;}
  const btn=$("#projectForm button[type=submit]");
  btn.disabled=true;
  try{
    let r;
    if(editingProjectId){
      r=await supabase.from("projects").update({name,target_minutes,updated_at:new Date().toISOString()}).eq("id",editingProjectId).eq("user_id",user.id);
    }else{
      r=await supabase.from("projects").insert({user_id:user.id,name,target_minutes}).select("id,name,target_minutes,created_at,updated_at").single();
    }
    if(r.error)throw r.error;
    await loadProjects();
    closeProjectModal();
    showToast(editingProjectId?"Project updated":"Project created");
  }catch(err){alert("Could not save project: "+err.message);}
  finally{btn.disabled=false;}
}

async function deleteProject(id){
  const p=projects.find(x=>String(x.id)===String(id));
  if(!p)return;
  if(!confirm(`Delete project "${p.name}"?`))return;
  const r=await supabase.from("projects").delete().eq("id",id).eq("user_id",user.id);
  if(r.error){alert("Could not delete project: "+r.error.message);return;}
  await loadProjects();
  showToast("Project deleted");
}

$("#newProjectBtn").addEventListener("click",()=>openProjectModal());
$("#cancelProjectBtn").addEventListener("click",closeProjectModal);
$("#projectForm").addEventListener("submit",saveProject);
document.querySelectorAll("[data-close-project-modal]").forEach(e=>e.addEventListener("click",closeProjectModal));
document.addEventListener("keydown",e=>{if(e.key==="Escape" && $("#projectModal").classList.contains("open"))closeProjectModal();});

$("#manageChecklistBtn").addEventListener("click",openChecklistModal);
$("#addTaskBtn").addEventListener("click",addManagedTask);
$("#closeChecklistBtn").addEventListener("click",closeChecklistModal);
document.querySelectorAll("[data-close-checklist-modal]").forEach(e=>e.addEventListener("click",closeChecklistModal));
$("#missionSettingsBtn").addEventListener("click",openMissionModal);
$("#missionForm").addEventListener("submit",saveMissionStart);
$("#cancelMissionBtn").addEventListener("click",closeMissionModal);
document.querySelectorAll("[data-close-mission-modal]").forEach(e=>e.addEventListener("click",closeMissionModal));

$("#authForm").addEventListener("submit",async e=>{
  e.preventDefault();
  e.stopPropagation();
  const btn=$('#authForm button[type="submit"]');
  const email=$("#authEmail").value.trim();
  const password=$("#authPassword").value;
  setAuthMessage("Signing in…");
  if(btn) btn.disabled=true;
  try{
    if(!email || !password){
      setAuthMessage("Enter your email and password.",true);
      return;
    }
    const r=await supabase.auth.signInWithPassword({email,password});
    if(r.error){
      setAuthMessage(r.error.message,true);
      return;
    }
    if(!r.data || !r.data.session){
      setAuthMessage("Login did not create a session. Please try again.",true);
      return;
    }
    setAuthMessage("Signed in successfully.");
  }catch(err){
    console.error("Login error:",err);
    setAuthMessage(err && err.message ? err.message : "Could not sign in. Check your connection and try again.",true);
  }finally{
    if(btn) btn.disabled=false;
  }
});
$("#resetPasswordBtn").addEventListener("click",async()=>{const email=$("#authEmail").value.trim();if(!email){setAuthMessage("Enter your email first.",true);return;}const r=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.href});setAuthMessage(r.error?r.error.message:"Password reset email sent.",!!r.error);});
$("#signUpBtn").addEventListener("click",async()=>{
  const email=$("#authEmail").value.trim();
  const password=$("#authPassword").value;
  if(!email || !password){
    setAuthMessage("Enter an email and password first.",true);
    return;
  }
  if(password.length < 6){
    setAuthMessage("Password must be at least 6 characters.",true);
    return;
  }
  setAuthMessage("Creating your account…");
  try{
    const r=await supabase.auth.signUp({email,password});
    if(r.error){
      setAuthMessage(r.error.message,true);
      return;
    }
    if(r.data && r.data.session){
      setAuthMessage("Account created. Signing you in…");
    }else{
      setAuthMessage("Account created. Check your email to confirm it, then sign in.");
    }
  }catch(err){
    console.error("Sign-up error:",err);
    setAuthMessage(err && err.message ? err.message : "Could not create the account.",true);
  }
});
$("#signOutBtn").addEventListener("click",()=>supabase.auth.signOut());

async function startApp(s){
  session=s;user=s.user;$("#authScreen").classList.add("hidden");$("#appShell").classList.remove("hidden");
  try{await ensureMission();await loadTasks();try{await loadProjects();}catch(projectErr){console.error("Projects unavailable",projectErr);projects=[];renderProjects();}today=await getDay(dateKeyInIST());loadBoosters();renderToday();renderSetupSummary();await refreshStats();}
  catch(e){console.error(e);alert("Could not load your tracker. "+e.message);}
}
function stopApp(){session=null;user=null;mission=null;tasks=[];projects=[];editingProjectId=null;today=null;history=[];$("#appShell").classList.add("hidden");$("#authScreen").classList.remove("hidden");}

supabase.auth.onAuthStateChange(async(_event,s)=>{if(s)await startApp(s);else stopApp();});
(async()=>{const r=await supabase.auth.getSession();if(r.data.session)await startApp(r.data.session);})();
setInterval(async()=>{if(!user||!today)return;const freshDate=dateKeyInIST();if(freshDate!==today.date){today=await getDay(freshDate);loadBoosters();renderToday();await refreshStats();}},30000);

})();
