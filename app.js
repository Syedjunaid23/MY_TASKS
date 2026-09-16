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
let selectedDate = null;
let viewLoadToken = 0;
let history = [];
let allTasks = [];
let customTaskIds = [];
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
function isHoliday(k){ const d=dateFromKey(k); const dow=d.getUTCDay(); if(dow===0)return true; if(dow===6){ const day=d.getUTCDate(); return day>=8&&day<=14; } return false; }
function isWeekend(k){ const dow=dateFromKey(k).getUTCDay(); return dow===0 || dow===6; }
function dayIndex(k){ return dateFromKey(k).getUTCDay(); }
function missionDayNumber(k){ if(!mission)return null; return daysBetween(mission.start_date,k)+1; }
function totalMinutesFor(k){ return tasks.filter(t=>isTaskScheduled(t,k)).reduce((s,t)=>s+Number(taskMinutesForDate(t,k)),0); }
const LEGACY_HOLIDAY_NAMES = new Set(["Python", "C#", "BIM ISO", "OpenFOAM", "C++", "Git", "SUB"]);
function isTaskScheduled(t,k){
  if(t.custom){ const idx=dayIndex(k); return Array.isArray(t.repeatDays) && t.repeatDays.includes(idx) && Number(taskMinutesForDate(t,k))>0; }
  return (isHoliday(k) ? LEGACY_HOLIDAY_NAMES.has(t.name) : true);
}
function taskMinutesForDate(t,k){
  if(!t.custom) return Number(isHoliday(k) ? t.holiday : t.weekday) || 0;
  return Number(isWeekend(k) ? (t.weekendMinutes ?? t.holiday ?? t.weekday) : t.weekday) || 0;
}

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

function normalizeTaskId(id){
  const text=String(id ?? "");
  return /^\d+$/.test(text) ? Number(text) : text;
}

async function loadTasks(){
  const r=await supabase.rpc("tracker_list_tasks");
  if(r.error) throw r.error;
  const rows=Array.isArray(r.data) ? r.data : [];
  allTasks=rows
    .filter(t=>t.active !== false)
    .map(t=>({
      id:normalizeTaskId(t.id),
      name:t.name,
      weekday:Number(t.weekday_minutes)||0,
      holiday:Number(t.holiday_minutes ?? t.weekday_minutes)||0,
      weekendMinutes:Number(t.weekend_minutes ?? t.holiday_minutes ?? t.weekday_minutes)||0,
      projectId:t.project_id==null?null:String(t.project_id),
      projectName:t.project_name||null,
      repeatDays:Array.isArray(t.repeat_days)?t.repeat_days.map(Number):[0,1,2,3,4,5,6],
      sort_order:Number(t.sort_order)||0,
      custom:String(t.user_id||"")===String(user.id)
    }));
  tasks=allTasks.filter(t=>t.custom).sort((a,b)=>a.sort_order-b.sort_order);
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
  const weekend=isWeekend(date);
  const dayTasks=tasks.filter(t=>isTaskScheduled(t,date)).map(t=>({...t,minutes:taskMinutesForDate(t,date),completed:!!completedMap[t.id]}));
  const completedTasks=dayTasks.filter(t=>t.completed).length;
  const completedMinutes=dayTasks.filter(t=>t.completed).reduce((s,t)=>s+t.minutes,0);
  const totalMinutes=dayTasks.reduce((s,t)=>s+t.minutes,0);
  const percent=totalMinutes?Math.round(completedMinutes/totalMinutes*100):0;
  return {date,tasks:dayTasks,completedTasks,totalTasks:dayTasks.length,completedMinutes,totalMinutes,percent,completed:!!ct.data?.completed,notes:nt.data?.notes||"",isHolidayPlan:holiday,isWeekendPlan:weekend};
}

async function getHistory(){
  const [dt,nt,ct]=await Promise.all([
    supabase.from("daily_tasks").select("task_date,task_id,completed").eq("user_id",user.id),
    supabase.from("daily_notes").select("task_date,notes").eq("user_id",user.id),
    supabase.from("completed_days").select("task_date,completed").eq("user_id",user.id)
  ]);
  if(dt.error||nt.error||ct.error) throw (dt.error||nt.error||ct.error);
  const realToday=dateKeyInIST(); const end=selectedDate && selectedDate>realToday ? selectedDate : realToday; const start=mission.start_date;
  const doneMap=Object.fromEntries((ct.data||[]).map(x=>[x.task_date,!!x.completed]));
  const noteMap=Object.fromEntries((nt.data||[]).map(x=>[x.task_date,x.notes||""]));
  const taskMap={}; for(const x of dt.data||[]){(taskMap[x.task_date] ||= {})[x.task_id]=!!x.completed;}
  const transition=localStorage.getItem(`tracker-custom-start-${user.id}`) || null;
  const customSnapshot=loadCustomTaskSnapshot();
  const customHistoryTasks=Object.values(customSnapshot);
  const rows=[];
  for(let i=0;i<100;i++){
    const date=addDays(start,i); if(date>end) break;
    const useCustom=!!transition && date>=transition;
    const source=useCustom?customHistoryTasks.filter(t=>!t.createdDate || date>=t.createdDate):allTasks.filter(t=>!t.custom);
    const holiday=isHoliday(date);
    const dayTasks=source.filter(t=>isTaskScheduled(t,date)).map(t=>({id:t.id,name:t.name,minutes:taskMinutesForDate(t,date),completed:!!taskMap[date]?.[t.id]}));
    const totalTasks=dayTasks.length, completedTasks=dayTasks.filter(t=>t.completed).length;
    const totalMinutes=dayTasks.reduce((s,t)=>s+t.minutes,0), completedMinutes=dayTasks.filter(t=>t.completed).reduce((s,t)=>s+t.minutes,0);
    rows.push({date,tasks:dayTasks,totalTasks,completedTasks,totalMinutes,completedMinutes,percent:totalMinutes?Math.round(completedMinutes/totalMinutes*100):0,completed:!!doneMap[date],notes:noteMap[date]||"",isHolidayPlan:holiday});
  }
  return rows;
}

