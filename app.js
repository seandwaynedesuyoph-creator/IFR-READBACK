(() => {
  "use strict";

  const ICAO = {
    A:"Alpha",B:"Bravo",C:"Charlie",D:"Delta",E:"Echo",F:"Foxtrot",G:"Golf",H:"Hotel",I:"India",
    J:"Juliett",K:"Kilo",L:"Lima",M:"Mike",N:"November",O:"Oscar",P:"Papa",Q:"Quebec",R:"Romeo",
    S:"Sierra",T:"Tango",U:"Uniform",V:"Victor",W:"Whiskey",X:"X-ray",Y:"Yankee",Z:"Zulu"
  };

  const DIGITS = ["zero","one","two","tree","fower","fife","six","seven","eight","niner"];
  const FIELD_IDS = [...document.querySelectorAll("[data-field]")].map(input => input.id);
  const CALLSIGN_IDS = new Set([
    "callsign","vfrCallsign","taxiCallsign","depCallsign","appCallsign","landCallsign","parkCallsign"
  ]);
  const ALTITUDE_IDS = new Set([
    "altitude","vfrAltitude","depAltitude","appAltitude","cruisingAltitude","vfrCruisingAltitude"
  ]);
  const $ = id => document.getElementById(id);

  const viewNames = {
    vfr:["FLIGHT OPERATIONS","VFR"],
    ifr:["FLIGHT OPERATIONS","IFR"],
    taxi:["FLIGHT OPERATIONS","TAXI"],
    dep:["FLIGHT OPERATIONS","DEP"],
    app:["FLIGHT OPERATIONS","APP"],
    land:["FLIGHT OPERATIONS","LAND"],
    park:["FLIGHT OPERATIONS","PARK"],
    notes:["PERSONAL","NOTES"]
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
    draft:readStored("a24.draft",{}),
    frequencies:readStored("a24.frequencies",{}),
    notes:readStored("a24.notes",[]),
    activeNote:null
  };

  if (!Array.isArray(state.notes)) state.notes = [];
  else state.notes = state.notes.filter(item =>
    item && typeof item === "object" && typeof item.id === "string"
  );

  if (!state.draft || typeof state.draft !== "object" || Array.isArray(state.draft)) state.draft = {};
  if (!state.frequencies || typeof state.frequencies !== "object" || Array.isArray(state.frequencies)) state.frequencies = {};

  const SHARED_FIELDS = [
    ["callsign","vfrCallsign","taxiCallsign","depCallsign","appCallsign","landCallsign","parkCallsign"],
    ["destination","vfrDestination"]
  ];

  const clean = value => String(value || "").trim().replace(/\s+/g," ");

  const isValidFrequency = value => {
    const text = clean(value);
    if (!/^\d{3}(?:\.\d{1,3})?$/.test(text)) return false;
    const frequency = Number(text);
    return frequency >= 118 && frequency <= 136.975;
  };

  const isValidRunway = value => {
    const text = clean(value).toUpperCase().replace(/^(?:RUNWAY|RWY)\s*/,"");
    return /^(0?[1-9]|[12]\d|3[0-6])[LRC]?$/.test(text);
  };

  const isValidAltitude = value =>
    /^(?:FL\d{3}|\d{3}|\d{4,5}(?:\s*(?:FT|FEET))?)$/i.test(clean(value));

  const letters = value =>
    [...clean(value).toUpperCase()].map(char => ICAO[char] || char).join(" ");

  const digits = value =>
    [...String(value || "").replace(/\D/g,"")].map(digit => DIGITS[Number(digit)]).join(" ");

  const speakAlphanumeric = value => String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(token => [...token.toUpperCase()].map(char => {
      if (ICAO[char]) return ICAO[char];
      if (/\d/.test(char)) return DIGITS[Number(char)];
      return char;
    }).join(" "))
    .join(" ");

  function speakRunway(value) {
    return clean(value).replace(/^(?:RUNWAY|RWY)\s*/i,"");
  }

  function delayedClimb(delay,altitude) {
    if (!/^\d+$/.test(delay) || !altitude) return "";
    const minutes = Number(delay);
    if (!Number.isSafeInteger(minutes) || minutes < 1) return "";
    return `After ${delay} minutes, climb to ${altitude}.`;
  }

  function speakFrequency(value) {
    return clean(value);
  }

  function values() {
    return Object.fromEntries(FIELD_IDS.map(id => [
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
    FIELD_IDS.forEach(id => {
      if (typeof state.draft[id] === "string") $(id).value = state.draft[id];
    });

    SHARED_FIELDS.forEach(group => {
      const source = group.find(id => $(id).value) || group[0];
      const value = $(source).value;
      group.forEach(id => { $(id).value = value; });
    });
  }

  function syncSharedField(changedId) {
    const group = SHARED_FIELDS.find(items => items.includes(changedId));
    if (!group) return;
    group.forEach(id => {
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

    return [output.length ? `${output.join(", ")}.` : "",cruiseInstruction]
      .filter(Boolean).join(" ");
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

  const generators = {
    vfr:generateVfr,ifr:generateIfr,taxi:generateTaxi,dep:generateDep,
    app:generateApp,land:generateLand,park:generatePark
  };

  const outputs = {
    vfr:"vfrOutput",ifr:"readbackOutput",taxi:"taxiOutput",
    dep:"depOutput",app:"appOutput",land:"landOutput",park:"parkOutput"
  };

  const validationFields = {
    vfr:{
      required:[["vfrCallsign","Callsign"]],
      runways:["vfrRunway"],
      altitudes:["vfrAltitude","vfrCruisingAltitude"],
      delayedClimb:["vfrCruiseDelay","vfrCruisingAltitude"]
    },
    ifr:{
      required:[
        ["callsign","Callsign"],["route","Flight route"],
        ["runway","Assigned runway"],["altitude","Initial altitude"],
        ["squawk","Squawk"]
      ],
      runways:["runway"],
      altitudes:["altitude","cruisingAltitude"],
      frequencies:["frequency"],
      delayedClimb:["cruiseDelay","cruisingAltitude"]
    },
    taxi:{required:[["taxiCallsign","Callsign"]],altitudes:[]},
    dep:{
      required:[["depCallsign","Callsign"],["depRunway","Assigned runway"]],
      runways:["depRunway"],altitudes:["depAltitude"],frequencies:["depFrequency"]
    },
    app:{
      required:[
        ["appCallsign","Callsign"],["appType","Approach type"],
        ["appRunway","Approach runway"]
      ],
      runways:["appRunway"],altitudes:["appAltitude"]
    },
    land:{
      required:[["landCallsign","Callsign"],["landRunway","Landing runway"]],
      runways:["landRunway"]
    },
    park:{required:[["parkCallsign","Callsign"]],frequencies:["parkFrequency"]}
  };

  const validationResults = {};

  function validateReadback(mode,data) {
    const errors = [];
    const warnings = [];
    const invalidFields = new Set();
    const warningFields = new Set();

    const addError = (field,message) => {
      errors.push(message);
      if (field) invalidFields.add(field);
    };

    const addWarning = (field,message) => {
      warnings.push(message);
      if (field) warningFields.add(field);
    };

    const config = validationFields[mode];

    config.required.forEach(([field,label]) => {
      if (!clean(data[field])) addError(field,`${label} is required for this readback.`);
    });

    config.runways?.forEach(field => {
      if (clean(data[field]) && !isValidRunway(data[field])) {
        addError(field,"Enter a complete runway such as 06 or 06L.");
      }
    });

    config.altitudes?.forEach(field => {
      if (clean(data[field]) && !isValidAltitude(data[field])) {
        addError(field,"Enter a complete altitude such as 020, 3500, or FL350.");
      }
    });

    config.frequencies?.forEach(field => {
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

    if (mode === "taxi" && !clean(data.taxiRoute) &&
      (clean(data.taxiHold) || clean(data.taxiShort) || clean(data.taxiCrossing))) {
      addWarning("taxiRoute","Holding or crossing details may be incomplete without a taxi route.");
    }

    if (config.delayedClimb) {
      const [delayField,altitudeField] = config.delayedClimb;

      if (clean(data[delayField]) &&
        (!/^\d+$/.test(data[delayField]) || Number(data[delayField]) < 1)) {
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
    if (!panel) return;

    panel.className = `validation-panel validation-${result.status.toLowerCase()}`;
    panel.replaceChildren();

    const status = document.createElement("strong");
    status.className = "validation-status";
    status.textContent = result.status;
    panel.appendChild(status);

    const messages = [
      ...result.errors.map(message => ({message,className:"validation-error-message"})),
      ...result.warnings.map(message => ({message,className:"validation-warning-message"}))
    ];

    if (!messages.length) {
      messages.push({
        message:"All checks passed for the entered readback.",
        className:"validation-passed-message"
      });
    }

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

      result.invalidFields.forEach(field => invalidFields.add(field));
      result.warningFields.forEach(field => warningFields.add(field));

      renderValidation(mode,result);
    });

    const information = data.information.toUpperCase().charAt(0);
    if ($("informationPreview")) {
      $("informationPreview").textContent = ICAO[information] || "—";
    }

    FIELD_IDS.forEach(id => {
      $(id).classList.toggle("invalid",invalidFields.has(id));
      $(id).classList.toggle("warning",warningFields.has(id) && !invalidFields.has(id));
    });

    document.querySelectorAll(".view-time").forEach(time => {
      if ($("readbackTime")) time.textContent = $("readbackTime").textContent;
    });
  }

  function updateClock() {
    const now = new Date();
    const hh = String(now.getUTCHours()).padStart(2,"0");
    const mm = String(now.getUTCMinutes()).padStart(2,"0");

    if ($("utcClock")) $("utcClock").textContent = `${hh}:${mm} UTC`;
    if ($("readbackTime")) $("readbackTime").textContent = `${hh}${mm}Z`;
  }

  let toastTimer;

  function toast(message) {
    if (!$("toast") || !$("toastText")) return;

    $("toastText").textContent = message;
    $("toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.remove("show"),2400);
  }

  async function copyOutput(id) {
    updateReadbacks();
    const text = $(id)?.textContent || "";

    if (!text || text.startsWith("Enter ")) {
      toast("Nothing to copy yet");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();

      if (!copied) {
        console.error("Clipboard copy failed.",error);
        toast("Could not copy readback");
        return;
      }
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

    document.querySelectorAll(".view").forEach(node => {
      node.classList.toggle("active",node.id === `${view}View`);
    });

    document.querySelectorAll(".nav-item").forEach(node => {
      node.classList.toggle("active",node.dataset.view === view);

      if (node.dataset.view === view) node.setAttribute("aria-current","page");
      else node.removeAttribute("aria-current");
    });

    if ($("viewEyebrow")) $("viewEyebrow").textContent = viewNames[view][0];
    if ($("viewTitle")) $("viewTitle").textContent = viewNames[view][1];

    if ($("sidebar")) $("sidebar").classList.remove("open");
    if ($("menuButton")) $("menuButton").setAttribute("aria-expanded","false");

    try {
      localStorage.setItem("a24.view",view);
    } catch (error) {
      console.error("Unable to save selected A24 view.",error);
    }

    updateReadbacks();
  }

  function clearFields(ids) {
    ids.forEach(id => {
      if (!$(id)) return;
      $(id).value = "";
      syncSharedField(id);
    });

    if ((ids.includes("frequency") || ids.includes("depFrequency")) &&
      state.frequencies.linkDeparture === true) {
      if ($("depFrequency")) $("depFrequency").value = "";
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
      clearFields([
        "callsign","destination","information","route","runway","altitude",
        "cruiseDelay","cruisingAltitude","frequency","squawk","additional"
      ]);
      $("callsign")?.focus();
    } else {
      const mode = activeView.id.replace("View","");
      clearFields(FIELD_IDS.filter(id => id.startsWith(mode)));
    }

    toast("Session cleared");
  }

  function restoreLinkedDepartureFrequency() {
    if (state.frequencies.linkDeparture === true) {
      const linkedValue = $("frequency")?.value ||
        state.frequencies.departureTower ||
        $("depFrequency")?.value ||
        state.frequencies.depFrequency || "";

      if ($("depFrequency")) $("depFrequency").value = linkedValue;
      if ($("frequency")) $("frequency").value = linkedValue;

      state.frequencies.departureTower = linkedValue;
      state.frequencies.depFrequency = linkedValue;
    }
  }

  function saveFrequencies() {
    try {
      localStorage.setItem("a24.frequencies",JSON.stringify(state.frequencies));
    } catch (error) {
      console.error("Unable to save A24 frequencies.",error);
      toast("Could not save frequencies");
    }
  }

  function renderNotes() {
    const list = $("notesList");
    if (!list) return;

    list.replaceChildren();

    if (!state.notes.length) {
      addText(list,"div","No notes yet. Create one to keep personal flight notes here.","history-empty");
    }

    state.notes.forEach(note => {
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
    const note = state.notes.find(item => item.id === id);
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

  // Remove only the unwanted buttons.
  function removeUnwantedButtons() {
    document.querySelectorAll("[data-generate]").forEach(button => button.remove());

    document.querySelectorAll("button,[role='button']").forEach(button => {
      const label = (button.textContent || "").trim().replace(/\s+/g," ").toUpperCase();

      if (label === "STYLE" || label === "GENERATE READBACK") {
        button.remove();
      }
    });
  }

  removeUnwantedButtons();

  document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click",() => switchView(button.dataset.view));
  });

  FIELD_IDS.forEach(id => {
    const field = $(id);
    if (!field) return;

    field.addEventListener("input",() => {
      if (id === "information") {
        field.value = field.value.replace(/[^A-Za-z]/g,"").slice(0,1).toUpperCase();
      }

      syncSharedField(id);

      if (state.frequencies.linkDeparture === true &&
        ["frequency","depFrequency"].includes(id)) {
        $("depFrequency").value = field.value;
        $("frequency").value = field.value;
        state.frequencies.departureTower = field.value;
        state.frequencies.depFrequency = field.value;
        saveFrequencies();
      }

      updateReadbacks();
      saveDraft();
    });
  });

  $("clearSessionButton")?.addEventListener("click",clearSession);

  document.querySelectorAll(".clear-mode").forEach(button => {
    button.addEventListener("click",() => {
      const mode = button.dataset.mode;

      if (mode === "ifr") {
        clearFields([
          "callsign","destination","information","route","runway","altitude",
          "cruiseDelay","cruisingAltitude","frequency","squawk","additional"
        ]);
      } else {
        clearFields(FIELD_IDS.filter(id => id.startsWith(mode)));
      }

      toast(`${mode.toUpperCase()} fields cleared`);
    });
  });

  $("newNoteButton")?.addEventListener("click",() => {
    state.activeNote = null;
    $("noteTitle").value = "";
    $("noteBody").value = "";
    $("deleteNoteButton").disabled = true;
    renderNotes();
    $("noteTitle").focus();
  });

  $("noteForm")?.addEventListener("submit",event => {
    event.preventDefault();

    const title = clean($("noteTitle").value) || "Untitled note";
    const body = $("noteBody").value.trim();

    if (state.activeNote) {
      const note = state.notes.find(item => item.id === state.activeNote);
      if (note) Object.assign(note,{title,body,updatedAt:new Date().toISOString()});
    } else {
      const note = {
        id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title,body,createdAt:new Date().toISOString()
      };

      state.notes.unshift(note);
      state.activeNote = note.id;
    }

    if (!saveNotes()) return;

    renderNotes();
    $("deleteNoteButton").disabled = false;
    toast("Note saved");
  });

  $("deleteNoteButton")?.addEventListener("click",() => {
    if (!state.activeNote || !window.confirm("Delete this note?")) return;

    state.notes = state.notes.filter(note => note.id !== state.activeNote);
    state.activeNote = null;
    $("noteTitle").value = "";
    $("noteBody").value = "";
    $("deleteNoteButton").disabled = true;

    if (!saveNotes()) return;

    renderNotes();
    toast("Note deleted");
  });

  // =========================================================
  // INITIALIZE A24
  // =========================================================

  loadDraft();
  restoreLinkedDepartureFrequency();
  renderNotes();
  updateClock();
  setInterval(updateClock,1000);

  const savedView = readStored("a24.view","ifr");
  switchView(Object.hasOwn(viewNames,savedView) ? savedView : "ifr");
  updateReadbacks();

})();

/* ==========================================
   A24 — APPEARANCE CUSTOMIZER
   Gear button retained
========================================== */

(() => {
  "use strict";

  const STORAGE_KEY = "a24.appearance.v1";

  const defaults = {
    color: "#63e6a1",
    background: "oled",
    glow: "subtle",
    animation: "static",
    panels: "glass",
    density: "comfortable"
  };

  let settings = { ...defaults };

  try {
    settings = {
      ...defaults,
      ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
    };
  } catch {
    settings = { ...defaults };
  }

  const root = document.documentElement;

  const style = document.createElement("style");
  style.id = "a24-appearance-styles";

  style.textContent = `
    #a24AppearanceButton {
      width: 38px;
      height: 38px;
      min-width: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 1px solid color-mix(in srgb, var(--green) 25%, transparent);
      border-radius: 11px;
      background: rgba(99,230,161,.055);
      color: var(--green);
      cursor: pointer;
      transition: .2s ease;
      flex-shrink: 0;
    }

    #a24AppearanceButton:hover {
      background: color-mix(in srgb, var(--green) 13%, transparent);
      border-color: var(--green);
      box-shadow: 0 0 18px color-mix(in srgb, var(--green) 15%, transparent);
      transform: translateY(-1px);
    }

    #a24AppearanceButton svg {
      width: 19px;
      height: 19px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.6;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    #a24AppearancePanel {
      position: fixed;
      z-index: 99999;
      top: 76px;
      right: 20px;
      width: min(350px, calc(100vw - 28px));
      max-height: calc(100dvh - 100px);
      overflow-y: auto;
      padding: 21px;
      border: 1px solid rgba(99,230,161,.2);
      border-radius: 18px;
      background: rgba(9,13,13,.97);
      color: #f5f7f6;
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      box-shadow: 0 20px 65px rgba(0,0,0,.55);
      font-family: inherit;
      animation: a24PanelIn .2s ease;
    }

    @keyframes a24PanelIn {
      from { opacity: 0; transform: translateY(-7px); }
      to { opacity: 1; transform: translateY(0); }
    }

    #a24AppearancePanel * {
      box-sizing: border-box;
    }

    .a24-settings-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
    }

    .a24-settings-eyebrow {
      display: block;
      color: var(--green);
      font-size: 9px;
      font-family: monospace;
      letter-spacing: 1.5px;
      margin-bottom: 6px;
    }

    .a24-settings-title {
      margin: 0;
      color: #fff;
      font-size: 21px;
      font-weight: 700;
    }

    #a24AppearanceClose {
      width: 32px;
      height: 32px;
      border: 1px solid #303b37;
      border-radius: 9px;
      background: #151b19;
      color: #fff;
      font-size: 21px;
      cursor: pointer;
    }

    .a24-settings-group {
      margin-bottom: 22px;
    }

    .a24-settings-label {
      display: block;
      margin-bottom: 11px;
      color: #899a92;
      font-family: monospace;
      font-size: 10px;
      letter-spacing: 1px;
    }

    .a24-color-list {
      display: flex;
      align-items: center;
      gap: 13px;
      flex-wrap: wrap;
      padding: 4px;
    }

    .a24-color-option {
      width: 27px;
      height: 27px;
      padding: 0;
      border: 2px solid transparent;
      border-radius: 50%;
      background: var(--swatch);
      cursor: pointer;
    }

    .a24-color-option.selected {
      outline: 2px solid var(--swatch);
      outline-offset: 3px;
    }

    .a24-custom-color {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 15px;
      color: #b9c5bf;
      font-size: 12px;
    }

    .a24-custom-color input {
      width: 35px;
      height: 30px;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
    }

    .a24-settings-select {
      width: 100%;
      height: 41px;
      padding: 0 12px;
      border: 1px solid #293631;
      border-radius: 9px;
      background: #111816;
      color: #f2f5f3;
      font-family: inherit;
      font-size: 13px;
      outline: none;
    }

    .a24-settings-select:focus {
      border-color: var(--green);
    }

    #a24AppearanceReset {
      width: 100%;
      height: 41px;
      border: 1px solid color-mix(in srgb, var(--green) 30%, transparent);
      border-radius: 9px;
      background: color-mix(in srgb, var(--green) 8%, transparent);
      color: var(--green);
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    #a24AppearanceReset:hover {
      background: color-mix(in srgb, var(--green) 15%, transparent);
    }

    :root[data-a24-background="oled"] {
      --bg: #050505;
      --panel: #0d0d0d;
      --panel2: #111111;
    }

    :root[data-a24-background="midnight"] {
      --bg: #080e19;
      --panel: #101a29;
      --panel2: #142236;
    }

    :root[data-a24-background="glass"] {
      --bg: #0b1013;
      --panel: rgba(18,29,32,.88);
      --panel2: rgba(23,38,41,.82);
    }

    :root[data-a24-panels="solid"] .panel,
    :root[data-a24-panels="solid"] .card,
    :root[data-a24-panels="solid"] .output-panel {
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }

    :root[data-a24-panels="transparent"] .panel,
    :root[data-a24-panels="transparent"] .card,
    :root[data-a24-panels="transparent"] .output-panel {
      background: transparent !important;
    }

    :root[data-a24-density="compact"] .panel,
    :root[data-a24-density="compact"] .card {
      padding: 12px;
    }

    :root[data-a24-glow="off"] {
      --a24-glow: 0;
    }

    :root[data-a24-glow="subtle"] {
      --a24-glow: .08;
    }

    :root[data-a24-glow="medium"] {
      --a24-glow: .18;
    }

    :root[data-a24-glow="strong"] {
      --a24-glow: .32;
    }

    :root[data-a24-animation="static"] #a24AppearanceButton {
      animation: none !important;
    }

    :root[data-a24-animation="slow"] #a24AppearanceButton {
      animation: a24SlowGlow 5s ease-in-out infinite;
    }

    :root[data-a24-animation="dynamic"] #a24AppearanceButton {
      animation: a24SlowGlow 2s ease-in-out infinite;
    }

    @keyframes a24SlowGlow {
      0%, 100% { box-shadow: 0 0 0 transparent; }
      50% {
        box-shadow: 0 0 17px color-mix(in srgb, var(--green) 25%, transparent);
      }
    }

    @media (max-width: 560px) {
      #a24AppearancePanel {
        top: 68px;
        right: 10px;
      }
    }
  `;

  document.head.appendChild(style);

  function applySettings() {
    root.style.setProperty("--green", settings.color);
    root.style.setProperty("--view-accent", settings.color);

    root.dataset.a24Background = settings.background;
    root.dataset.a24Glow = settings.glow;
    root.dataset.a24Animation = settings.animation;
    root.dataset.a24Panels = settings.panels;
    root.dataset.a24Density = settings.density;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.warn("A24 appearance settings could not be saved.", error);
    }

    updatePanelControls();
  }

  const button = document.createElement("button");

  button.id = "a24AppearanceButton";
  button.type = "button";
  button.title = "Customize appearance";
  button.setAttribute("aria-label", "Customize appearance");

  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/>
      <path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z"/>
    </svg>
  `;

  const header =
    document.querySelector(".top-actions") ||
    document.querySelector(".topbar") ||
    document.querySelector("header");

  const mobileLayout = window.matchMedia("(max-width: 560px)");
  function placeAppearanceButton() {
    if (mobileLayout.matches) {
      button.style.removeProperty("position");
      button.style.removeProperty("top");
      button.style.removeProperty("right");
      button.style.removeProperty("z-index");
      const mobileBrand = document.querySelector(".topbar .brand");
      if (mobileBrand) mobileBrand.appendChild(button);
      else document.body.appendChild(button);
      return;
    }

    button.style.removeProperty("position");
    button.style.removeProperty("top");
    button.style.removeProperty("right");
    button.style.removeProperty("z-index");
    if (header) header.appendChild(button);
    else document.body.appendChild(button);
  }

  placeAppearanceButton();
  mobileLayout.addEventListener("change", placeAppearanceButton);

  function createPanel() {
    if (document.getElementById("a24AppearancePanel")) {
      closePanel();
      return;
    }

    const panel = document.createElement("div");
    panel.id = "a24AppearancePanel";

    panel.innerHTML = `
      <div class="a24-settings-header">
        <div>
          <span class="a24-settings-eyebrow">A24 CUSTOMIZATION</span>
          <h3 class="a24-settings-title">Appearance</h3>
        </div>
        <button id="a24AppearanceClose" type="button">×</button>
      </div>

      <div class="a24-settings-group">
        <label class="a24-settings-label">ACCENT COLOR</label>

        <div class="a24-color-list">
          <button class="a24-color-option" data-color="#63e6a1" style="--swatch:#63e6a1" title="Green"></button>
          <button class="a24-color-option" data-color="#55c8ff" style="--swatch:#55c8ff" title="Blue"></button>
          <button class="a24-color-option" data-color="#42e8df" style="--swatch:#42e8df" title="Cyan"></button>
          <button class="a24-color-option" data-color="#a78bfa" style="--swatch:#a78bfa" title="Purple"></button>
          <button class="a24-color-option" data-color="#ffad66" style="--swatch:#ffad66" title="Orange"></button>
          <button class="a24-color-option" data-color="#ff6b79" style="--swatch:#ff6b79" title="Red"></button>
        </div>

        <div class="a24-custom-color">
          <input type="color" id="a24CustomColor">
          <span>Custom accent color</span>
        </div>
      </div>

      <div class="a24-settings-group">
        <label class="a24-settings-label">BACKGROUND</label>
        <select class="a24-settings-select" id="a24Background">
          <option value="oled">OLED Black</option>
          <option value="midnight">Midnight Blue</option>
          <option value="glass">Dark Glass</option>
        </select>
      </div>

      <div class="a24-settings-group">
        <label class="a24-settings-label">GLOW INTENSITY</label>
        <select class="a24-settings-select" id="a24Glow">
          <option value="off">Off</option>
          <option value="subtle">Subtle</option>
          <option value="medium">Medium</option>
          <option value="strong">Strong</option>
        </select>
      </div>

      <div class="a24-settings-group">
        <label class="a24-settings-label">ANIMATION</label>
        <select class="a24-settings-select" id="a24Animation">
          <option value="static">Static</option>
          <option value="slow">Slow Flow</option>
          <option value="dynamic">Dynamic Flow</option>
        </select>
      </div>

      <div class="a24-settings-group">
        <label class="a24-settings-label">PANEL STYLE</label>
        <select class="a24-settings-select" id="a24Panels">
          <option value="glass">Glass</option>
          <option value="solid">Solid</option>
          <option value="transparent">Transparent</option>
        </select>
      </div>

      <div class="a24-settings-group">
        <label class="a24-settings-label">LAYOUT DENSITY</label>
        <select class="a24-settings-select" id="a24Density">
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </select>
      </div>

      <button id="a24AppearanceReset" type="button">
        Reset appearance
      </button>
    `;

    document.body.appendChild(panel);

    panel.querySelector("#a24AppearanceClose")
      .addEventListener("click", closePanel);

    panel.querySelectorAll("[data-color]").forEach(option => {
      option.addEventListener("click", () => {
        settings.color = option.dataset.color;
        applySettings();
      });
    });

    panel.querySelector("#a24CustomColor")
      .addEventListener("input", event => {
        settings.color = event.target.value;
        applySettings();
      });

    const controls = {
      a24Background: "background",
      a24Glow: "glow",
      a24Animation: "animation",
      a24Panels: "panels",
      a24Density: "density"
    };

    Object.entries(controls).forEach(([id, key]) => {
      panel.querySelector("#" + id).addEventListener("change", event => {
        settings[key] = event.target.value;
        applySettings();
      });
    });

    panel.querySelector("#a24AppearanceReset")
      .addEventListener("click", () => {
        settings = { ...defaults };
        applySettings();
      });

    updatePanelControls();
  }

  function updatePanelControls() {
    const panel = document.getElementById("a24AppearancePanel");
    if (!panel) return;

    panel.querySelector("#a24CustomColor").value = settings.color;
    panel.querySelector("#a24Background").value = settings.background;
    panel.querySelector("#a24Glow").value = settings.glow;
    panel.querySelector("#a24Animation").value = settings.animation;
    panel.querySelector("#a24Panels").value = settings.panels;
    panel.querySelector("#a24Density").value = settings.density;

    panel.querySelectorAll("[data-color]").forEach(option => {
      option.classList.toggle(
        "selected",
        option.dataset.color.toLowerCase() === settings.color.toLowerCase()
      );
    });
  }

  function closePanel() {
    document.getElementById("a24AppearancePanel")?.remove();
  }

  button.addEventListener("click", createPanel);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closePanel();
  });

  applySettings();

})();