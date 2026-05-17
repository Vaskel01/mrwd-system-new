const form = document.querySelector("#ticketForm");
const tabs = document.querySelectorAll(".tab");
const views = {
  submit: document.querySelector("#submitView"),
  tickets: document.querySelector("#ticketsView"),
  advisories: document.querySelector("#advisoriesView"),
};

const fields = {
  concernType: document.querySelector("#concernType"),
  impactLevel: document.querySelector("#impactLevel"),
  duration: document.querySelector("#duration"),
  availability: document.querySelector("#availability"),
  description: document.querySelector("#description"),
  latitude: document.querySelector("#latitude"),
  longitude: document.querySelector("#longitude"),
};

const priorityLabel = document.querySelector("#priorityLabel");
const priorityReason = document.querySelector("#priorityReason");
const scoreFill = document.querySelector("#scoreFill");
const ticketList = document.querySelector("#ticketList");
const openTicketCount = document.querySelector("#openTicketCount");
const priorityCount = document.querySelector("#priorityCount");
const locationButton = document.querySelector("#locationButton");
const locationStatus = document.querySelector("#locationStatus");
const dialog = document.querySelector("#confirmationDialog");
const confirmationTitle = document.querySelector("#confirmationTitle");
const confirmationMessage = document.querySelector("#confirmationMessage");
const closeDialog = document.querySelector("#closeDialog");

const storageKey = "mrwd-service-tickets";
const urgentWords = ["burst", "flood", "unsafe", "contaminated", "emergency", "hospital", "school"];

function getTickets() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || [];
  } catch (error) {
    return [];
  }
}

function saveTickets(tickets) {
  localStorage.setItem(storageKey, JSON.stringify(tickets));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function computePriority() {
  const concernScores = {
    "Pipe leak": 3,
    "No water supply": 3,
    "Low water pressure": 2,
    "Water quality": 4,
    "Meter issue": 1,
    "Billing inquiry": 1,
    "Service advisory": 1,
  };

  const concernScore = concernScores[fields.concernType.value] || 0;
  const impactScore = Number(fields.impactLevel.value || 0);
  const durationScore = Number(fields.duration.value || 0);
  const availabilityScore = Number(fields.availability.value || 0);
  const description = fields.description.value.toLowerCase();
  const sentimentScore = urgentWords.some((word) => description.includes(word)) ? 2 : 0;
  const total = concernScore + impactScore + durationScore + availabilityScore + sentimentScore;

  if (total >= 13) {
    return {
      level: "High",
      badge: "red",
      score: total,
      percent: 100,
      reason: "High priority: issue has strong operational impact or urgent language and should be queued quickly.",
    };
  }

  if (total >= 8) {
    return {
      level: "Medium",
      badge: "amber",
      score: total,
      percent: 68,
      reason: "Medium priority: issue needs scheduled verification and maintenance coordination.",
    };
  }

  if (total > 0) {
    return {
      level: "Low",
      badge: "teal",
      score: total,
      percent: 34,
      reason: "Low priority: report is logged for review, tracking, and possible follow-up.",
    };
  }

  return {
    level: "Waiting for details",
    badge: "teal",
    score: 0,
    percent: 0,
    reason: "Priority will be computed from concern type, service impact, duration, water availability, and urgency words in the report.",
  };
}

function updatePriorityPreview() {
  const priority = computePriority();
  priorityLabel.textContent = priority.score ? `${priority.level} priority` : priority.level;
  priorityReason.textContent = priority.reason;
  scoreFill.style.width = `${priority.percent}%`;
  scoreFill.style.background = priority.badge === "red" ? "#c8553d" : priority.badge === "amber" ? "#b7791f" : "#047c72";
}

function switchView(name) {
  tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === name));
  Object.entries(views).forEach(([key, view]) => view.classList.toggle("is-visible", key === name));

  if (name === "tickets") {
    renderTickets();
  }
}

function makeTicketId() {
  const date = new Date();
  const datePart = date.toISOString().slice(2, 10).replaceAll("-", "");
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `MRWD-${datePart}-${randomPart}`;
}