function renderDayNavigator({dayNo,workingAhead,beforeMission,afterMission,realToday}){
  const box=$("#dayNav"); if(!box)return;
  if(beforeMission||afterMission){box.innerHTML="";box.hidden=true;return;}
  const canPrev=dayNo>1, canNext=dayNo<100;
  const canAdvance=Number(today?.percent||0)>=100;
  box.hidden=false;

  if(!workingAhead){
    if(canAdvance && canNext){
      box.innerHTML=`<div class="day-nav-status"><span class="day-nav-dot"></span><span>Next day unlocked</span></div><button id="workAheadBtn" class="day-nav-link primary" type="button">Open Day ${dayNo+1} →</button>`;
    }else{
      box.innerHTML=`<div class="day-nav-status"><span class="day-nav-dot"></span><span>${canNext?"Finish today to unlock the next day":"Mission complete"}</span></div>`;
    }
  }else{
    box.innerHTML=`<div class="day-nav-status"><span class="day-nav-dot"></span><span>Working ahead · Day ${dayNo}</span></div><div class="day-nav-actions">
      <button id="backToTodayBtn" class="day-nav-link secondary" type="button">Today</button>
      ${canPrev?'<button id="prevDayBtn" class="day-nav-link secondary" type="button">←</button>':""}
      ${canNext?'<button id="nextDayBtn" class="day-nav-link primary" type="button">Next →</button>':""}
    </div>`;
  }
  $("#backToTodayBtn")?.addEventListener("click",()=>selectMissionDate(realToday));
  $("#workAheadBtn")?.addEventListener("click",()=>selectMissionDate(addDays(today.date,1)));
  $("#nextDayBtn")?.addEventListener("click",()=>selectMissionDate(addDays(today.date,1)));
  $("#prevDayBtn")?.addEventListener("click",()=>selectMissionDate(addDays(today.date,-1)));
}
async function selectMissionDate(date){
  const n=missionDayNumber(date);
  if(n<1||n>100){showToast("Choose a date inside the 100-day mission");return;}
  const token=++viewLoadToken;
  selectedDate=date;
  if(user) localStorage.setItem(`tracker-selected-date-${user.id}`,date);
  const nextDay=await getDay(date);
  if(token!==viewLoadToken || selectedDate!==date)return;
  today=nextDay;
  loadBoosters();
  renderToday();
  await refreshStats();
}
function renderToday(){
  const dayNo=missionDayNumber(today.date);
  const realToday=dateKeyInIST();
  const workingAhead=today.date>realToday;
  const beforeMission=dayNo<1, afterMission=dayNo>100;
  $("#planTitle").textContent=beforeMission?`Starts ${formatDate(mission.start_date,{day:"numeric",month:"short",year:"numeric"})}`:afterMission?"100-Day Mission Complete":(today.isWeekendPlan?"Weekend Plan":"Normal Working-Day Plan");
  $("#planBadge").textContent=beforeMission?"UPCOMING":afterMission?"FINISHED":workingAhead?"WORK AHEAD":(today.isWeekendPlan?"WEEKEND":"WORKDAY");
  $("#todayPercent").textContent=`${today.percent}%`;
  $(".ring").style.setProperty("--p",`${today.percent}%`);
  $("#todayTasks").textContent=`${today.completedTasks} / ${today.totalTasks} tasks`;
  $("#todayMinutes").textContent=`${fmtMinutes(today.completedMinutes)} / ${fmtMinutes(today.totalMinutes)}`;
  $("#notes").value=today.notes||"";
  $("#completeDayBtn").textContent=today.completed?"✓ Day completed":today.percent===100?"Mark day complete":"Finish all tasks";
  $("#completeDayBtn").disabled=!!today.completed || today.percent<100 || today.totalTasks===0;
  renderDayNavigator({dayNo,workingAhead,beforeMission,afterMission,realToday});
  $("#checklistTitle").textContent=beforeMission?"Not started":afterMission?"Mission complete":workingAhead?`Day ${dayNo} of 100 · Ahead`:`Day ${dayNo} of 100`;
  const list=$("#taskList"); list.innerHTML="";
  if(beforeMission){list.innerHTML=`<div class="projects-empty"><b>Your mission hasn't started yet.</b><span>Choose any start date from the ⚙ Mission button.</span></div>`;renderSetupSummary();return;}
  if(afterMission){list.innerHTML=`<div class="projects-empty"><b>Your 100-day mission is complete.</b><span>Choose a new start date from the ⚙ Mission button to begin another run.</span></div>`;renderSetupSummary();return;}
  if(!today.tasks.length){list.innerHTML=`<div class="projects-empty"><b>Your daily checklist is empty.</b><span>Click ⚙ Edit checklist and add your own tasks and times.</span></div>`;renderSetupSummary();return;}
  today.tasks.forEach(t=>{
    const row=document.createElement("label"); row.className=`task ${t.completed?"done":""}`;
    row.innerHTML=`<input type="checkbox" ${t.completed?"checked":""}><span class="task-name">${escapeHtml(t.name)}${t.projectName?` <span class="task-project-badge">@ ${escapeHtml(t.projectName)}</span>`:""}</span><span class="minutes">${fmtMinutes(t.minutes)}</span>`;
    row.querySelector("input").addEventListener("change",e=>toggleTask(t,e.target.checked)); list.appendChild(row);
  });
}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}


function renderSetupSummary(){
  const s=$("#setupChecklistSummary"); if(s) s.textContent=tasks.length?`${tasks.length} custom task${tasks.length===1?"":"s"} configured with repeat schedules.`:"Your checklist is empty. Add your own tasks.";
  const m=$("#setupMissionSummary"); if(m&&mission?.start_date) m.textContent=`Starts ${formatDate(mission.start_date,{day:"numeric",month:"long",year:"numeric"})}.`;
}
function openChecklistModal(){
  clearNewTaskFields();
  renderTaskManager();
  window.refreshNewTaskProjectPicker?.();
  $("#checklistModal").classList.add("open");
  $("#checklistModal").setAttribute("aria-hidden","false");
  requestAnimationFrame(()=>{clearNewTaskFields();$("#newTaskName").focus();});
  setTimeout(clearNewTaskFields,150);
}
function closeChecklistModal(){$("#checklistModal").classList.remove("open");$("#checklistModal").setAttribute("aria-hidden","true");}
function repeatLabel(days){
  if(!Array.isArray(days)||!days.length)return "Never"; const names=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]; return days.slice().sort((a,b)=>a-b).map(d=>names[d]).join(" · ");
}

