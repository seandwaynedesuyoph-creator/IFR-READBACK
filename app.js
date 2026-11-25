(() => {
  "use strict";

  const ICAO = {
    A:"Alpha",B:"Bravo",C:"Charlie",D:"Delta",E:"Echo",F:"Foxtrot",G:"Golf",H:"Hotel",I:"India",
    J:"Juliett",K:"Kilo",L:"Lima",M:"Mike",N:"November",O:"Oscar",P:"Papa",Q:"Quebec",R:"Romeo",
    S:"Sierra",T:"Tango",U:"Uniform",V:"Victor",W:"Whiskey",X:"X-ray",Y:"Yankee",Z:"Zulu"
  };
  const DIGITS = ["zero","one","two","tree","fower","fife","six","seven","eight","niner"];
  const FIELD_IDS = [...document.querySelectorAll("[data-field]")].map((input) => input.id);
  const CALLSIGN_IDS = new Set([
    "callsign","vfrCallsign","taxiCallsign","depCallsign","appCallsign","landCallsign","parkCallsign"
  ]);
  const ALTITUDE_IDS = new Set(["altitude","vfrAltitude","depAltitude","appAltitude","cruisingAltitude","vfrCruisingAltitude"]);
  const $ = (id) => document.getElementById(id);
  const viewNames = {
    vfr:["FLIGHT OPERATIONS","VFR"],ifr:["FLIGHT OPERATIONS","IFR"],
    taxi:["FLIGHT OPERATIONS","TAXI"],dep:["FLIGHT OPERATIONS","DEP"],app:["FLIGHT OPERATIONS","APP"],
    land:["FLIGHT OPERATIONS","LAND"],park:["FLIGHT OPERATIONS","PARK"],notes:["PERSONAL","NOTES"]
  };
  const readStored = (key, fallback) => {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (error) {
      console.error(`Unable to read A24 storage key "${key}".`, error);
      return fallback;
    }
  };
  const state = {
    draft: readStored("a24.draft",{}),
    frequencies: readStored("a24.frequencies",{}),
    notes: readStored("a24.notes",[]),
    activeNote: null
  };
  if (!Array.isArray(state.notes)) state.notes = [];
  else state.notes = state.notes.filter((item) => item && typeof item === "object" && typeof item.id === "string");
  if (!state.draft || typeof state.draft !== "object" || Array.isArray(state.draft)) state.draft = {};
  if (!state.frequencies || typeof state.frequencies !== "object" || Array.isArray(state.frequencies)) state.frequencies = {};
  const SHARED_FIELDS = [
    ["callsign","vfrCallsign","taxiCallsign","depCallsign","appCallsign","landCallsign","parkCallsign"],
    ["destination","vfrDestination"]
  ];
  const clean = (value) => String(value || "").trim().replace(/\s+/g," ");
  const isValidFrequency = (value) => {
    const text = clean(value);
    if (!/^\d{3}(?:\.\d{1,3})?$/.test(text)) return false;
    const frequency = Number(text);
    return frequency >= 118 && frequency <= 136.975;
  };
  const isValidRunway = (value) => {
    const text = clean(value).toUpperCase().replace(/^(?:RUNWAY|RWY)\s*/,"");
    return /^(0?[1-9]|[12]\d|3[0-6])[LRC]?$/.test(text);
  };
  const isValidAltitude = (value) => /^(?:FL\d{3}|\d{3}|\d{4,5}(?:\s*(?:FT|FEET))?)$/i.test(clean(value));
  const letters = (value) => [...clean(value).toUpperCase()].map((char) => ICAO[char] || char).join(" ");
  const digits = (value) => [...String(value || "").replace(/\D/g,"")].map((digit) => DIGITS[Number(digit)]).join(" ");

  const speakAlphanumeric = (value) => String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => [...token.toUpperCase()].map((char) => {
      if (ICAO[char]) return ICAO[char];
      if (/\d/.test(char)) return DIGITS[Number(char)];
      return char;
    }).join(" "))
    .join(" ");
  function speakRunway(value) {
    return clean(value).replace(/^(?:RUNWAY|RWY)\s*/i,"");
  }
  function delayedClimb(delay, altitude) {
    if (!/^\d+$/.test(delay) || !altitude) return "";
    const minutes = Number(delay);
    if (!Number.isSafeInteger(minutes) || minutes < 1) return "";
    return `After ${delay} minutes, climb to ${altitude}.`;
  }
  function speakFrequency(value) {
    return clean(value);
  }
  function values() {
    return Object.fromEntries(FIELD_IDS.map((id) => [
      id,
      CALLSIGN_IDS.has(id) || ALTITUDE_IDS.has(id) ? $(id).value : clean($(id).value)
    ]));
  }
  function saveDraft() {
    try {
      localStorage.setItem("a24.draft",JSON.stringify({...state.draft,...values()}));
    } catch (error) {
      console.error("Unable to save A24 flight draft.",error);
      toast("Could not save this flight draft");
    }
  }
  function loadDraft() {
    FIELD_IDS.forEach((id) => {
      if (typeof state.draft[id] === "string") $(id).value = state.draft[id];
    });
    SHARED_FIELDS.forEach((group) => {
      const source = group.find((id) => $(id).value) || group[0];
      const value = $(source).value;
      group.forEach((id) => { $(id).value = value; });
    });
  }
  function syncSharedField(changedId) {
    const group = SHARED_FIELDS.find((items) => items.includes(changedId));
    if (!group) return;
    group.forEach((id) => {
      if (id !== changedId) $(id).value = $(changedId).value;
    });
  }
  function generateIfr(d) {
    const output = [];
    if (d.callsign) output.push(d.callsign);
    let clearance = d.destination ? `cleared to ${d.destination}` : "";
    if (d.route) clearance += `${clearance ? " via " : "via "}${d.route}`;
    if (clearance) output.push(clearance);
    if (d.altitude) output.push(`climb and maintain ${d.altitude}`);
    if (d.runway) output.push(`runway ${speakRunway(d.runway)} for departure`);
    if (d.frequency) output.push(`departure frequency ${speakFrequency(d.frequency)}`);
    if (/^[0-7]{4}$/.test(d.squawk)) output.push(`squawk ${d.squawk}`);
    const infoLetter = d.information.toUpperCase().charAt(0);
    if (ICAO[infoLetter]) output.push(`information ${ICAO[infoLetter]}`);
    const cruiseInstruction = d.cruiseDelay
      ? delayedClimb(d.cruiseDelay,d.cruisingAltitude)
      : d.cruisingAltitude ? `Cruising altitude ${d.cruisingAltitude}.` : "";
    return [output.length ? `${output.join(", ")}.` : "",cruiseInstruction].filter(Boolean).join(" ");
  }
  function generateVfr(d) {
    const output = [];
    if (d.vfrCallsign) output.push(`${d.vfrCallsign},`);
    if (d.vfrDestination) output.push(`destination ${d.vfrDestination}.`);
    if (d.vfrRoute) output.push(`route / intentions ${d.vfrRoute}.`);
    if (d.vfrRunway) output.push(`runway ${speakRunway(d.vfrRunway)}.`);
    if (d.vfrAltitude) output.push(`altitude ${d.vfrAltitude}.`);
    const cruiseInstruction = delayedClimb(d.vfrCruiseDelay,d.vfrCruisingAltitude);
    if (cruiseInstruction) output.push(cruiseInstruction);
    if (/^[0-7]{4}$/.test(d.vfrSquawk)) output.push(`squawk ${d.vfrSquawk}.`);
    if (d.vfrAdditional) output.push(`${d.vfrAdditional}.`);
    return output.join(" ");
  }
  function generateTaxi(d) {
    const output = [];
    if (d.taxiCallsign) output.push(`${d.taxiCallsign},`);
    if (d.taxiRoute) output.push(`taxi via ${speakAlphanumeric(d.taxiRoute)}.`);
    if (d.taxiHold) output.push(`holding at ${speakAlphanumeric(d.taxiHold)}.`);
    if (d.taxiShort) output.push(`hold short of ${speakRunway(d.taxiShort)}.`);
    if (d.taxiCrossing) output.push(`crossing instructions: ${d.taxiCrossing}.`);
    if (d.taxiOther) output.push(`${d.taxiOther}.`);
    return output.join(" ");
  }
  function generateDep(d) {
    const output = [];
    if (d.depCallsign) output.push(`${d.depCallsign},`);
    if (d.depRunway) output.push(`runway ${speakRunway(d.depRunway)}.`);
    if (d.depInstructions) output.push(`${d.depInstructions}.`);
    if (d.depAltitude) output.push(`altitude ${d.depAltitude}.`);
    if (d.depFrequency) output.push(`departure frequency ${speakFrequency(d.depFrequency)}.`);
    return output.join(" ");
  }
  function generateApp(d) {
    const output = [];
    if (d.appCallsign) output.push(`${d.appCallsign},`);
    if (d.appType) output.push(`${speakAlphanumeric(d.appType)} approach.`);
    if (d.appRunway) output.push(`runway ${speakRunway(d.appRunway)}.`);
    if (d.appAltitude) output.push(`altitude ${d.appAltitude}.`);
    if (d.appInstructions) output.push(`${d.appInstructions}.`);
    return output.join(" ");
  }
  function generateLand(d) {
    const output = [];
    if (d.landCallsign) output.push(`${d.landCallsign},`);
    if (d.landRunway) output.push(`runway ${speakRunway(d.landRunway)}.`);
    if (d.landWind) output.push(`wind ${d.landWind}.`);
    if (d.landInstructions) output.push(`${d.landInstructions}.`);
    return output.join(" ");
  }
  function generatePark(d) {
    const output = [];
    if (d.parkCallsign) output.push(`${d.parkCallsign},`);
    if (d.parkInstructions) output.push(`${d.parkInstructions}.`);
    if (d.parkLocation) output.push(`parking at ${speakAlphanumeric(d.parkLocation)}.`);
    if (d.parkAirport) output.push(`Airport ${speakAlphanumeric(d.parkAirport)}.`);
    if (d.parkFrequency) output.push(`ground frequency ${speakFrequency(d.parkFrequency)}.`);
    return output.join(" ");
  }
  const generators = {vfr:generateVfr,ifr:generateIfr,taxi:generateTaxi,dep:generateDep,app:generateApp,land:generateLand,park:generatePark};
  const outputs = {vfr:"vfrOutput",ifr:"readbackOutput",taxi:"taxiOutput",dep:"depOutput",app:"appOutput",land:"landOutput",park:"parkOutput"};
  const validationFields = {
    vfr:{required:[["vfrCallsign","Callsign"]],runways:["vfrRunway"],altitudes:["vfrAltitude","vfrCruisingAltitude"],delayedClimb:["vfrCruiseDelay","vfrCruisingAltitude"]},
    ifr:{required:[["callsign","Callsign"],["route","Flight route"],["runway","Assigned runway"],["altitude","Initial altitude"],["squawk","Squawk"]],runways:["runway"],altitudes:["altitude","cruisingAltitude"],frequencies:["frequency"],delayedClimb:["cruiseDelay","cruisingAltitude"]},
    taxi:{required:[["taxiCallsign","Callsign"]],altitudes:[]},
    dep:{required:[["depCallsign","Callsign"],["depRunway","Assigned runway"]],runways:["depRunway"],altitudes:["depAltitude"],frequencies:["depFrequency"]},
    app:{required:[["appCallsign","Callsign"],["appType","Approach type"],["appRunway","Approach runway"]],runways:["appRunway"],altitudes:["appAltitude"]},
    land:{required:[["landCallsign","Callsign"],["landRunway","Landing runway"]],runways:["landRunway"]},
    park:{required:[["parkCallsign","Callsign"]],frequencies:["parkFrequency"]}
  };
  const validationResults = {};

  function validateReadback(mode,data) {
    const errors = [];
    const warnings = [];
    const invalidFields = new Set();
    const warningFields = new Set();
    const addError = (field,message) => { errors.push(message); if (field) invalidFields.add(field); };
    const addWarning = (field,message) => { warnings.push(message); if (field) warningFields.add(field); };
    const config = validationFields[mode];

    config.required.forEach(([field,label]) => {
      if (!clean(data[field])) addError(field,`${label} is required for this readback.`);
    });
    config.runways?.forEach((field) => {
      if (clean(data[field]) && !isValidRunway(data[field])) {
        addError(field,"Enter a complete runway such as 06 or 06L.");
      }
    });
    config.altitudes?.forEach((field) => {
      if (clean(data[field]) && !isValidAltitude(data[field])) {
        addError(field,"Enter a complete altitude such as 020, 3500, or FL350.");
      }
    });
    config.frequencies?.forEach((field) => {
      if (clean(data[field]) && !isValidFrequency(data[field])) {
        addError(field,"Enter a frequency from 118.000 to 136.975 with up to three decimal places.");
      }
    });
    const squawkField = mode === "vfr" ? "vfrSquawk" : mode === "ifr" ? "squawk" : null;
    if (squawkField && clean(data[squawkField]) && !/^[0-7]{4}$/.test(data[squawkField])) {
      addError(squawkField,"Squawk must contain exactly four digits from 0 to 7.");
    }
    if (mode === "taxi" && !clean(data.taxiRoute) && !clean(data.taxiOther)) {
      addError("taxiRoute","Enter a taxi route or other assigned taxi instruction.");
    }
    if (mode === "taxi" && !clean(data.taxiRoute) && (clean(data.taxiHold) || clean(data.taxiShort) || clean(data.taxiCrossing))) {
      addWarning("taxiRoute","Holding or crossing details may be incomplete without a taxi route.");
    }
    if (config.delayedClimb) {
      const [delayField,altitudeField] = config.delayedClimb;
      if (clean(data[delayField]) && (!/^\d+$/.test(data[delayField]) || Number(data[delayField]) < 1)) {
        addError(delayField,"Climb delay must be a whole number of minutes greater than zero.");
      }
      if (!!clean(data[delayField]) !== !!clean(data[altitudeField])) {
        addWarning(delayField,"A delayed climb is read back only when both the delay and cruising altitude are provided.");
      }
    }

    const status = errors.length ? "ERROR" : warnings.length ? "WARNING" : "PASSED";
    return {status,errors,warnings,invalidFields,warningFields};
  }
  function renderValidation(mode,result) {
    const panel = $(`${mode}Validation`);
    panel.className = `validation-panel validation-${result.status.toLowerCase()}`;
    panel.replaceChildren();
    const status = document.createElement("strong");
    status.className = "validation-status";
    status.textContent = result.status;
    panel.appendChild(status);
    const messages = [
      ...result.errors.map((message) => ({message,className:"validation-error-message"})),
      ...result.warnings.map((message) => ({message,className:"validation-warning-message"}))
    ];
    if (!messages.length) messages.push({message:"All checks passed for the entered readback.",className:"validation-passed-message"});
    const list = document.createElement("ul");
    messages.forEach(({message,className}) => {
      const item = document.createElement("li");
      item.className = className;
      item.textContent = message;
      list.appendChild(item);
    });
    panel.appendChild(list);
  }

  function updateReadbacks() {
    const data = values();
    const invalidFields = new Set();
    const warningFields = new Set();
    Object.entries(generators).forEach(([mode,generator]) => {
      const target = $(outputs[mode]);
      if (target) target.textContent = generator(data) || "Enter instructions to generate a readback.";
      const result = validateReadback(mode,data);
      validationResults[mode] = result;
      result.invalidFields.forEach((field) => invalidFields.add(field));
      result.warningFields.forEach((field) => warningFields.add(field));
      renderValidation(mode,result);
    });
    const information = data.information.toUpperCase().charAt(0);
    if ($("informationPreview")) $("informationPreview").textContent = ICAO[information] || "—";
    FIELD_IDS.forEach((id) => {
      $(id).classList.toggle("invalid",invalidFields.has(id));
      $(id).classList.toggle("warning",warningFields.has(id) && !invalidFields.has(id));
    });
    document.querySelectorAll(".view-time").forEach((time) => { time.textContent = $("readbackTime").textContent; });
  }
  function updateClock() {
    const now = new Date();
    const hh = String(now.getUTCHours()).padStart(2,"0");
    const mm = String(now.getUTCMinutes()).padStart(2,"0");
    $("utcClock").textContent = `${hh}:${mm} UTC`;
    $("readbackTime").textContent = `${hh}${mm}Z`;
  }
  let toastTimer;
  function toast(message) {
    $("toastText").textContent = message;
    $("toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.remove("show"),2400);
  }
  async function copyOutput(id) {
    updateReadbacks();
    const text = $(id).textContent;
    if (!text || text.startsWith("Enter ")) { toast("Nothing to copy yet"); return; }
    try { await navigator.clipboard.writeText(text); }
    catch (error) {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();
      if (!copied) { console.error("Clipboard copy failed.",error); toast("Could not copy readback"); return; }
    }
    toast("Readback copied");
  }
  function addText(parent,tag,text,className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text;
    parent.appendChild(node);
    return node;
  }
  function switchView(view) {
    if (!viewNames[view]) return;
    document.documentElement.dataset.activeView = view;
    document.querySelectorAll(".view").forEach((node) => node.classList.toggle("active",node.id === `${view}View`));
    document.querySelectorAll(".nav-item").forEach((node) => node.classList.toggle("active",node.dataset.view === view));
    document.querySelectorAll(".nav-item").forEach((node) => {
      if (node.dataset.view === view) node.setAttribute("aria-current","page");
      else node.removeAttribute("aria-current");
    });
    $("viewEyebrow").textContent = viewNames[view][0];
    $("viewTitle").textContent = viewNames[view][1];
    if ($("sidebar")) $("sidebar").classList.remove("open");
    if ($("menuButton")) $("menuButton").setAttribute("aria-expanded","false");
    try { localStorage.setItem("a24.view",view); }
    catch (error) { console.error("Unable to save selected A24 view.",error); }
    updateReadbacks();
  }
  function clearFields(ids) {
    ids.forEach((id) => {
      if (!$(id)) return;
      $(id).value = "";
      syncSharedField(id);
    });
    if ((ids.includes("frequency") || ids.includes("depFrequency")) && state.frequencies.linkDeparture === true) {
      $("depFrequency").value = "";
      state.frequencies.departureTower = "";
      state.frequencies.depFrequency = "";
      saveFrequencies();
    }
    saveDraft();
    updateReadbacks();
  }
  function clearSession() {
    const activeView = document.querySelector(".view.active");
    if (!activeView) return;
    if (activeView.id === "ifrView") {
      clearFields(["callsign","destination","information","route","runway","altitude","cruiseDelay","cruisingAltitude","frequency","squawk","additional"]);
      $("callsign").focus();
    } else {
      const mode = activeView.id.replace("View","");
      clearFields(FIELD_IDS.filter((id) => id.startsWith(mode)));
    }
    toast("Session cleared");
  }
  function restoreLinkedDepartureFrequency() {
    if (state.frequencies.linkDeparture === true) {
      const linkedValue = $("frequency").value || state.frequencies.departureTower || $("depFrequency").value || state.frequencies.depFrequency || "";
      $("depFrequency").value = linkedValue;
      $("frequency").value = linkedValue;
      state.frequencies.departureTower = linkedValue;
      state.frequencies.depFrequency = linkedValue;
    }
  }
  function saveFrequencies() {
    try { localStorage.setItem("a24.frequencies",JSON.stringify(state.frequencies)); }
    catch (error) { console.error("Unable to save A24 frequencies.",error); toast("Could not save frequencies"); }
  }
  function renderNotes() {
    const list = $("notesList");
    list.replaceChildren();
    if (!state.notes.length) addText(list,"div","No notes yet. Create one to keep personal flight notes here.","history-empty");
    state.notes.forEach((note) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `note-item ${note.id === state.activeNote ? "selected" : ""}`;
      button.addEventListener("click",() => selectNote(note.id));
      addText(button,"strong",note.title || "Untitled note");
      const snippet = clean(note.body || "");
      addText(button,"span",snippet.length > 100 ? `${snippet.slice(0,100)}…` : snippet);
      list.appendChild(button);
    });
  }
  function selectNote(id) {
    const note = state.notes.find((item) => item.id === id);
    if (!note) return;
    state.activeNote = id;
    $("noteTitle").value = note.title || "";
    $("noteBody").value = note.body || "";
    $("deleteNoteButton").disabled = false;
    renderNotes();
  }
  function saveNotes() {
    try {
      localStorage.setItem("a24.notes",JSON.stringify(state.notes));
      return true;
    } catch (error) {
      console.error("Unable to save A24 notes.",error);
      toast("Could not save note");
      return false;
    }
  }
  document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click",() => switchView(button.dataset.view)));
  FIELD_IDS.forEach((id) => {
    $(id).addEventListener("input",() => {
      if (id === "information") $(id).value = $(id).value.replace(/[^A-Za-z]/g,"").slice(0,1).toUpperCase();
      syncSharedField(id);
      if (state.frequencies.linkDeparture === true && ["frequency","depFrequency"].includes(id)) {
        $("depFrequency").value = $(id).value;
        $("frequency").value = $(id).value;
        state.frequencies.departureTower = $(id).value;
        state.frequencies.depFrequency = $(id).value;
        saveFrequencies();
      }
      updateReadbacks();
      saveDraft();
    });
  });
  $("clearSessionButton").addEventListener("click",clearSession);
  document.querySelectorAll(".clear-mode").forEach((button) => button.addEventListener("click",() => {
    const mode = button.dataset.mode;
    if (mode === "ifr") {
      clearFields(["callsign","destination","information","route","runway","altitude","cruiseDelay","cruisingAltitude","frequency","squawk","additional"]);
    } else {
      clearFields(FIELD_IDS.filter((id) => id.startsWith(mode)));
    }
    toast(`${mode.toUpperCase()} fields cleared`);
  }));
  document.querySelectorAll("[data-generate]").forEach((button) => button.addEventListener("click",() => {
    const mode = button.dataset.generate;
    updateReadbacks();
    const result = validationResults[mode];
    if (result.status === "ERROR") $(`${mode}Validation`).focus();
    else $(`${mode}ReadbackPanel`).focus();
  }));
  $("newNoteButton").addEventListener("click",() => {
    state.activeNote = null;
    $("noteTitle").value = "";
    $("noteBody").value = "";
    $("deleteNoteButton").disabled = true;
    renderNotes();
    $("noteTitle").focus();
  });
  $("noteForm").addEventListener("submit",(event) => {
    event.preventDefault();
    const title = clean($("noteTitle").value) || "Untitled note";
    const body = $("noteBody").value.trim();
    if (state.activeNote) {
      const note = state.notes.find((item) => item.id === state.activeNote);
      if (note) Object.assign(note,{title,body,updatedAt:new Date().toISOString()});
    } else {
      const note = {id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,title,body,createdAt:new Date().toISOString()};
      state.notes.unshift(note);
      state.activeNote = note.id;
    }
    if (!saveNotes()) return;
    renderNotes();
    $("deleteNoteButton").disabled = false;
    toast("Note saved");
  });
  $("deleteNoteButton").addEventListener("click",() => {
    if (!state.activeNote || !window.confirm("Delete this note?")) return;
    state.notes = state.notes.filter((note) => note.id !== state.activeNote);
    state.activeNote = null;
    $("noteTitle").value = "";
    $("noteBody").value = "";
    $("deleteNoteButton").disabled = true;
    if (!saveNotes()) return;
    renderNotes();
    toast("Note deleted");
  });
  loadDraft();
  restoreLinkedDepartureFrequency();
  renderNotes();
  updateClock();
  setInterval(updateClock,1000);
  const savedView = readStored("a24.view","ifr");
  switchView(Object.hasOwn(viewNames,savedView) ? savedView : "ifr");
  updateReadbacks();
})();