function getFormData() {
  const data = new FormData(form);
  const priority = computePriority();
  const photo = document.querySelector("#photoEvidence").files[0];

  return {
    id: makeTicketId(),
    accountNumber: data.get("accountNumber"),
    fullName: data.get("fullName"),
    mobileNumber: data.get("mobileNumber"),
    emailAddress: data.get("emailAddress"),
    concernType: data.get("concernType"),
    impactLevel: document.querySelector("#impactLevel option:checked").textContent,
    duration: document.querySelector("#duration option:checked").textContent,
    availability: document.querySelector("#availability option:checked").textContent,
    description: data.get("description"),
    serviceAddress: data.get("serviceAddress"),
    latitude: data.get("latitude"),
    longitude: data.get("longitude"),
    photoName: photo ? photo.name : "No photo attached",
    priority,
    status: "Reported",
    createdAt: new Date().toISOString(),
  };
}

function renderTickets() {
  const tickets = getTickets();
  openTicketCount.textContent = tickets.length;
  priorityCount.textContent = tickets.filter((ticket) => ticket.priority.level === "High").length;

  if (!tickets.length) {
    ticketList.innerHTML = '<div class="empty-state">No tickets yet. Submit a report to see its workflow record here.</div>';
    return;
  }

  ticketList.innerHTML = tickets
    .map((ticket) => {
      const created = new Date(ticket.createdAt).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      });
      const geoId = ticket.latitude && ticket.longitude ? `${ticket.latitude}, ${ticket.longitude}` : "For verification";

      return `
        <article class="ticket-card">
          <header>
            <div>
              <p class="panel-label">${escapeHtml(ticket.id)}</p>
              <h3>${escapeHtml(ticket.concernType)}</h3>
              <p>${escapeHtml(ticket.description)}</p>
            </div>
            <span class="badge ${escapeHtml(ticket.priority.badge)}">${escapeHtml(ticket.priority.level)} priority</span>
          </header>
          <dl>
            <div>
              <dt>Status</dt>
              <dd>${escapeHtml(ticket.status)}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>${escapeHtml(ticket.serviceAddress)}</dd>
            </div>
            <div>
              <dt>Submitted</dt>
              <dd>${escapeHtml(created)}</dd>
            </div>
            <div>
              <dt>Impact</dt>
              <dd>${escapeHtml(ticket.impactLevel)}</dd>
            </div>
            <div>
              <dt>Evidence</dt>
              <dd>${escapeHtml(ticket.photoName)}</dd>
            </div>
            <div>
              <dt>Geo-ID</dt>
              <dd>${escapeHtml(geoId)}</dd>
            </div>
          </dl>
        </article>
      `;
    })
    .join("");
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchView(tab.dataset.tab));
});

["change", "input"].forEach((eventName) => {
  form.addEventListener(eventName, updatePriorityPreview);
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const ticket = getFormData();
  const tickets = [ticket, ...getTickets()];
  saveTickets(tickets);
  renderTickets();

  confirmationTitle.textContent = ticket.id;
  confirmationMessage.textContent = `${ticket.concernType} was logged as ${ticket.priority.level.toLowerCase()} priority. Status: Reported.`;
  dialog.showModal();
  form.reset();
  updatePriorityPreview();
});

form.addEventListener("reset", () => {
  setTimeout(updatePriorityPreview, 0);
});

locationButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    locationStatus.textContent = "Geolocation is not supported. Please enter coordinates manually.";
    return;
  }

  locationStatus.textContent = "Requesting location permission...";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      fields.latitude.value = position.coords.latitude.toFixed(6);
      fields.longitude.value = position.coords.longitude.toFixed(6);
      locationStatus.textContent = "Location captured for geotagged service reporting.";
    },
    () => {
      locationStatus.textContent = "Location was not captured. Manual coordinates are still accepted.";
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
  );
});

closeDialog.addEventListener("click", () => {
  dialog.close();
  switchView("tickets");
});

renderTickets();
updatePriorityPreview();