const DAY_NAMES=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const SCHEDULE_PRESETS={
  weekdays:[1,2,3,4,5],
  weekends:[0,6],
  every:[0,1,2,3,4,5,6],
  none:[]
};
function scheduleSummary(days){
  const d=Array.isArray(days)?days.slice().sort((a,b)=>a-b):[];
  if(d.join(",")==="1,2,3,4,5") return "Mon–Fri";
  if(d.join(",")==="0,6") return "Sat–Sun";
  if(d.join(",")==="0,1,2,3,4,5,6") return "Every day";
  return repeatLabel(d);
}
function renderCustomDayChips(container, days, cls="v14-day-chip"){
  if(!container)return;
  const selected=new Set(Array.isArray(days)?days:[]);
  container.innerHTML=DAY_NAMES.map((name,d)=>`<button type="button" class="${cls} ${selected.has(d)?"active":""}" data-day="${d}">${name}</button>`).join("");
}
function projectPickerHtml(selectedId){
  const options=[`<button type="button" class="project-choice ${!selectedId?"active":""}" data-project-choice="">No project</button>`];
  projects.forEach(p=>options.push(`<button type="button" class="project-choice ${String(selectedId||"")===String(p.id)?"active":""}" data-project-choice="${escapeHtml(p.id)}"><span>@</span>${escapeHtml(p.name)}</button>`));
  return options.join("");
}
function renderProjectChoices(container, selectedId){ if(container) container.innerHTML=projects.length?projectPickerHtml(selectedId):'<div class="projects-empty compact"><b>No projects yet</b><span>Create a project below the checklist first.</span></div>'; }
function renderTaskManager(){
  const box=$("#taskManagerList"); if(!box)return;
  if(!tasks.length){box.innerHTML='<div class="manager-empty"><b>No tasks yet</b><span>Add your first task above. Tasks repeat Mon–Fri by default.</span></div>'; const label=$("#taskCountLabel"); if(label) label.textContent="0 tasks"; return;}
  box.innerHTML=tasks.map((t,i)=>{
    const days=Array.isArray(t.repeatDays)?t.repeatDays:[1,2,3,4,5]; const hasWeekend=days.includes(0)||days.includes(6);
    return `<div class="task-manager-row" data-task-id="${escapeHtml(t.id)}" data-project-id="${escapeHtml(t.projectId||"")}">
      <div class="task-manager-mainline">
        <input class="task-manager-name" value="${escapeHtml(t.name)}" maxlength="100" aria-label="Task name" autocomplete="off">
        <input class="task-weekday-time compact-time" type="text" inputmode="numeric" value="${formatTimeInput(t.weekday)}" placeholder="1h" aria-label="Task time" autocomplete="off">
        <button class="secondary schedule-pill task-project-toggle" type="button" aria-expanded="false">@ <span>${escapeHtml(t.projectName||"No project")}</span></button>
        <button class="secondary schedule-pill task-schedule-toggle" type="button" aria-expanded="false">↻ <span>${escapeHtml(scheduleSummary(days))}</span></button>
        <button class="secondary task-delete" type="button" aria-label="Remove task">Remove</button>
      </div>
      <div class="task-manager-subline">
        <span class="task-mini-status">${hasWeekend?"Weekend enabled":"Weekdays"}</span>
        <label class="weekend-time-field" ${hasWeekend?"":"hidden"}>Weekend <input class="task-weekend-time" type="text" inputmode="numeric" value="${formatTimeInput(t.weekendMinutes)}" placeholder="1h" aria-label="Weekend time" autocomplete="off"></label>
        <div class="task-manager-row-actions"><button class="secondary task-up" type="button" ${i===0?'disabled':''}>↑</button><button class="secondary task-down" type="button" ${i===tasks.length-1?'disabled':''}>↓</button><button class="primary task-save" type="button">Save</button></div>
      </div>
      <div class="schedule-popover task-schedule-panel" hidden><div class="schedule-popover-title">Repeat this task</div><div class="schedule-preset-grid compact"><button type="button" class="schedule-preset" data-schedule-preset="weekdays">Mon–Fri</button><button type="button" class="schedule-preset" data-schedule-preset="weekends">Sat–Sun</button><button type="button" class="schedule-preset" data-schedule-preset="every">Every day</button><button type="button" class="schedule-preset" data-schedule-preset="custom">Choose days</button></div><div class="custom-days" hidden></div></div>
      <div class="schedule-popover task-project-panel" hidden><div class="schedule-popover-title">Link to a project</div><div class="project-picker-list"></div></div>
    </div>`;
  }).join("");
  const label=$("#taskCountLabel"); if(label) label.textContent=`${tasks.length} task${tasks.length===1?"":"s"}`;
  box.querySelectorAll(".task-save").forEach(b=>b.addEventListener("click",()=>saveManagedTask(b.closest(".task-manager-row"))));
  box.querySelectorAll(".task-delete").forEach(b=>b.addEventListener("click",()=>deleteManagedTask(b.closest(".task-manager-row").dataset.taskId)));
  box.querySelectorAll(".task-up").forEach(b=>b.addEventListener("click",()=>moveManagedTask(b.closest(".task-manager-row").dataset.taskId,-1)));
  box.querySelectorAll(".task-down").forEach(b=>b.addEventListener("click",()=>moveManagedTask(b.closest(".task-manager-row").dataset.taskId,1)));
  box.querySelectorAll(".task-manager-row").forEach(row=>{
    const task=tasks.find(t=>String(t.id)===String(row.dataset.taskId)); const panel=row.querySelector(".task-schedule-panel"); const summary=row.querySelector(".task-schedule-toggle span"); const selected=Array.isArray(task?.repeatDays)?task.repeatDays:[1,2,3,4,5];
    panel.dataset.selectedDays=selected.slice().sort((a,b)=>a-b).join(","); renderCustomDayChips(panel.querySelector(".custom-days"),selected); const key=Object.entries(SCHEDULE_PRESETS).find(([_,v])=>v.join(",")==selected.slice().sort((a,b)=>a-b).join(","))?.[0]||"custom"; panel.querySelectorAll(".schedule-preset").forEach(btn=>btn.classList.toggle("active",btn.dataset.schedulePreset===key)); panel.querySelector(".custom-days").hidden=key!=="custom";
    row.querySelector(".task-schedule-toggle").addEventListener("click",()=>{const opening=panel.hidden;document.querySelectorAll(".task-schedule-panel,.task-project-panel").forEach(x=>x.hidden=true);panel.hidden=!opening;row.querySelector(".task-schedule-toggle").setAttribute("aria-expanded",String(opening));});
    const syncWeekendField=()=>{const days=(panel.dataset.selectedDays||"").split(",").filter(Boolean).map(Number),field=row.querySelector(".weekend-time-field");if(field)field.hidden=!(days.includes(0)||days.includes(6));}; syncWeekendField();
    panel.querySelectorAll(".schedule-preset").forEach(btn=>btn.addEventListener("click",()=>{const p=btn.dataset.schedulePreset;if(p!=="custom"){const chosen=SCHEDULE_PRESETS[p].slice();panel.dataset.selectedDays=chosen.join(",");renderCustomDayChips(panel.querySelector(".custom-days"),chosen);panel.querySelector(".custom-days").hidden=true;summary.textContent=scheduleSummary(chosen);}else panel.querySelector(".custom-days").hidden=false;panel.querySelectorAll(".schedule-preset").forEach(x=>x.classList.toggle("active",x===btn));syncWeekendField();}));
    panel.querySelector(".custom-days").addEventListener("click",e=>{const chip=e.target.closest(".v14-day-chip");if(!chip)return;chip.classList.toggle("active");const chosen=[...panel.querySelectorAll(".v14-day-chip.active")].map(x=>Number(x.dataset.day)).sort((a,b)=>a-b);panel.dataset.selectedDays=chosen.join(",");summary.textContent=scheduleSummary(chosen);panel.querySelectorAll(".schedule-preset").forEach(x=>x.classList.toggle("active",x.dataset.schedulePreset==="custom"));syncWeekendField();});
    const projectPanel=row.querySelector(".task-project-panel"), projectButton=row.querySelector(".task-project-toggle"), projectSummary=projectButton.querySelector("span"); projectPanel.querySelector(".project-picker-list").innerHTML=projects.length?projectPickerHtml(task?.projectId):'<div class="projects-empty compact"><b>No projects yet</b><span>Create one in Projects first.</span></div>';
    projectButton.addEventListener("click",()=>{const opening=projectPanel.hidden;document.querySelectorAll(".task-schedule-panel,.task-project-panel").forEach(x=>x.hidden=true);projectPanel.hidden=!opening;projectButton.setAttribute("aria-expanded",String(opening));});
    projectPanel.addEventListener("click",e=>{const choice=e.target.closest(".project-choice");if(!choice)return;row.dataset.projectId=choice.dataset.projectChoice||"";const proj=projects.find(p=>String(p.id)===String(row.dataset.projectId));projectSummary.textContent=proj?.name||"No project";projectPanel.hidden=true;projectButton.setAttribute("aria-expanded","false");projectPanel.querySelectorAll(".project-choice").forEach(x=>x.classList.toggle("active",x===choice));});
  });
}
function getSelectedRepeatDays(row){
  const panel=row.querySelector(".task-schedule-panel");
  return panel ? panel.dataset.selectedDays.split(",").filter(Boolean).map(Number).sort((a,b)=>a-b) : [1,2,3,4,5];
}
function parseTimeInput(text){
  const raw=String(text||"").trim().toLowerCase();
  if(!raw)return 0;
  const h=(raw.match(/(\d+)\s*h/)||[])[1],m=(raw.match(/(\d+)\s*m/)||[])[1];
  if(h||m)return Math.max(0,(parseInt(h||"0",10)*60)+Math.min(59,parseInt(m||"0",10)));
  const n=parseInt(raw,10);
  return Number.isFinite(n)?Math.max(0,n):0;
}
function formatTimeInput(m){
  m=Math.max(0,Number(m)||0);
  const h=Math.floor(m/60),mins=m%60;
  if(h&&mins)return `${h}h ${mins}m`;
  if(h)return `${h}h`;
  return mins?`${mins}m`:"";
}
function saveCustomTaskSnapshot(task){
  const key=`tracker-custom-task-snapshot-${user.id}`;
  const rows=JSON.parse(localStorage.getItem(key)||"{}");
  const keyId=String(task.id);
  const previous=rows[keyId];
  rows[keyId]={id:task.id,name:task.name,weekday:Number(task.weekday)||0,holiday:Number(task.holiday)||0,weekendMinutes:Number(task.weekendMinutes??task.holiday??task.weekday)||0,projectId:task.projectId??null,projectName:task.projectName||null,repeatDays:Array.isArray(task.repeatDays)?task.repeatDays.slice():[0,1,2,3,4,5,6],sort_order:Number(task.sort_order)||0,createdDate:previous?.createdDate||dateKeyInIST(),custom:true};
  localStorage.setItem(key,JSON.stringify(rows));
}
function loadCustomTaskSnapshot(){try{return JSON.parse(localStorage.getItem(`tracker-custom-task-snapshot-${user.id}`)||"{}")}catch{return {}}}
async function saveManagedTask(row){
  const id=row.dataset.taskId;
  const name=row.querySelector(".task-manager-name").value.trim();
  const weekdayMinutes=parseTimeInput(row.querySelector(".task-weekday-time").value);
  const repeatDays=getSelectedRepeatDays(row);
  const weekendInput=row.querySelector(".task-weekend-time");
  const weekendMinutes=weekendInput?parseTimeInput(weekendInput.value):weekdayMinutes;
  const projectId=row.dataset.projectId||null;

  if(!name){showToast("Enter a task name");return;}
  if(!repeatDays.length){showToast("Choose at least one day");return;}
  const needsWeekday=repeatDays.some(d=>d>=1&&d<=5);
  const needsWeekend=repeatDays.some(d=>d===0||d===6);
  if(needsWeekday && weekdayMinutes<=0){showToast("Add a task time");return;}
  if(needsWeekend && weekendMinutes<=0){showToast("Add a weekend time");return;}

  const r=await supabase.rpc("tracker_update_task_schedule",{p_task_id:String(id),p_name:name,p_weekday_minutes:weekdayMinutes,p_weekend_minutes:needsWeekend?weekendMinutes:weekdayMinutes,p_repeat_days:repeatDays,p_project_id:projectId});
  if(r.error){showToast(`Could not save: ${r.error.message}`);return;}
  await loadTasks();
  const updated=tasks.find(t=>String(t.id)===String(id));
  if(updated)saveCustomTaskSnapshot(updated);
  today=await getDay(today.date);
  renderToday();renderTaskManager();renderSetupSummary();await refreshStats();
  showToast("Task saved");
}
function clearNewTaskFields(){
  const form=$("#addTaskForm"); if(form)form.reset();
  $("#newTaskName").value="";
  $("#newTaskTime").value="";
  const panel=$("#newTaskSchedulePanel");
  if(panel){
    panel.hidden=true;
    panel.dataset.selectedDays=SCHEDULE_PRESETS.weekdays.join(",");
    renderCustomDayChips($("#newTaskCustomDays"),SCHEDULE_PRESETS.weekdays);
    $("#newTaskCustomDays").hidden=true;
    panel.querySelectorAll("[data-new-preset]").forEach(b=>b.classList.toggle("active",b.dataset.newPreset==="weekdays"));
  }
  $("#newTaskScheduleSummary").textContent="Mon–Fri";
  $("#newTaskScheduleToggle")?.setAttribute("aria-expanded","false");
  const projectPanel=$("#newTaskProjectPanel"); if(projectPanel){projectPanel.hidden=true;projectPanel.dataset.selectedProjectId="";}
  $("#newTaskProjectSummary").textContent="No project"; window.refreshNewTaskProjectPicker?.();
  $("#newTaskProjectToggle")?.setAttribute("aria-expanded","false");
}
function getNewTaskRepeatDays(){
  return ($("#newTaskSchedulePanel")?.dataset.selectedDays||"1,2,3,4,5").split(",").filter(Boolean).map(Number).sort((a,b)=>a-b);
}
async function addManagedTask(e){
  e?.preventDefault();
  const name=$("#newTaskName").value.trim();
  const minutes=parseTimeInput($("#newTaskTime").value);
  const repeatDays=getNewTaskRepeatDays();
  const projectId=$("#newTaskProjectPanel")?.dataset.selectedProjectId || null;
  if(!name){showToast("Give the task a name");$("#newTaskName")?.focus();return;}
  if(minutes<=0){showToast("Add the time for this task");$("#newTaskTime")?.focus();return;}
  if(!repeatDays.length){showToast("Choose at least one day");return;}
  const maxOrder=tasks.reduce((m,t)=>Math.max(m,Number(t.sort_order)||0),0);
  const r=await supabase.rpc("tracker_create_task",{p_name:name,p_weekday_minutes:minutes,p_weekend_minutes:minutes,p_repeat_days:repeatDays,p_sort_order:maxOrder+1,p_project_id:projectId});
  if(r.error){showToast(`Could not add task: ${r.error.message}`);return;}
  const createdId=r.data?.id || r.data?.[0]?.id || null;
  if(!localStorage.getItem(`tracker-custom-start-${user.id}`)) localStorage.setItem(`tracker-custom-start-${user.id}`,dateKeyInIST());
  await loadTasks();
  tasks.forEach(saveCustomTaskSnapshot);
  today=await getDay(today.date);
  clearNewTaskFields();
  renderToday();renderTaskManager();renderSetupSummary();await refreshStats();
  const found=createdId==null || tasks.some(t=>String(t.id)===String(createdId));
  showToast(found?"Task added":"Task added — refresh to sync");
}
async function deleteManagedTask(id){
  const r=await supabase.rpc("tracker_delete_task",{p_task_id:String(id)});
  if(r.error){showToast(`Could not remove task: ${r.error.message}`);return;}
  await loadTasks();today=await getDay(today.date);renderToday();renderTaskManager();renderSetupSummary();await refreshStats();showToast("Task removed");
}
async function moveManagedTask(id,delta){
  const ordered=[...tasks].sort((a,b)=>a.sort_order-b.sort_order);
  const idx=ordered.findIndex(x=>String(x.id)===String(id)),target=idx+delta;
  if(idx<0||target<0||target>=ordered.length)return;
  const a=ordered[idx],b=ordered[target];
  const r=await supabase.rpc("tracker_reorder_tasks",{p_task_id:String(a.id),p_other_task_id:String(b.id)});
  if(r.error){showToast(`Could not reorder: ${r.error.message}`);return;}
  await loadTasks();tasks.forEach(saveCustomTaskSnapshot);renderTaskManager();renderToday();renderSetupSummary();showToast("Order updated");
}

function openMissionModal(){$("#missionStartDate").value=mission?.start_date||dateKeyInIST();$("#missionModal").classList.add("open");$("#missionModal").setAttribute("aria-hidden","false");}
function closeMissionModal(){$("#missionModal").classList.remove("open");$("#missionModal").setAttribute("aria-hidden","true");}
async function saveMissionStart(e){
  e.preventDefault();
  const start=$("#missionStartDate").value;
  if(!start)return;
  const r=await supabase.from("missions").update({start_date:start}).eq("id",mission.id).eq("user_id",user.id);
  if(r.error){showToast(`Could not change mission start: ${r.error.message}`);return;}
  mission={...mission,start_date:start};
  selectedDate=dateKeyInIST();
  today=await getDay(selectedDate);
  closeMissionModal();
  renderToday();
  renderSetupSummary();
  await refreshStats();
  showToast("Mission start updated");
}

function celebrationKey(kind, date=today?.date){
  const missionStart=mission?.start_date||"mission";
  return `tracker-celebration-v1-${user?.id||"anon"}-${missionStart}-${kind}-${date}`;
}
function celebrationWasShown(kind,date){return localStorage.getItem(celebrationKey(kind,date))==="1";}
function markCelebrationShown(kind,date){localStorage.setItem(celebrationKey(kind,date),"1");}
function buildConfetti(count=95){
  const box=$("#celebrationConfetti"); if(!box)return;
  box.innerHTML="";
  const palette=["#ffd85f","#63d9ae","#7c9cff","#ff79c8","#ff9d5c","#8ce7ff","#ffffff"];
  for(let i=0;i<count;i++){
    const el=document.createElement("span");
    el.className=`confetti-piece ${i%7===0?"ribbon":""}`;
    el.style.setProperty("--left",`${Math.random()*100}%`);
    el.style.setProperty("--w",`${5+Math.random()*8}px`);
    el.style.setProperty("--h",`${7+Math.random()*16}px`);
    el.style.setProperty("--c",palette[Math.floor(Math.random()*palette.length)]);
    el.style.setProperty("--dx",`${-260+Math.random()*520}px`);
    el.style.setProperty("--rot",`${-900+Math.random()*1800}deg`);
    el.style.setProperty("--dur",`${2.4+Math.random()*2.5}s`);
    el.style.setProperty("--delay",`${Math.random()*.9}s`);
    box.appendChild(el);
  }
}
function buildFireworks(count=7){
  const box=$("#celebrationFireworks"); if(!box)return;
  box.innerHTML="";
  const palette=["#ffd85f","#ff79c8","#7c9cff","#63d9ae","#8ce7ff","#ffffff"];
  for(let i=0;i<count;i++){
    const fw=document.createElement("div"); fw.className="firework";
    fw.style.setProperty("--fx",`${12+Math.random()*76}%`);
    fw.style.setProperty("--fy",`${8+Math.random()*48}%`);
    fw.style.setProperty("--fdelay",`${Math.random()*.8}s`);
    for(let j=0;j<14;j++){
      const dot=document.createElement("i"); dot.className="firework-dot";
      dot.style.setProperty("--angle",`${j*360/14}deg`);
      dot.style.setProperty("--fdist",`${48+Math.random()*85}px`);
      dot.style.setProperty("--fc",palette[Math.floor(Math.random()*palette.length)]);
      fw.appendChild(dot);
    }
    box.appendChild(fw);
  }
}
function buildBalloons(count=13){
  const box=$("#celebrationBalloons"); if(!box)return;
  box.innerHTML="";
  const palette=["#ff79c8","#7c9cff","#63d9ae","#ffd85f","#ff9d5c","#8ce7ff"];
  for(let i=0;i<count;i++){
    const b=document.createElement("span"); b.className="balloon";
    b.style.setProperty("--bx",`${Math.random()*96}%`);
    b.style.setProperty("--bs",`${30+Math.random()*34}px`);
    b.style.setProperty("--bc",palette[Math.floor(Math.random()*palette.length)]);
    b.style.setProperty("--bd",`${5.5+Math.random()*3.5}s`);
    b.style.setProperty("--bdelay",`${Math.random()*1.4}s`);
    box.appendChild(b);
  }
}
function buildSparkles(count=55){
  const box=$("#celebrationSparkles");if(!box)return;box.innerHTML="";
  const palette=["#fff4ae","#ffffff","#8ce7ff","#ffb4ef","#7be6bd","#ffd85f"];
  for(let i=0;i<count;i++){const el=document.createElement("i");el.className="sparkle";el.style.setProperty("--sx",`${Math.random()*100}%`);el.style.setProperty("--sy",`${Math.random()*100}%`);el.style.setProperty("--ss",`${2+Math.random()*5}px`);el.style.setProperty("--sc",palette[Math.floor(Math.random()*palette.length)]);el.style.setProperty("--sd",`${1.2+Math.random()*2.4}s`);el.style.setProperty("--sdelay",`${Math.random()*1.8}s`);box.appendChild(el);}
}
function buildRays(count=14){
  const box=$("#celebrationRays");if(!box)return;box.innerHTML="";
  for(let i=0;i<count;i++){const el=document.createElement("i");el.className="ray";el.style.setProperty("--ra",`${i*(360/count)+Math.random()*8}deg`);el.style.setProperty("--rd",`${Math.random()*1.3}s`);box.appendChild(el);}
}
function buildBurstRings(count=4){
  const box=$("#celebrationBursts");if(!box)return;box.innerHTML="";
  for(let i=0;i<count;i++){const el=document.createElement("i");el.className="burst-ring";el.style.setProperty("--rb",`${i*.55}s`);box.appendChild(el);}
}
function openCelebration(kind,data){
  const overlay=$("#celebrationOverlay"); if(!overlay)return;
  const isWeekly=kind==="weekly", isFinal=kind==="final";
  overlay.className=`celebration-overlay open ${isWeekly?"weekly":""} ${isFinal?"final":""}`;
  overlay.setAttribute("aria-hidden","false");
  document.body.classList.add("celebration-lock");
  $("#celebrationIcon").textContent=isFinal?"🏆":isWeekly?"🎂":"🎉";
  $("#celebrationKicker").textContent=isFinal?"MISSION COMPLETE":isWeekly?"7-DAY MILESTONE":"DAILY VICTORY";
  $("#celebrationTitle").textContent=isFinal?"100-DAY MISSION COMPLETE!":isWeekly?"WEEK COMPLETE!":`DAY ${data.dayNo} COMPLETE!`;
  $("#celebrationSubtitle").textContent=isFinal?"YOU FINISHED THE ENTIRE MISSION":isWeekly?"7 DAYS OF CONSISTENCY — 100% COMPLETED":"100% OF TODAY'S WORK DONE";
  $("#celebrationStats").innerHTML=`<div class="celebration-stat"><b>${data.completedTasks}/${data.totalTasks}</b><span>tasks completed</span></div><div class="celebration-stat"><b>${fmtMinutes(data.completedMinutes)}</b><span>focused time</span></div>` + (isWeekly||isFinal?`<div class="celebration-stat"><b>${isFinal?"100 / 100":"7 / 7"}</b><span>${isFinal?"mission days":"days completed"}</span></div><div class="celebration-stat"><b>${data.dayNo}</b><span>current day</span></div>`:"");
  $("#celebrationMessage").textContent=isFinal?"You stayed with it for the full 100 days. That is a serious achievement.":isWeekly?"One whole week completed. Take the win — then build the next one.":"You showed up. You finished. Keep the momentum going.";
  $("#celebrationBadges").innerHTML=isFinal?'<span class="celebration-badge">🏆 100-DAY FINISHER</span><span class="celebration-badge">🔥 CONSISTENCY</span><span class="celebration-badge">💎 DISCIPLINE</span>':isWeekly?'<span class="celebration-badge">🎈 7 DAYS STRONG</span><span class="celebration-badge">🎊 WEEK COMPLETE</span><span class="celebration-badge">🔥 KEEP GOING</span>':'<span class="celebration-badge">✅ 100% DONE</span><span class="celebration-badge">🔥 MOMENTUM</span>';
  $("#celebrationContinueBtn").textContent=isFinal?"FINISH →":isWeekly?"START NEXT WEEK →":"CONTINUE →";
  $("#celebrationNext").textContent=isFinal?"THIS MISSION BELONGS TO YOU":isWeekly?`DAY ${Math.min(data.dayNo+1,100)} STARTS THE NEXT CHAPTER`:`DAY ${Math.min(data.dayNo+1,100)} IS NEXT`;
  buildConfetti(isWeekly?190:isFinal?220:130); buildFireworks(isWeekly?12:isFinal?16:8); buildBalloons(isWeekly?24:0); buildSparkles(isWeekly?95:isFinal?110:65); buildRays(isWeekly?20:isFinal?22:15); buildBurstRings(isWeekly?7:isFinal?9:4);
  if(isWeekly){
    const cake=document.createElement("div");cake.className="party-cake";cake.textContent="🎂";$("#celebrationBalloons").appendChild(cake);
  }
  if(isFinal){
    const cake=document.createElement("div");cake.className="party-cake";cake.textContent="🏆";$("#celebrationBalloons").appendChild(cake);
  }
  markCelebrationShown(kind,data.date);
  setTimeout(()=>$("#celebrationContinueBtn").focus(),50);
}
function closeCelebration(){
  const overlay=$("#celebrationOverlay"); if(!overlay?.classList.contains("open"))return;
  overlay.classList.add("closing");
  setTimeout(()=>{overlay.classList.remove("open","closing","weekly","final");overlay.setAttribute("aria-hidden","true");document.body.classList.remove("celebration-lock");$("#celebrationConfetti").innerHTML="";$("#celebrationFireworks").innerHTML="";$("#celebrationBalloons").innerHTML="";$("#celebrationSparkles").innerHTML="";$("#celebrationRays").innerHTML="";$("#celebrationBursts").innerHTML="";},330);
}
function isPerfectRow(row){return !!row && row.totalTasks>0 && row.percent===100;}
function weekNumberForDay(dayNo){return Math.floor((dayNo-1)/7)+1;}
function sevenDayWeekIsComplete(dayNo){
  if(dayNo<7)return false;
  const startIndex=dayNo-6;
  for(let i=startIndex;i<=dayNo;i++){
    const date=addDays(mission.start_date,i-1);
    const row=(date===today.date?today:history.find(x=>x.date===date));
    if(!isPerfectRow(row))return false;
  }
  return true;
}
async function maybeCelebratePerfectDay(previousPercent){
  if(!today || today.totalTasks===0 || today.percent<100 || previousPercent>=100)return;
  const dayNo=missionDayNumber(today.date); if(dayNo<1||dayNo>100)return;
  const base={...today,dayNo};
  if(dayNo===100){
    if(!celebrationWasShown("final",today.date))openCelebration("final",base);
    return;
  }
  if(dayNo%7===0 && sevenDayWeekIsComplete(dayNo)){
    if(!celebrationWasShown(`weekly-${weekNumberForDay(dayNo)}`,today.date))openCelebration("weekly",base);
    return;
  }
  if(!celebrationWasShown("daily",today.date))openCelebration("daily",base);
}

async function toggleTask(t,completed){
  const targetDate=today?.date;
  if(!targetDate)return;
  const previousPercent=today.percent;
  const r=await supabase.from("daily_tasks").upsert({user_id:user.id,task_date:targetDate,task_id:t.id,completed,minutes_worked:completed?Number(t.minutes)||0:0,updated_at:new Date().toISOString()},{onConflict:"user_id,task_date,task_id"});
  if(r.error){showToast(`Could not save task: ${r.error.message}`);return;}
  let refreshed=await getDay(targetDate);
  if(refreshed.percent<100 && refreshed.completed){await supabase.from("completed_days").delete().eq("user_id",user.id).eq("task_date",targetDate);refreshed=await getDay(targetDate);}
  if(selectedDate!==targetDate)return;
  today=refreshed; renderToday(); await loadProjects(); await refreshStats();
  if(selectedDate===targetDate && today?.date===targetDate) await maybeCelebratePerfectDay(previousPercent);
}

$("#completeDayBtn").addEventListener("click",async()=>{
  const targetDate=today?.date;
  if(!targetDate || today.totalTasks===0){showToast("Add at least one task first");return;}
  if(today.percent<100){showToast("Finish all tasks to close the day");return;}
  if(today.completed){showToast("Day already completed");return;}
  const r=await supabase.from("completed_days").upsert({user_id:user.id,task_date:targetDate,completed:true,updated_at:new Date().toISOString()},{onConflict:"user_id,task_date"});
  if(r.error){showToast(`Could not complete day: ${r.error.message}`);return;}
  const refreshed=await getDay(targetDate);
  if(selectedDate!==targetDate)return;
  today=refreshed;
  renderToday();
  await loadProjects();
  await refreshStats();
  showToast("Day completed ✓");
});

$("#saveNotes").addEventListener("click",async()=>{
  const targetDate=today?.date;
  if(!targetDate)return;
  const notes=$("#notes").value;
  const r=await supabase.from("daily_notes").upsert({user_id:user.id,task_date:targetDate,notes,updated_at:new Date().toISOString()},{onConflict:"user_id,task_date"});
  if(r.error){alert(r.error.message);return;}
  if(selectedDate===targetDate && today?.date===targetDate)today.notes=notes;
  $("#saveNotes").textContent="Saved ✓"; setTimeout(()=>$("#saveNotes").textContent="Save note",1000);
});

function countPerfectWeeks(rows){
  const byDay=Object.fromEntries(rows.map(x=>[x.date,x]));
  let current=0,best=0;
  const maxWeek=Math.ceil(Math.min(100,100)/7);
  for(let w=1;w<=maxWeek;w++){
    let perfect=true;
    for(let i=0;i<7;i++){
      const dayNo=(w-1)*7+i+1;
      if(dayNo>100) break;
      const date=addDays(mission.start_date,dayNo-1);
      const row=byDay[date];
      if(!row || row.totalTasks<=0 || row.percent<100){perfect=false;break;}
    }
    if(perfect){current++;best=Math.max(best,current);} else current=0;
  }
  return {streak:current,best};
}
function renderWeekDots(){
  const box=$("#weekDots"); if(!box || !mission || !today)return;
  const dayNo=missionDayNumber(today.date);
  const weekStart=Math.floor((Math.max(1,dayNo)-1)/7)*7+1;
  box.innerHTML=Array.from({length:7},(_,i)=>{
    const n=weekStart+i;
    if(n>100)return `<span class="week-dot future" title="Beyond mission"></span>`;
    const date=addDays(mission.start_date,n-1);
    const row=history.find(x=>x.date===date)||(date===today.date?today:null);
    const state=row?.percent===100?"done":row?.percent>0?"partial":"";
    return `<span class="week-dot ${state} ${date===today.date?"current":""}" title="Day ${n}: ${row?row.percent+"%":"Not started"}"></span>`;
  }).join("");
  const label=$("#weekDotsLabel"); if(label) label.textContent=`Week ${Math.ceil(Math.max(1,dayNo)/7)} · ${Array.from({length:7},(_,i)=>weekStart+i).filter(n=>{const d=addDays(mission.start_date,n-1);const r=history.find(x=>x.date===d)||(d===today.date?today:null);return n<=100&&r?.percent===100;}).length}/7`;
}

async function refreshStats(){
  history=await getHistory();
  const completedDays=history.filter(x=>x.totalTasks>0 && x.percent===100).length;
  $("#daysCompleted").textContent=Math.min(completedDays,100);
  $("#daysRemaining").textContent=Math.max(0,100-completedDays);
  $("#missionPercent").textContent=`${Math.min(100,completedDays)}%`;
  $("#missionBar").style.width=`${Math.min(100,completedDays)}%`;
  const totalTasks=history.reduce((s,x)=>s+x.totalTasks,0), doneTasks=history.reduce((s,x)=>s+x.completedTasks,0);
  $("#completionRate").textContent=totalTasks?`${Math.round(doneTasks/totalTasks*100)}%`:"0%";
  const weekly=countPerfectWeeks(history);
  $("#currentStreak").textContent=weekly.streak;
  const badge=$("#weekStreakBadge"); if(badge) badge.textContent=weekly.streak?`🔥 ${weekly.streak} week${weekly.streak===1?"":"s"} strong`:"🔥 Start your week streak";
  renderWeekDots();
  renderHistory(); drawChart();
}

function renderHistory(){
  const box=$("#historyGrid"); box.innerHTML=""; const byDate=Object.fromEntries(history.map(x=>[x.date,x]));
  const realToday=dateKeyInIST();
  const maxHistoryHeat=Math.max(0,...history.map(x=>Number(x.completedMinutes||0)));
  for(let i=0;i<100;i++){
    const date=addDays(mission.start_date,i), x=byDate[date];
    const mins=Number(x?.completedMinutes||0); const state=x?.percent===100?"done":x?.percent>0?"partial":date>realToday?"planned":"";
    const heat=maxHistoryHeat<=0?"heat-0":`heat-${Math.min(5,Math.max(1,Math.ceil(mins/maxHistoryHeat*5)))}`;
    const cell=document.createElement("div"); cell.className=`day-cell ${state} ${heat} ${date===selectedDate?"selected":""}`;
    const label=date>realToday?"Planned":x?`${x.percent}% · ${fmtMinutes(mins)} completed`:"Not started";
    cell.title=`Day ${i+1} · ${date}: ${label}`; cell.innerHTML=`<span>D${i+1}</span>`;
    cell.addEventListener("click",()=>openDayModal(date));
    box.appendChild(cell);
  }
}

function dayTaskBreakdownForChart(date,row){
  const source=row?.tasks?.length?row.tasks:tasks.filter(t=>isTaskScheduled(t,date)).map(t=>({...t,minutes:taskMinutesForDate(t,date),completed:false}));
  const items=source.filter(t=>Number(t.minutes)>0).map(t=>({name:t.name,minutes:Number(t.minutes)||0,completed:!!t.completed,projectName:t.projectName||null}));
  const total=items.reduce((s,t)=>s+t.minutes,0),done=items.filter(t=>t.completed).reduce((s,t)=>s+t.minutes,0);return {items,total,done};
}
function showChartTooltip(day,anchorX){
  const tip=$("#chartTooltip");if(!tip)return;
  const lines=day.breakdown.items.length?day.breakdown.items.map((t,i)=>`<span class="chart-tip-item"><i style="--i:${i}"></i><b>${escapeHtml(t.name)}</b><em>${fmtMinutes(t.minutes)}</em></span>`).join(""):'<span><b>No task scheduled</b><em>—</em></span>';
  tip.innerHTML=`<div class="chart-tip-top"><strong>Day ${day.day}</strong><span>${escapeHtml(formatDate(day.date,{day:"numeric",month:"short",year:"numeric"}))}</span></div><div class="chart-tip-total"><b>${fmtMinutes(day.breakdown.done)}</b><span>${day.percent}% complete · ${fmtMinutes(day.breakdown.total)} planned</span></div><div class="chart-tip-list">${lines}</div>`;
  tip.hidden=false;const wrap=$(".mini-chart-wrap"),scroll=$("#chartScroll");if(!wrap)return;const localX=Math.max(8,Math.min(Math.max(8,wrap.clientWidth-tip.offsetWidth-8),anchorX-(scroll?.scrollLeft||0)-tip.offsetWidth/2));tip.style.left=`${localX}px`;tip.style.top="14px";
}
function hideChartTooltip(){const tip=$("#chartTooltip");if(tip)tip.hidden=true;}
function heatClass(minutes,max){if(minutes<=0)return"heat-0";const ratio=max>0?minutes/max:0;return`heat-${Math.min(5,Math.max(1,Math.ceil(ratio*5)))}`;}
function drawChart(){
  const chart=$("#progressChart");if(!chart||!mission||!today)return;chart.innerHTML="";hideChartTooltip();
  const byDate=Object.fromEntries(history.map(x=>[x.date,x]));byDate[today.date]=today;
  const days=Array.from({length:100},(_,i)=>{const date=addDays(mission.start_date,i),row=byDate[date],breakdown=dayTaskBreakdownForChart(date,row),percent=row?Number(row.percent||0):0;return{day:i+1,date,percent,recorded:!!row,future:date>dateKeyInIST(),breakdown};});
  const maxMinutes=Math.max(0,...days.map(x=>x.breakdown.done));const recorded=days.filter(x=>x.recorded&&x.date<=dateKeyInIST()),average=recorded.length?Math.round(recorded.reduce((s,x)=>s+x.percent,0)/recorded.length):0,best=recorded.reduce((a,x)=>!a||x.percent>a.percent?x:a,null);
  const NS="http://www.w3.org/2000/svg",width=3600,height=340,left=46,right=22,top=24,bottom=58,plotW=width-left-right,plotH=height-top-bottom;const svg=document.createElementNS(NS,"svg");svg.setAttribute("viewBox",`0 0 ${width} ${height}`);svg.setAttribute("width",width);svg.setAttribute("height",height);
  const add=(tag,attrs={},text="")=>{const e=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text)e.textContent=text;svg.appendChild(e);return e;};
  [100,75,50,25,0].forEach(v=>{const y=top+plotH*(1-v/100);add("line",{x1:left,y1:y,x2:width-right,y2:y,class:"chart-grid"});add("text",{x:left-7,y:y+4,class:"chart-axis chart-y"},`${v}%`);});
  days.forEach((p,i)=>{const slot=plotW/100,x=left+i*slot+slot*.18,barW=Math.max(16,slot*.64),clamped=Math.max(0,Math.min(100,p.percent)),barH=plotH*clamped/100,y=top+plotH-barH;add("rect",{x,y:top,width:barW,height:plotH,rx:5,class:"chart-bar-track"});const state=p.percent>=100?"complete":p.percent>0?"partial":p.future&&!p.recorded?"future":"empty";const bar=add("rect",{x,y:y+(barH<3?plotH-3:0),width:barW,height:Math.max(3,barH),rx:6,class:`chart-bar ${state} ${heatClass(p.breakdown.done,maxMinutes)} ${p.date===today.date?"selected-day":""}`});
    const enter=()=>{bar.classList.add("lifted");showChartTooltip(p,x+barW/2);},leave=()=>{bar.classList.remove("lifted");hideChartTooltip();};bar.addEventListener("mouseenter",enter);bar.addEventListener("mouseleave",leave);bar.addEventListener("focus",enter);bar.addEventListener("blur",leave);bar.addEventListener("click",()=>openDayModal(p.date));
    add("text",{x:x+barW/2,y:height-16,class:`chart-axis ${p.date===today.date?"today-label":""}`},`D${p.day}`);if(p.date===today.date)add("rect",{x:x-3,y:top-3,width:barW+6,height:plotH+6,rx:7,class:"today-outline"});
  });
  chart.appendChild(svg);$("#chartStats").innerHTML=`<div><b>${recorded.length}</b><span>days recorded</span></div><div><b>${average}%</b><span>average work</span></div><div><b>${best?best.percent+"%":"—"}</b><span>${best?"best day · D"+best.day:"best day"}</span></div><div><b>${today.percent}%</b><span>view · D${missionDayNumber(today.date)}</span></div>`;
  requestAnimationFrame(()=>{const scroll=$("#chartScroll");if(scroll){const d=missionDayNumber(today.date),progress=(Math.max(1,d)-1)/99;scroll.scrollLeft=Math.max(0,progress*(scroll.scrollWidth-scroll.clientWidth));}});
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
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`study-tracker-backup-${selectedDate||today.date}.json`;a.click();URL.revokeObjectURL(a.href);
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
  const dt=await supabase.from("daily_tasks").select("task_id,completed,minutes_worked").eq("user_id",user.id).eq("completed",true);
  const progressRows=dt.error?[]:(dt.data||[]); const taskMap=Object.fromEntries(allTasks.map(t=>[String(t.id),t])); const progressByProject={};
  progressRows.forEach(row=>{const task=taskMap[String(row.task_id)];if(task?.projectId){progressByProject[String(task.projectId)]=(progressByProject[String(task.projectId)]||0)+Number(row.minutes_worked||0);}});
  projects=(r.data||[]).map(p=>({...p,completed_minutes:progressByProject[String(p.id)]||0})); renderProjects(); window.refreshNewTaskProjectPicker?.();
}
function fmtProjectTime(m){m=Math.max(0,Number(m)||0);const h=Math.floor(m/60),mins=m%60;if(h&&mins)return `${h}h ${mins}m`;if(h)return `${h}h`;return `${mins}m`;}
function renderProjects(){const list=$("#projectsList");if(!list)return;if(!projects.length){list.innerHTML='<div class="projects-empty"><b>No projects yet</b><span>Create your own private project and set its target time.</span></div>';return;}list.innerHTML=projects.map(p=>{const pct=Math.min(100,Math.round((Number(p.completed_minutes||0)/Math.max(1,Number(p.target_minutes)||1))*100));return `<div class="project-row" data-project-id="${escapeHtml(p.id)}"><div class="project-main"><span class="project-dot"></span><div><b>${escapeHtml(p.name)}</b><span class="project-private">PRIVATE · ONLY YOU</span></div></div><div class="project-meta"><span class="project-meta-label">PROGRESS</span><strong>${fmtProjectTime(p.completed_minutes)} / ${fmtProjectTime(p.target_minutes)}</strong><div class="project-progress"><span style="width:${pct}%"></span></div><small>${pct}% complete</small></div><div class="project-actions"><button class="secondary project-edit" type="button">Edit</button><button class="secondary project-delete" type="button">Delete</button></div></div>`;}).join("");list.querySelectorAll('.project-edit').forEach(b=>b.addEventListener('click',()=>openProjectModal(b.closest('.project-row').dataset.projectId)));list.querySelectorAll('.project-delete').forEach(b=>b.addEventListener('click',()=>deleteProject(b.closest('.project-row').dataset.projectId)));}
function openProjectModal(id=null){editingProjectId=id;const p=id?projects.find(x=>String(x.id)===String(id)):null;$("#projectModalTitle").textContent=p?"Edit project":"Create new project";$("#projectName").value=p?.name||"";const total=Math.max(0,Number(p?.target_minutes)||0);$("#projectHours").value=p?Math.floor(total/60):"";$("#projectMinutes").value=p?total%60:"";$("#projectModal").classList.add("open");$("#projectModal").setAttribute("aria-hidden","false");setTimeout(()=>$("#projectName").focus(),0);}
function closeProjectModal(){$("#projectModal").classList.remove("open");$("#projectModal").setAttribute("aria-hidden","true");editingProjectId=null;}
async function saveProject(e){e.preventDefault();const name=$("#projectName").value.trim();let hours=Math.max(0,parseInt($("#projectHours").value,10)||0),minutes=Math.max(0,parseInt($("#projectMinutes").value,10)||0);if(minutes>59){hours+=Math.floor(minutes/60);minutes%=60;}const target_minutes=hours*60+minutes;if(!name){showToast("Enter a project name");return;}if(target_minutes<=0){showToast("Set a target time greater than 0 minutes");return;}const wasEdit=!!editingProjectId;const btn=$("#projectForm button[type=submit]");btn.disabled=true;try{let r;if(editingProjectId)r=await supabase.from("projects").update({name,target_minutes,updated_at:new Date().toISOString()}).eq("id",editingProjectId).eq("user_id",user.id);else r=await supabase.from("projects").insert({user_id:user.id,name,target_minutes}).select("id,name,target_minutes,created_at,updated_at").single();if(r.error)throw r.error;await loadProjects();closeProjectModal();showToast(wasEdit?"Project updated":"Project created");renderTaskManager();}catch(err){showToast(`Could not save project: ${err.message}`);}finally{btn.disabled=false;}}
async function deleteProject(id){const p=projects.find(x=>String(x.id)===String(id));if(!p)return;if(!confirm(`Delete project “${p.name}”? Linked tasks will stay but become unlinked.`))return;const r=await supabase.from("projects").delete().eq("id",id).eq("user_id",user.id);if(r.error){showToast(`Could not delete project: ${r.error.message}`);return;}await loadTasks();await loadProjects();renderTaskManager();today=await getDay(today.date);renderToday();await refreshStats();showToast("Project deleted");}


$("#manageChecklistBtn").addEventListener("click",openChecklistModal);
window.addEventListener("pageshow",()=>clearNewTaskFields());
(function initNewTaskSchedule(){
  const panel=$("#newTaskSchedulePanel"),toggle=$("#newTaskScheduleToggle"),summary=$("#newTaskScheduleSummary"),custom=$("#newTaskCustomDays");
  if(!panel||!toggle||!summary||!custom)return;
  panel.dataset.selectedDays=SCHEDULE_PRESETS.weekdays.join(",");
  renderCustomDayChips(custom,SCHEDULE_PRESETS.weekdays);
  toggle.addEventListener("click",()=>{
    const opening=panel.hidden;
    panel.hidden=!opening;
    toggle.setAttribute("aria-expanded",String(opening));
  });
  panel.querySelectorAll("[data-new-preset]").forEach(btn=>btn.addEventListener("click",()=>{
    const key=btn.dataset.newPreset;
    if(key==="custom"){
      custom.hidden=false;
    }else{
      const selected=SCHEDULE_PRESETS[key].slice();
      panel.dataset.selectedDays=selected.join(",");
      renderCustomDayChips(custom,selected);
      custom.hidden=true;
      summary.textContent=scheduleSummary(selected);
    }
    panel.querySelectorAll("[data-new-preset]").forEach(x=>x.classList.toggle("active",x===btn));
  }));
  custom.addEventListener("click",e=>{
    const chip=e.target.closest(".v14-day-chip");if(!chip)return;
    chip.classList.toggle("active");
    const selected=[...custom.querySelectorAll(".v14-day-chip.active")].map(x=>Number(x.dataset.day)).sort((a,b)=>a-b);
    panel.dataset.selectedDays=selected.join(",");
    summary.textContent=scheduleSummary(selected);
    panel.querySelectorAll("[data-new-preset]").forEach(x=>x.classList.toggle("active",x.dataset.newPreset==="custom"));
  });
})();
$("#addTaskForm").addEventListener("submit",addManagedTask);
(function initNewTaskProjectPicker(){
  const panel=$("#newTaskProjectPanel"),toggle=$("#newTaskProjectToggle"),summary=$("#newTaskProjectSummary"),choices=$("#newTaskProjectChoices");if(!panel||!toggle||!summary||!choices)return;
  panel.dataset.selectedProjectId="";
  const refresh=()=>renderProjectChoices(choices,panel.dataset.selectedProjectId||null);
  toggle.addEventListener("click",()=>{const opening=panel.hidden;document.querySelectorAll(".quick-project-panel,.task-project-panel").forEach(x=>x.hidden=true);panel.hidden=!opening;toggle.setAttribute("aria-expanded",String(opening));refresh();});
  choices.addEventListener("click",e=>{const choice=e.target.closest(".project-choice");if(!choice)return;panel.dataset.selectedProjectId=choice.dataset.projectChoice||"";summary.textContent=panel.dataset.selectedProjectId?(projects.find(p=>String(p.id)===String(panel.dataset.selectedProjectId))?.name||"Project"):"No project";panel.hidden=true;toggle.setAttribute("aria-expanded","false");refresh();});
  window.refreshNewTaskProjectPicker=refresh;
})();
$("#closeChecklistBtn").addEventListener("click",closeChecklistModal);
document.querySelectorAll("[data-close-checklist-modal]").forEach(e=>e.addEventListener("click",closeChecklistModal));
$("#missionSettingsBtn").addEventListener("click",openMissionModal);
$("#missionForm").addEventListener("submit",saveMissionStart);
$("#cancelMissionBtn").addEventListener("click",closeMissionModal);
document.querySelectorAll("[data-close-mission-modal]").forEach(e=>e.addEventListener("click",closeMissionModal));
$("#newProjectBtn").addEventListener("click",()=>openProjectModal());
$("#cancelProjectBtn").addEventListener("click",closeProjectModal);
$("#projectForm").addEventListener("submit",saveProject);
document.querySelectorAll("[data-close-project-modal]").forEach(e=>e.addEventListener("click",closeProjectModal));
document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;if($("#checklistModal").classList.contains("open"))closeChecklistModal();if($("#missionModal").classList.contains("open"))closeMissionModal();if($("#projectModal").classList.contains("open"))closeProjectModal();if($("#dayModal").classList.contains("open"))closeDayModal();});

$("#celebrationContinueBtn").addEventListener("click",closeCelebration);
$("#celebrationOverlay").addEventListener("click",e=>{if(e.target===$("#celebrationOverlay"))closeCelebration();});
document.addEventListener("keydown",e=>{if(e.key==="Escape" && $("#celebrationOverlay")?.classList.contains("open"))closeCelebration();});

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

document.querySelectorAll("#chartRangeNav .chart-range-btn").forEach(btn=>btn.addEventListener("click",()=>{
  const start=Number(btn.dataset.start)||1;
  document.querySelectorAll("#chartRangeNav .chart-range-btn").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active");
  scrollChartToDay(start);
}));
$("#chartScroll")?.addEventListener("scroll",()=>hideChartTooltip());

async function startApp(s){
  session=s;user=s.user;$("#authScreen").classList.add("hidden");$("#appShell").classList.remove("hidden");
  try{await ensureMission();const realToday=dateKeyInIST();const saved=localStorage.getItem(`tracker-selected-date-${user.id}`);const savedNo=saved?missionDayNumber(saved):null;if(realToday<mission.start_date)selectedDate=mission.start_date;else if(saved && savedNo>=1 && savedNo<=100 && saved>=realToday)selectedDate=saved;else selectedDate=realToday;await loadTasks();try{await loadProjects();}catch(projectErr){console.error("Projects unavailable",projectErr);projects=[];renderProjects();}today=await getDay(selectedDate);loadBoosters();renderToday();renderSetupSummary();await refreshStats();}
  catch(e){console.error(e);alert("Could not load your tracker. "+e.message);}
}
function stopApp(){session=null;user=null;mission=null;tasks=[];allTasks=[];customTaskIds=[];projects=[];editingProjectId=null;today=null;selectedDate=null;history=[];$("#appShell").classList.add("hidden");$("#authScreen").classList.remove("hidden");}

supabase.auth.onAuthStateChange(async(_event,s)=>{if(s)await startApp(s);else stopApp();});
(async()=>{const r=await supabase.auth.getSession();if(r.data.session)await startApp(r.data.session);})();
setInterval(async()=>{
  if(!user || !today || !selectedDate) return;
  const freshDate=dateKeyInIST();
  // Only auto-roll the dashboard when the user is actually viewing TODAY.
  // Never kick a user back from a future/work-ahead day.
  if(selectedDate===freshDate && today.date===freshDate){
    try{
      today=await getDay(freshDate);
      loadBoosters();
      renderToday();
      await refreshStats();
    }catch(err){ console.error('Daily refresh failed',err); }
  }
},30000);

})();
